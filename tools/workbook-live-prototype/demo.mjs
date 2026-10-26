import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { openOfficePair } from './adapters.mjs';
import { createRelay } from './relay.mjs';
import { LivePeer, startLiveLoop } from './sync.mjs';

// Opt-in developer demo only: creates two new test books, never opens an
// existing file or connects to the production platform.
const directory = path.resolve(`output/workbook-live-demo-${Date.now()}`);
await fs.mkdir(directory, { recursive: false });
const addresses = Array.from({ length: 8 }, (_, index) => ['A', 'B', 'C', 'D'].map(column => column + (index + 1))).flat();
let offices, relay, loop, closing = false, finish;
const stopped = new Promise(resolve => { finish = resolve; });
const secondsAt = process.argv.indexOf('--seconds');
const seconds = secondsAt < 0 ? 0 : Number(process.argv[secondsAt + 1]);
const lines = readline.createInterface({ input: process.stdin, output: process.stdout });
const stop = async () => {
  if (closing) return;
  closing = true;
  if (loop) await loop.stop();
  if (offices) await offices.close();
  if (relay) await relay.close();
  lines.close(); finish();
};
process.once('SIGINT', stop); process.once('SIGTERM', stop);
try {
  offices = await openOfficePair({ directory, addresses, visible: !process.argv.includes('--hidden') });
  relay = await createRelay(addresses);
  const teacher = new LivePeer({ actor: 'teacher', adapter: offices.excel, exchange: relay.exchange('teacher') });
  const pupil = new LivePeer({ actor: 'pupil', adapter: offices.calc, exchange: relay.exchange('pupil') });
  await Promise.all([teacher.initialize(), pupil.initialize()]);
  await offices.excel.request({ type: 'edit', changes: [
    { address: 'A1', content: { kind: 'text', value: 'Teacher / Student' }, fill: 0xe8dcff },
    { address: 'A2', content: { kind: 'text', value: 'Price' } }, { address: 'B2', content: { kind: 'number', value: 12 } },
    { address: 'A3', content: { kind: 'text', value: 'Quantity' } }, { address: 'B3', content: { kind: 'number', value: 3 } },
    { address: 'A4', content: { kind: 'text', value: 'Total' } }, { address: 'B4', content: { kind: 'formula', value: '=B2*B3' }, fill: 0x72dca0 },
    { address: 'A6', content: { kind: 'text', value: 'Test range: A1:D8' } },
  ] });
  const known = new Map();
  loop = startLiveLoop([teacher, pupil], { onStatus: state => {
    const key = JSON.stringify(state);
    if (known.get(state.actor) !== key) { console.log(JSON.stringify(state)); known.set(state.actor, key); }
  } });
  console.log('LIVE_DEMO_READY: edit B2 in Excel and B3 in LibreOffice. Only A1:D8 is synchronized.');
  console.log('Numbers, text, basic formulas and solid fill only. Do not sort, insert rows, rename sheets or use Undo.');
  console.log('Type stop to close both NEW test books. Your existing documents are not touched.');
  console.log('For a conflict: teacher A1 content local|remote OR pupil A1 content local|remote.');
  await fs.writeFile(path.join(directory, 'ready.json'), JSON.stringify({ addresses, ready: true, directory }));
  lines.on('line', line => {
    if (line.trim() === 'stop') { void stop(); return; }
    const [actor, address, property, choice] = line.trim().split(/\s+/);
    const peer = actor === 'teacher' ? teacher : actor === 'pupil' ? pupil : null;
    if (peer) void peer.resolve(address, property, choice).catch(error => console.log(error.message));
  });
  if (seconds > 0) { const timer = setTimeout(stop, seconds * 1000); stopped.then(() => clearTimeout(timer)); }
  await stopped;
} catch (error) { console.error(error); process.exitCode = 1; await stop(); }
