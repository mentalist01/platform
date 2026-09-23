import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pythonSandboxLaunch } from './pythonSandbox.js';

test('production cannot fall back when the sandbox is unavailable', () => {
  assert.throws(() => pythonSandboxLaunch({}, '', '', { platform: 'linux', exists: () => false }), /unavailable/);
  assert.throws(() => pythonSandboxLaunch({}, '', '', { platform: 'win32', production: true }), /require/);
});

test('Linux sandbox isolates host files, network and child processes with bounded resources', { skip: process.platform !== 'linux' }, () => {
  const source = `
import os, socket, subprocess, resource
assert os.getuid() == 65534
assert not os.path.exists('/root/app')
assert not os.path.exists('/etc/shadow')
assert resource.getrlimit(resource.RLIMIT_AS) == (268435456, 268435456)
for attempt in (lambda: socket.socket(), lambda: os.fork(), lambda: subprocess.run(['/usr/bin/true'])):
    try:
        attempt()
    except PermissionError:
        pass
    else:
        raise AssertionError('Sandbox allowed a forbidden operation')
print('isolation-ok')
`;
  const launch = pythonSandboxLaunch({}, source, '');
  const result = spawnSync(launch.command, launch.args, { encoding: 'utf8', timeout: 10000, cwd: launch.cwd });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'isolation-ok');
});

test('isolated Python retains separate stdin/stdout/stderr and enforces the memory limit', { skip: process.platform !== 'linux' }, () => {
  for (const [source, input, expected] of [
    ['a=int(input()); b=int(input())\nfor x in range(a,b+1):\n if x%2==0: print(x,end=" ")', '9\n16\n', '10 12 14 16 '],
    ['a=int(input()); b=int(input())\nfor x in range(a,b+1):\n if x%2==0: print(x,end=" ")', '8\n8\n', '8 '],
    ['import sys\na=input(); print(a); print("diagnostic",file=sys.stderr)', 'hello\n', 'hello\n'],
  ]) {
    const launch = pythonSandboxLaunch({}, source, '');
    const result = spawnSync(launch.command, launch.args, { input, encoding: 'utf8', timeout: 10000, cwd: launch.cwd });
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, expected);
    assert.equal(result.stderr, source.includes('diagnostic') ? 'diagnostic\n' : '');
  }
  const launch = pythonSandboxLaunch({}, 'a = bytearray(512 * 1024 * 1024)', '');
  const result = spawnSync(launch.command, launch.args, { encoding: 'utf8', timeout: 10000, cwd: launch.cwd });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /MemoryError/);
});
