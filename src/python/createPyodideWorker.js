import HEADLESS_TURTLE_SOURCE from './headless_turtle.py?raw';
const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.4/full/';
const PYODIDE_SCRIPT_URL = `${PYODIDE_INDEX_URL}pyodide.js`;
const PYODIDE_STREAM_CHUNK_CHARS = 2048;
const PYODIDE_TURTLE_SCENE_JSON_LIMIT = 4 * 1024 * 1024;
const PYODIDE_TURTLE_SCENE_PRIMITIVE_LIMIT = 20_000;
const COLLAB_DEBUG_TRACE_LIMIT = 2500;
export const createPyodideWorker = () => {
  const workerSource = `
    let pyodidePromise = null;
    const ensurePyodide = () => {
      if (pyodidePromise) return pyodidePromise;
      pyodidePromise = new Promise((resolve, reject) => {
        try {
          importScripts(${JSON.stringify(PYODIDE_SCRIPT_URL)});
        } catch (err) {
          reject(err);
          return;
        }
        if (!self.loadPyodide) {
          reject(new Error('Pyodide loader not available'));
          return;
        }
        self.loadPyodide({ indexURL: ${JSON.stringify(PYODIDE_INDEX_URL)} })
          .then(resolve)
          .catch(reject);
      });
      return pyodidePromise;
    };

    const toText = (value) => (value == null ? '' : String(value));

    const toBytes = (value) => {
      if (value instanceof Uint8Array) return value;
      if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      }
      if (value instanceof ArrayBuffer) return new Uint8Array(value);
      if (Array.isArray(value)) {
        return Uint8Array.from(value.map((item) => {
          const num = Number(item);
          if (!Number.isFinite(num)) return 0;
          return num & 255;
        }));
      }
      if (typeof value === 'string') {
        try {
          return new TextEncoder().encode(value);
        } catch {
          return new Uint8Array(0);
        }
      }
      return new Uint8Array(0);
    };

    const sanitizeRuntimeFilePath = (value) => {
      const text = toText(value).replace(/\\0/g, '').trim();
      if (!text) return '';
      const parts = text
        .split(/[\\\\/]+/)
        .map((part) => toText(part).trim())
        .filter((part) => part && part !== '.' && part !== '..');
      if (!parts.length) return '';
      return parts.join('/');
    };

    const ensureRuntimeDir = (pyodide, dirPath) => {
      if (!pyodide?.FS || !dirPath) return;
      const parts = String(dirPath).split('/').filter(Boolean);
      let current = '';
      parts.forEach((part) => {
        current = current ? current + '/' + part : part;
        try {
          pyodide.FS.mkdir(current);
        } catch { /* no-op */ }
      });
    };

    let mountedRuntimeFiles = [];
    const clearMountedRuntimeFiles = (pyodide) => {
      if (!pyodide?.FS || !mountedRuntimeFiles.length) {
        mountedRuntimeFiles = [];
        return;
      }
      mountedRuntimeFiles.forEach((name) => {
        try {
          pyodide.FS.unlink(name);
        } catch { /* no-op */ }
      });
      mountedRuntimeFiles = [];
    };

    const mountRuntimeFiles = (pyodide, files) => {
      clearMountedRuntimeFiles(pyodide);
      if (!pyodide?.FS || !Array.isArray(files) || !files.length) return;
      const seen = new Set();
      files.forEach((file) => {
        const safePath = sanitizeRuntimeFilePath(file?.name);
        if (!safePath) return;
        const dedupeKey = safePath.toLowerCase();
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        const bytes = toBytes(file?.bytes);
        const dirPath = safePath.includes('/') ? safePath.slice(0, safePath.lastIndexOf('/')) : '';
        if (dirPath) ensureRuntimeDir(pyodide, dirPath);
        try {
          pyodide.FS.writeFile(safePath, bytes);
          mountedRuntimeFiles.push(safePath);
        } catch { /* no-op */ }
      });
    };

    const createChunkEmitter = (id, type) => {
      const pushChunk = (chunk) => {
        if (!chunk) return;
        self.postMessage({ id, type, chunk });
      };
      const push = (value) => {
        const text = toText(value);
        if (!text) return;
        if (text.length <= ${PYODIDE_STREAM_CHUNK_CHARS}) {
          pushChunk(text);
          return;
        }
        for (let i = 0; i < text.length; i += ${PYODIDE_STREAM_CHUNK_CHARS}) {
          pushChunk(text.slice(i, i + ${PYODIDE_STREAM_CHUNK_CHARS}));
        }
      };
      const close = () => {};
      return { push, close };
    };

    const runPython = async (
      id,
      source,
      inputValue,
      debugMode = false,
      runtimeFiles = [],
      enableTurtle = false
    ) => {
      const pyodide = await ensurePyodide();
      mountRuntimeFiles(pyodide, runtimeFiles);
      const safeInput = toText(inputValue);
      const safeSource = toText(source);
      const useDebugMode = Boolean(debugMode);
      const stdoutEmitter = createChunkEmitter(id, 'stdout');
      const stderrEmitter = createChunkEmitter(id, 'stderr');
      const stdoutDecoder = typeof TextDecoder === 'function' ? new TextDecoder() : null;
      const stderrDecoder = typeof TextDecoder === 'function' ? new TextDecoder() : null;
      let output = '';
      let error = '';
      let debugTrace = [];
      let debugTraceTruncated = false;
      let turtleScene = null;
      let needsInput = false;

      const appendStdout = (value) => {
        const safe = toText(value);
        if (!safe) return;
        output += safe;
        stdoutEmitter.push(safe);
      };

      const appendStderr = (value) => {
        const safe = toText(value);
        if (!safe) return;
        error += safe;
        stderrEmitter.push(safe);
      };

      if (typeof pyodide.setStdout === 'function') {
        pyodide.setStdout({
          write: (buffer) => {
            if (!buffer) return 0;
            const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
            const text = stdoutDecoder
              ? stdoutDecoder.decode(bytes, { stream: true })
              : toText(bytes);
            appendStdout(text);
            return bytes.length;
          }
        });
      }
      if (typeof pyodide.setStderr === 'function') {
        pyodide.setStderr({
          write: (buffer) => {
            if (!buffer) return 0;
            const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
            const text = stderrDecoder
              ? stderrDecoder.decode(bytes, { stream: true })
              : toText(bytes);
            appendStderr(text);
            return bytes.length;
          }
        });
      }

      const wrapped = [
        enableTurtle ? ${JSON.stringify(HEADLESS_TURTLE_SOURCE)} : '',
        'import sys, io, traceback, builtins, json',
        'def _debug_safe_repr(_value, _max_len=220):',
        '    try:',
        '        _text = repr(_value)',
        '    except Exception:',
        '        return "<unreprable>"',
        '    if len(_text) > _max_len:',
        '        return _text[:_max_len] + "..."',
        '    return _text',
        'try:',
        '    sys.stdout.reconfigure(line_buffering=True)',
        '    sys.stderr.reconfigure(line_buffering=True)',
        'except Exception:',
        '    pass',
        'if not hasattr(builtins, "__collab_print_original"):',
        '    builtins.__collab_print_original = builtins.print',
        'def _collab_print(*args, **kwargs):',
        '    kwargs.setdefault("flush", True)',
        '    return builtins.__collab_print_original(*args, **kwargs)',
        'builtins.print = _collab_print',
        '_input = ' + JSON.stringify(safeInput),
        'class _CollabInputNeeded(Exception):',
        '    pass',
        '__collab_needs_input = False',
        '_original_input = builtins.input',
        'def _collab_input(prompt=""):',
        '    global __collab_needs_input',
        '    sys.stdout.write(str(prompt))',
        '    sys.stdout.flush()',
        '    line = sys.stdin.readline()',
        '    if line == "":',
        '        __collab_needs_input = True',
        '        raise _CollabInputNeeded()',
        '    return line.rstrip("\\\\n").rstrip("\\\\r")',
        'builtins.input = _collab_input',
        '_debug_mode = ' + (useDebugMode ? 'True' : 'False'),
        '_source_text = ' + JSON.stringify(safeSource),
        '_source_lines = _source_text.splitlines()',
        '_debug_events = []',
        '_debug_trace_limit = ${COLLAB_DEBUG_TRACE_LIMIT}',
        '_debug_trace_truncated = False',
        'def _debug_capture_locals(_scope):',
        '    _result = []',
        '    for _idx, (_name, _value) in enumerate(_scope.items()):',
        '        if _idx >= 50:',
        '            _result.append({"name": "...", "value": "...", "type": ""})',
        '            break',
        '        _result.append({',
        '            "name": str(_name),',
        '            "value": _debug_safe_repr(_value),',
        '            "type": type(_value).__name__,',
        '        })',
        '    return _result',
        'def _debug_trace(_frame, _event, _arg):',
        '    global _debug_trace_truncated',
        '    if not _debug_mode:',
        '        return _debug_trace',
        '    if _frame.f_code.co_filename != "<collab>":',
        '        return _debug_trace',
        '    if _event == "exception" and _arg and isinstance(_arg[1], SystemExit) and (_arg[1].code is None or _arg[1].code == 0):',
        '        return _debug_trace',
        '    if _event not in ("line", "return", "exception"):',
        '        return _debug_trace',
        '    if len(_debug_events) >= _debug_trace_limit:',
        '        _debug_trace_truncated = True',
        '        return _debug_trace',
        '    _entry = {',
        '        "event": _event,',
        '        "line": int(getattr(_frame, "f_lineno", 0) or 0),',
        '        "func": _frame.f_code.co_name,',
        '        "locals": _debug_capture_locals(_frame.f_locals),',
        '    }',
        '    if _event == "exception" and _arg:',
        '        try:',
        '            _entry["exception"] = f"{_arg[0].__name__}: {_arg[1]}"',
        '        except Exception:',
        '            _entry["exception"] = "Exception"',
        '    _debug_events.append(_entry)',
        '    return _debug_trace',
        'sys.stdin = io.StringIO(_input)',
        '_globals = {}',
        'try:',
        '    if _debug_mode:',
        '        sys.settrace(_debug_trace)',
        '    _compiled = compile(_source_text, "<collab>", "exec")',
        '    exec(_compiled, _globals, _globals)',
        'except _CollabInputNeeded:',
        '    pass',
        'except SystemExit as _exit:',
        '    if _exit.code is not None and _exit.code != 0:',
        '        print(f"SystemExit: {_exit.code}", file=sys.stderr)',
        'except BaseException:',
        '    traceback.print_exc()',
        '    if _debug_mode:',
        '        _exc_type, _exc_value, _tb = sys.exc_info()',
        '        if _tb is not None:',
        '            while _tb.tb_next is not None:',
        '                _tb = _tb.tb_next',
        '            _line_no = int(getattr(_tb, "tb_lineno", 0) or 0)',
        '            if _line_no > 0:',
        '                print(f"\\\\n[DEBUG] Ошибка на строке: {_line_no}")',
        '                if _line_no <= len(_source_lines):',
        '                    print(f"[DEBUG] Код: {_source_lines[_line_no - 1]}")',
        '            _locals_items = list(getattr(_tb.tb_frame, "f_locals", {}).items())',
        '            if _locals_items:',
        '                print("[DEBUG] Локальные переменные:")',
        '                for _idx, (_name, _value) in enumerate(_locals_items):',
        '                    if _idx >= 50:',
        '                        print("  ...")',
        '                        break',
        '                    try:',
        '                        print(f"  {_name} = {repr(_value)}")',
        '                    except Exception:',
        '                        print(f"  {_name} = <unreprable>")',
        'finally:',
        '    sys.settrace(None)',
        '    builtins.print = builtins.__collab_print_original',
        '    builtins.input = _original_input',
        'try:',
        '    __turtle_scene_json = _turtle_export_scene_json()',
        'except Exception:',
        '    __turtle_scene_json = ""',
        '__collab_debug_events = _debug_events if _debug_mode else []',
        '__collab_debug_events_json = json.dumps(__collab_debug_events, ensure_ascii=False)',
        '__collab_debug_truncated = bool(_debug_trace_truncated)',
      ].join('\\n');
      try {
        await pyodide.runPythonAsync(wrapped);
        try {
          const waiting = pyodide.globals.get('__collab_needs_input');
          needsInput = Boolean(waiting && typeof waiting.toJs === 'function' ? waiting.toJs() : waiting);
          waiting?.destroy?.();
        } catch { /* no-op */ }
        if (useDebugMode) {
          let parsedFromJson = false;
          try {
            const traceJsonValue = pyodide.globals.get('__collab_debug_events_json');
            const traceJsonText = traceJsonValue && typeof traceJsonValue.toJs === 'function'
              ? traceJsonValue.toJs()
              : traceJsonValue;
            traceJsonValue?.destroy?.();
            const parsed = typeof traceJsonText === 'string' ? JSON.parse(traceJsonText) : [];
            if (Array.isArray(parsed)) {
              debugTrace = parsed;
              parsedFromJson = true;
            }
          } catch { /* no-op */ }
          try {
            if (!parsedFromJson) {
              const traceValue = pyodide.globals.get('__collab_debug_events');
              if (traceValue) {
                debugTrace = typeof traceValue.toJs === 'function'
                  ? traceValue.toJs({ dict_converter: Object.fromEntries })
                  : traceValue;
                traceValue.destroy?.();
              }
            }
          } catch { /* no-op */ }
          try {
            const truncatedValue = pyodide.globals.get('__collab_debug_truncated');
            debugTraceTruncated = Boolean(
              truncatedValue && typeof truncatedValue.toJs === 'function'
                ? truncatedValue.toJs()
                : truncatedValue
            );
            truncatedValue?.destroy?.();
          } catch { /* no-op */ }
        }
        try {
          const sceneValue = pyodide.globals.get('__turtle_scene_json');
          const sceneText = sceneValue && typeof sceneValue.toJs === 'function'
            ? sceneValue.toJs()
            : sceneValue;
          sceneValue?.destroy?.();
          if (
            typeof sceneText === 'string'
            && sceneText
            && sceneText.length <= ${PYODIDE_TURTLE_SCENE_JSON_LIMIT}
          ) {
            const parsedScene = JSON.parse(sceneText);
            if (parsedScene && typeof parsedScene === 'object' && Array.isArray(parsedScene.primitives)) {
              const primitivesTruncated = parsedScene.primitives.length > ${PYODIDE_TURTLE_SCENE_PRIMITIVE_LIMIT};
              turtleScene = {
                ...parsedScene,
                primitives: parsedScene.primitives.slice(0, ${PYODIDE_TURTLE_SCENE_PRIMITIVE_LIMIT}),
                truncated: parsedScene.truncated === true || primitivesTruncated,
              };
            }
          } else if (typeof sceneText === 'string' && sceneText) {
            appendStderr('\\nРисунок turtle слишком большой и не был показан.\\n');
          }
        } catch { /* no-op */ }
      } catch (err) {
        // A runtime failure must not erase output already sent by the program.
        appendStderr(err && err.message ? err.message : String(err));
      } finally {
        try {
          pyodide.globals.delete('__collab_debug_events');
          pyodide.globals.delete('__collab_debug_events_json');
          pyodide.globals.delete('__collab_debug_truncated');
          pyodide.globals.delete('__collab_needs_input');
          pyodide.globals.delete('__turtle_scene_json');
        } catch { /* no-op */ }
        try {
          if (stdoutDecoder) appendStdout(stdoutDecoder.decode());
          if (stderrDecoder) appendStderr(stderrDecoder.decode());
        } catch { /* no-op */ }
        stdoutEmitter.close();
        stderrEmitter.close();
      }
      return {
        output,
        error,
        turtleScene,
        needsInput,
        debug: useDebugMode
          ? {
            trace: Array.isArray(debugTrace) ? debugTrace : [],
            truncated: Boolean(debugTraceTruncated),
          }
          : null,
      };
    };

    self.onmessage = async (event) => {
      const data = event.data || {};
      const id = data.id;
      if (!id) return;
      try {
        if (data.type === 'warmup') {
          try {
            await ensurePyodide();
            self.postMessage({ id, type: 'ready' });
          } catch (err) {
            self.postMessage({
              id,
              type: 'warmup-error',
              error: err && err.message ? err.message : String(err),
            });
          }
          return;
        }
        const result = await runPython(
          id,
          data.source,
          data.input,
          data.debug,
          data.files,
          data.enableTurtle === true
        );
        if (result?.debug) {
          self.postMessage({
            id,
            type: 'debug-trace',
            trace: Array.isArray(result.debug.trace) ? result.debug.trace : [],
            truncated: Boolean(result.debug.truncated),
          });
        }
        self.postMessage({
          id,
          type: 'result',
          output: result.output,
          error: result.error,
          turtleScene: result.turtleScene,
          needsInput: result.needsInput,
        });
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        self.postMessage({ id, type: 'result', output: '', error: message });
      }
    };
  `;

  const blob = new Blob([workerSource], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
};

