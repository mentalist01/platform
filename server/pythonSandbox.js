import fs from 'node:fs';
import os from 'node:os';

// AST restrictions are a language policy, not a security boundary. Linux
// executions also use filesystem/network/PID namespaces and a syscall filter.
export const PYTHON_SANDBOX_BOOTSTRAP = `
import resource as _resource
import ctypes as _ctypes
import errno as _errno
_resource.setrlimit(_resource.RLIMIT_AS, (268435456, 268435456))
_resource.setrlimit(_resource.RLIMIT_CPU, (5, 6))
_resource.setrlimit(_resource.RLIMIT_FSIZE, (16777216, 16777216))
_resource.setrlimit(_resource.RLIMIT_NOFILE, (32, 32))
_resource.setrlimit(_resource.RLIMIT_CORE, (0, 0))
_seccomp = _ctypes.CDLL('libseccomp.so.2')
_seccomp.seccomp_init.argtypes = [_ctypes.c_uint32]
_seccomp.seccomp_init.restype = _ctypes.c_void_p
_seccomp.seccomp_syscall_resolve_name.argtypes = [_ctypes.c_char_p]
_seccomp.seccomp_syscall_resolve_name.restype = _ctypes.c_int
_seccomp.seccomp_rule_add.argtypes = [_ctypes.c_void_p, _ctypes.c_uint32, _ctypes.c_int, _ctypes.c_uint]
_seccomp.seccomp_load.argtypes = [_ctypes.c_void_p]
_seccomp.seccomp_release.argtypes = [_ctypes.c_void_p]
_filter = _seccomp.seccomp_init(0x7fff0000)
if not _filter:
    raise RuntimeError('Sandbox initialization failed')
try:
    for _syscall in ('clone', 'clone3', 'fork', 'vfork', 'execve', 'execveat', 'socket', 'socketpair', 'connect', 'bind', 'listen', 'accept', 'accept4', 'ptrace', 'process_vm_readv', 'process_vm_writev', 'mount', 'umount2', 'pivot_root', 'chroot', 'unshare', 'setns', 'bpf', 'userfaultfd', 'keyctl', 'add_key', 'request_key', 'perf_event_open', 'io_uring_setup', 'io_uring_enter', 'io_uring_register', 'open_by_handle_at', 'name_to_handle_at', 'reboot', 'kexec_load', 'kexec_file_load', 'init_module', 'finit_module', 'delete_module'):
        _number = _seccomp.seccomp_syscall_resolve_name(_syscall.encode())
        if _number >= 0 and _seccomp.seccomp_rule_add(_filter, 0x00050000 | _errno.EPERM, _number, 0) != 0:
            raise RuntimeError('Sandbox rule failed')
    if _seccomp.seccomp_load(_filter) != 0:
        raise RuntimeError('Sandbox activation failed')
finally:
    _seccomp.seccomp_release(_filter)
`;

export function pythonSandboxLaunch(runner, script, encodedSource, {
  platform = process.platform, production = process.env.NODE_ENV === 'production', exists = fs.existsSync,
} = {}) {
  if (platform !== 'linux') {
    if (production) throw new Error('Production Python checks require the Linux sandbox');
    return { command: runner.command, args: [...runner.baseArgs, '-I', '-S', '-B', '-c', script, encodedSource], cwd: os.tmpdir() };
  }
  // No fallback to an unsandboxed interpreter if installation or startup fails.
  if (!exists('/usr/bin/bwrap') || !exists('/usr/bin/python3')) throw new Error('Python sandbox is unavailable');
  const args = ['--unshare-all', '--die-with-parent', '--new-session', '--uid', '65534', '--gid', '65534', '--cap-drop', 'ALL', '--clearenv',
    '--ro-bind', '/usr', '/usr'];
  for (const directory of ['/lib', '/lib64']) if (exists(directory)) args.push('--ro-bind', directory, directory);
  args.push('--proc', '/proc', '--dev', '/dev', '--size', '16777216', '--tmpfs', '/tmp', '--chdir', '/tmp',
    '--setenv', 'LANG', 'C.UTF-8', '--setenv', 'HOME', '/tmp',
    '/usr/bin/python3', '-I', '-S', '-B', '-c', `${PYTHON_SANDBOX_BOOTSTRAP}\n${script}`, encodedSource);
  return { command: '/usr/bin/bwrap', args, cwd: '/tmp', detached: true };
}
