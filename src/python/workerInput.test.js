import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';

// Execute the actual generated worker and its Python wrapper. CPython replaces
// only the WASM runtime; stdout/stderr callbacks and result assembly stay real.
const app = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const factory = app.slice(app.indexOf('const createPyodideWorker ='), app.indexOf('const INITIAL_TEST_DB ='));
const fallbackStart = app.indexOf('  const runPythonInMainThread = async (source, inputValue, runtimeFiles = []) => {');
const fallbackFactory = app.slice(fallbackStart, app.indexOf('  const runPythonCode =', fallbackStart));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'python-worker-input-'));
test.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
let workerSource;
vm.runInNewContext(`${factory}\ncreatePyodideWorker();`, {
  PYODIDE_SCRIPT_URL: '', PYODIDE_INDEX_URL: '', PYODIDE_STREAM_CHUNK_CHARS: 2048,
  PYODIDE_TURTLE_SCENE_JSON_LIMIT: 4194304, PYODIDE_TURTLE_SCENE_PRIMITIVE_LIMIT: 20000,
  HEADLESS_TURTLE_SOURCE: '', COLLAB_DEBUG_TRACE_LIMIT: 1500,
  Blob: class { constructor(parts) { workerSource = parts.join(''); } },
  URL: { createObjectURL: () => '', revokeObjectURL() {} }, Worker: class {},
});

const run = async (source, input, options = {}) => {
  const messages = [];
  const metadataPath = path.join(tempRoot, 'metadata.json');
  let stdout;
  let stderr;
  let metadata = {};
  const runtime = {
    setStdout: (sink) => { stdout = sink; },
    setStderr: (sink) => { stderr = sink; },
    globals: { get: (key) => metadata[key], delete() {} },
    async runPythonAsync(wrapped) {
      const scriptPath = path.join(tempRoot, 'run.py');
      // Pyodide uses LF on every host, including Windows.
      fs.writeFileSync(scriptPath, `import sys, json, builtins, _sitebuiltins\nbuiltins.exit = _sitebuiltins.Quitter('exit', '')\nbuiltins.quit = _sitebuiltins.Quitter('quit', '')\nsys.stdout.reconfigure(newline='\\n')\nsys.stderr.reconfigure(newline='\\n')\n${wrapped}\nwith open(${JSON.stringify(metadataPath)}, 'w', encoding='utf-8') as _metadata_file:\n    json.dump({k: v for k, v in globals().copy().items() if k.startswith('__collab_') or k in ('__output', '__error')}, _metadata_file)\n`);
      const result = spawnSync(process.env.PYTHON_EXECUTABLE || 'python', ['-I', '-S', '-B', scriptPath], {
        windowsHide: true, timeout: 10000, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      stdout?.write(new TextEncoder().encode(result.stdout));
      stderr?.write(new TextEncoder().encode(result.stderr));
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      if (options.runtimeFailure) throw new Error('WASM runtime failure');
    },
  };
  if (options.fallback) {
    const runFallback = vm.runInNewContext(`${fallbackFactory}\nrunPythonInMainThread`, {
      ensurePyodideReady: async () => runtime, mountRuntimeFilesInPyodide() {},
    });
    return runFallback(source, input);
  }
  const self = { loadPyodide: async () => runtime, postMessage: (message) => messages.push(message) };
  vm.runInNewContext(workerSource, { self, importScripts() {}, TextDecoder, Uint8Array, ArrayBuffer });
  await self.onmessage({ data: { id: 'test', source, input, ...options } });
  const result = messages.find((message) => message.type === 'result');
  assert.ok(result);
  assert.equal(messages.filter((m) => m.type === 'stdout').map((m) => m.chunk).join(''), result.output);
  assert.equal(messages.filter((m) => m.type === 'stderr').map((m) => m.chunk).join(''), result.error);
  result.debugTrace = messages.find((message) => message.type === 'debug-trace')?.trace;
  return result;
};

const evenNumbers = 'a = int(input())\nb = int(input())\nfor x in range(a, b + 1):\n    if x % 2 == 0:\n        print(x, end=" ")';
for (const [input, expected] of [['9\n16', '10 12 14 16 '], ['8\n8', '8 ']]) {
  test(`autotest input ${JSON.stringify(input)} is never echoed`, async () => {
    const result = await run(evenNumbers, input);
    assert.equal(result.output, expected);
    assert.equal(result.error, '');
    assert.equal(result.needsInput, false);
  });
}
test('input/print produces hello once, including CRLF input', async () => {
  for (const input of ['hello', 'hello\r\n']) {
    const result = await run('a = input()\nprint(a)', input);
    assert.equal(result.output, 'hello\n');
    assert.equal(result.error, '');
  }
});
test('input without print is silent; prompts and stderr remain separate', async () => {
  assert.equal((await run('input()', 'hidden')).output, '');
  const result = await run('import sys\na = input("Number: ")\nprint(a)\nprint("error", file=sys.stderr)', '12');
  assert.equal(result.output, 'Number: 12\n');
  assert.equal(result.error, 'error\n');
});
test('interactive continuation waits for input and reruns without echo', async () => {
  const source = 'a = input("First: ")\nb = input("Second: ")\nprint(a, b)';
  const waiting = await run(source, 'one\n');
  assert.equal(waiting.needsInput, true);
  assert.equal(waiting.output, 'First: Second: ');
  const complete = await run(source, 'one\ntwo\n', { debug: true });
  assert.equal(complete.needsInput, false);
  assert.equal(complete.output, 'First: Second: one two\n');
  assert.equal(complete.error, '');
});

for (const fallback of [false, true]) {
  const mode = fallback ? 'main-thread fallback' : 'worker';
  test(`${mode}: normal Python exits preserve print output and skip subsequent code`, async () => {
    for (const exit of ['exit()', 'quit()', 'exit(0)', 'import sys; sys.exit()', 'import sys; sys.exit(0)', 'raise SystemExit(None)']) {
      const result = await run(`print("before", end="")\n${exit}\nprint("unreachable")`, '', { fallback });
      assert.equal(result.output, 'before', exit);
      assert.equal(result.error, '', exit);
    }
  });
  test(`${mode}: nonzero exits retain output and report their code or message`, async () => {
    for (const [exit, message] of [['exit(2)', '2'], ['raise SystemExit("stop here")', 'stop here']]) {
      const result = await run(`print("before")\n${exit}\nprint("unreachable")`, '', { fallback });
      assert.equal(result.output, 'before\n');
      assert.equal(result.error, `SystemExit: ${message}\n`);
    }
  });
  test(`${mode}: real exceptions and interrupts preserve preceding output`, async () => {
    for (const failure of ['ValueError', 'KeyboardInterrupt', 'BaseException']) {
      const result = await run(`print("before")\nraise ${failure}("problem")`, '', { fallback });
      assert.equal(result.output, 'before\n');
      assert.match(result.error, new RegExp(`${failure}: problem`));
    }
  });
}

test('the lesson example exits its nested loops with the result intact', async () => {
  const source = 'AA = "ЕКМОПРТЬ"\nc = 0\nfor x1 in AA:\n for x2 in AA:\n  for x3 in AA:\n   for x4 in AA:\n    for x5 in AA:\n     s = x1+x2+x3+x4+x5\n     c += 1\n     if x1 != "Е" and s.count("К") == 2:\n      print(c)\n      exit()';
  const result = await run(source, '');
  assert.equal(result.output, '4098\n');
  assert.equal(result.error, '');
});

test('debug stepping treats a successful exit as normal completion and keeps trace', async () => {
  const result = await run('print("done")\nexit()', '', { debug: true });
  assert.equal(result.output, 'done\n');
  assert.equal(result.error, '');
  assert.ok(result.debugTrace.length > 0);
  assert.equal(result.debugTrace.some(entry => entry.exception?.startsWith('SystemExit')), false);
});

test('a runtime failure after stdout does not erase the streamed output', async () => {
  const result = await run('print("saved")', '', { runtimeFailure: true });
  assert.equal(result.output, 'saved\n');
  assert.match(result.error, /WASM runtime failure/);
});
