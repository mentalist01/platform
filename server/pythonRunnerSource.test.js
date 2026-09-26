import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PYTHON_RUNNER_SCRIPT } from './pythonRunnerSource.js';
import { pythonSandboxLaunch } from './pythonSandbox.js';
const runner = process.platform === 'win32' ? { command: 'py', baseArgs: ['-3'] } : { command: 'python3', baseArgs: [] };
function run(code, input = '') {
  const launch = pythonSandboxLaunch(runner, PYTHON_RUNNER_SCRIPT, Buffer.from(code).toString('base64'));
  return spawnSync(launch.command, launch.args, { input, encoding: 'utf8', cwd: launch.cwd, timeout: 10000 });
}
test('stdin supports EOF, aliases and shared cursor with input without trimming data', () => {
  for (const code of [
    'import sys\nprint(input())\nprint(sys.stdin.read(), end="")',
    'import sys as stream\nprint(input())\nprint(stream.stdin.read(), end="")',
    'from sys import stdin as stream\nprint(input())\nprint(stream.read(), end="")',
    'while True:\n    try:\n        print(input())\n    except EOFError:\n        break',
  ]) {
    const result = run(code, 'Привет\n | \n\n');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.replace(/\r\n/g, '\n'), 'Привет\n | \n\n');
  }
});
test('reading an empty fourth line works but missing fourth line fails', () => {
  const code = 'a=input(); b=input(); c=input(); sep=input(); print(a,b,c,sep=sep)';
  assert.equal(run(code, '1\n2\n3\n\n').stdout.trim(), '123');
  assert.notEqual(run(code, '1\n2\n3\n').status, 0);
});
test('sys facade does not grant module, file, process, or introspection access', () => {
  for (const code of ['import os', 'import sys.modules', 'from sys import modules', 'from sys import *',
    'import sys\nprint(sys.modules)', 'import sys\nsys.exit()', 'open("/etc/passwd")',
    'import sys\nprint(sys.stdin.__class__)', 'print(__import__("os"))',
    'from .sys import stdin', 'import subprocess', 'import socket']) {
    assert.notEqual(run(code).status, 0, code);
  }
});
