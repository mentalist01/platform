// Experimental, isolated cell protocol. No imports from the production server,
// file-upload sessions, ownership leases or pupil data stores.
import { isDeepStrictEqual } from 'node:util';

export const emptyCell = () => ({ content: { kind: 'empty' }, fill: null });
const properties = ['content', 'fill'];
const copy = value => structuredClone(value);
const same = isDeepStrictEqual;
export const cellKey = (address, property) => `${address}:${property}`;

function validateValue(property, value) {
  if (property === 'fill') {
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > 0xffffff)) throw Error('Invalid cell color');
    return;
  }
  if (!value || typeof value !== 'object' || !['empty', 'number', 'text', 'formula'].includes(value.kind)) throw Error('Invalid cell content');
  if (Object.keys(value).some(key => !['kind', 'value'].includes(key))) throw Error('Unknown content property');
  if (value.kind === 'number' && (typeof value.value !== 'number' || !Number.isFinite(value.value))) throw Error('Invalid cell number');
  if (['text', 'formula'].includes(value.kind) && (typeof value.value !== 'string' || value.value.length > 8192)) throw Error('Invalid cell text');
  // External links, macros, references to untracked cells and structural changes
  // require an explicit production design; this experiment cannot import them.
  if (value.kind === 'formula' && (!value.value.startsWith('=') || /[\[\]{}!|]|https?:|file:|DDE|WEBSERVICE|HYPERLINK/i.test(value.value))) throw Error('Formula outside prototype scope');
}

export class CellRoom {
  constructor(addresses) {
    if (!addresses.length || addresses.length > 256 || new Set(addresses).size !== addresses.length || addresses.some(address => !/^[A-Z]{1,3}[1-9]\d{0,5}$/.test(address))) throw Error('Invalid experimental range');
    this.addresses = addresses;
    this.cells = Object.fromEntries(addresses.map(address => [address, emptyCell()]));
    this.versions = Object.fromEntries(addresses.flatMap(address => properties.map(key => [cellKey(address, key), 0])));
    this.revision = 0;
    this.receipts = new Map();
    this.history = [];
  }

  snapshot() { return copy({ revision: this.revision, cells: this.cells, versions: this.versions }); }

  submit(actor, operations) {
    if (!/^[a-z0-9-]{1,64}$/i.test(actor) || !Array.isArray(operations) || operations.length > 512) throw Error('Invalid operation batch');
    // Validate the entire batch before changing anything.
    const batchIds = new Map();
    for (const op of operations) {
      if (!op || !/^[a-z0-9-]{1,100}$/i.test(op.id) || !this.addresses.includes(op.address) || !properties.includes(op.property) || !Number.isSafeInteger(op.baseVersion) || op.baseVersion < 0) throw Error('Invalid operation');
      validateValue(op.property, op.value);
      if (batchIds.has(op.id) && !same(batchIds.get(op.id), op)) throw Error('Operation id reused within batch');
      batchIds.set(op.id, op);
      const prior = this.receipts.get(`${actor}:${op.id}`);
      if (prior && !same(prior.operation, op)) throw Error('Operation id reused with different data');
    }
    const receipts = [];
    for (const operation of operations) {
      const id = `${actor}:${operation.id}`;
      const previous = this.receipts.get(id);
      if (previous) { receipts.push(copy(previous.result)); continue; }
      const { address, property, value, baseVersion } = operation;
      const key = cellKey(address, property), current = this.cells[address][property];
      let result;
      if (same(current, value)) result = { id: operation.id, status: 'unchanged', version: this.versions[key] };
      else if (this.versions[key] !== baseVersion) result = { id: operation.id, status: 'conflict', current: copy(current), attempted: copy(value), version: this.versions[key] };
      else {
        this.revision++;
        this.cells[address][property] = copy(value);
        this.versions[key] = this.revision;
        result = { id: operation.id, status: 'accepted', version: this.revision };
        this.history.push(copy({ actor, revision: this.revision, ...operation }));
      }
      this.receipts.set(id, { operation: copy(operation), result: copy(result) });
      receipts.push(result);
    }
    return { ...this.snapshot(), receipts };
  }
}

export class LivePeer {
  constructor({ actor, adapter, exchange }) {
    Object.assign(this, { actor, adapter, exchange });
    this.sequence = 0;
    this.baseline = null;
    this.versions = {};
    this.pending = [];
    this.conflicts = new Map();
    this.busy = false;
    this.metrics = { cycles: 0, operations: 0, conflicts: 0, skipped: 0 };
  }

  async initialize() {
    const local = (await this.adapter.request({ type: 'snapshot' })).cells;
    const remote = await this.exchange([]);
    if (!same(local, remote.cells)) throw Error('Prototype only joins identical new workbooks; it never replaces existing work');
    this.baseline = copy(local);
    this.versions = copy(remote.versions);
  }

  async sync() {
    if (this.busy) return false;
    this.busy = true;
    try {
      if (!this.baseline) throw Error('Peer not initialized');
      if (!this.pending.length) {
        const local = (await this.adapter.request({ type: 'snapshot' })).cells;
        for (const [address, cell] of Object.entries(local)) for (const property of properties) {
          const key = cellKey(address, property);
          if (this.conflicts.has(key) || same(cell[property], this.baseline[address][property])) continue;
          this.pending.push({ id: `${this.actor}-${++this.sequence}`, address, property, value: copy(cell[property]), baseVersion: this.versions[key] });
        }
      }
      const response = await this.exchange(copy(this.pending));
      this.metrics.cycles++;
      this.metrics.operations += this.pending.length;
      for (const operation of this.pending) {
        const receipt = response.receipts.find(result => result.id === operation.id);
        if (!receipt) throw Error('Missing operation receipt');
        const key = cellKey(operation.address, operation.property);
        if (receipt.status === 'conflict') {
          this.conflicts.set(key, { ...copy(operation), remote: copy(receipt.current), remoteVersion: receipt.version });
          this.metrics.conflicts++;
        } else this.baseline[operation.address][operation.property] = copy(operation.value);
      }
      this.pending = [];
      const changes = [];
      for (const [address, cell] of Object.entries(response.cells)) for (const property of properties) {
        const key = cellKey(address, property);
        if (this.conflicts.has(key)) continue;
        if (!same(this.baseline[address][property], cell[property])) changes.push({ address, [property]: copy(cell[property]), expected: { [property]: copy(this.baseline[address][property]) } });
        else this.versions[key] = response.versions[key];
      }
      // The adapter compares again at write time. A local edit made while the
      // network request was in flight must never be replaced by stale data.
      if (changes.length) {
        const applied = await this.adapter.request({ type: 'apply', changes });
        const rejected = new Set(applied.skipped.map(item => cellKey(item.address, item.property)));
        this.metrics.skipped += rejected.size;
        for (const change of changes) {
          const property = Object.hasOwn(change, 'content') ? 'content' : 'fill';
          const key = cellKey(change.address, property);
          if (rejected.has(key)) continue;
          this.baseline[change.address][property] = copy(change[property]);
          this.versions[key] = response.versions[key];
        }
      }
      return true;
    } finally { this.busy = false; }
  }

  async resolve(address, property, choice) {
    const key = cellKey(address, property), conflict = this.conflicts.get(key);
    if (!conflict || !['local', 'remote'].includes(choice) || this.busy) throw Error('Invalid conflict resolution');
    if (choice === 'remote') {
      const current = (await this.adapter.request({ type: 'snapshot' })).cells[address][property];
      const result = await this.adapter.request({ type: 'apply', changes: [{ address, [property]: conflict.remote, expected: { [property]: current } }] });
      if (result.skipped.length) throw Error('Cell changed during conflict resolution');
    }
    this.baseline[address][property] = copy(conflict.remote);
    this.versions[key] = conflict.remoteVersion;
    this.conflicts.delete(key);
    await this.sync();
  }
}

export function startLiveLoop(peers, { intervalMs = 350, onStatus = () => {} } = {}) {
  let stopped = false, timer = null, running = Promise.resolve();
  const cycle = async () => {
    if (stopped) return;
    running = Promise.all(peers.map(async peer => {
      try { await peer.sync(); onStatus({ actor: peer.actor, online: true, conflicts: peer.conflicts.size }); }
      catch (error) { onStatus({ actor: peer.actor, online: false, error: error.message }); }
    }));
    await running;
    if (!stopped) timer = setTimeout(cycle, intervalMs);
  };
  void cycle();
  return { async stop() { stopped = true; if (timer) clearTimeout(timer); await running; } };
}
