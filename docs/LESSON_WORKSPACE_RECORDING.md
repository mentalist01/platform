# Lesson workspace changes

## Python input regression

`PythonTestModal.handleRunTests` passes each test's input to `runPythonCode`,
then to the shared `createPyodideWorker` in `src/App.jsx`. The worker installs
`io.StringIO` as stdin and overrides `input()` to support interactive continuation.
That override incorrectly wrote every consumed line to stdout. Removing those
two echo statements fixes both test comparisons and the collaborative console.
Prompts, normal print output, stderr, streaming, and continuation remain intact.
No test data or student solutions are changed; output normalization is unchanged.

Server validation already uses separate stdin/stdout/stderr pipes through
`runChildProcess` and `runPythonSourceForInput` in `server/index.js`, without PTY.

`node --test src/python/workerInput.test.js` runs the actual generated worker
wrapper against CPython (set `PYTHON_EXECUTABLE` if needed). It checks 9/16,
8/8, hello, CRLF, silent input, prompts, separate stderr, and interactive
continuation/debug. It does not emulate the browser's WASM engine.

## Mini-group boards

The original common board keeps its document name. Personal boards use
`board-lesson-<lessonId>~student~<studentId>`, with the same teacher/student
access boundaries as private code tabs. Common board snapshots go to shared
group notes; a personal board snapshot goes only to that student's notes.
Completed lessons remain read-only for students. Membership/status changes
close both shared and personal board/code connections for reauthorization.

## Legacy recording fallback

Legacy capture is disabled by default on the server. The settings response
also disables browser event recording, screen snapshots, audio capture and
journal retries. Existing archives and OBS lesson lifecycle routes still work.

To deliberately restore the old implementation, set
`LEGACY_LESSON_RECORDING_ENABLED=1` in the server environment and restart it.
Teachers with OBS enabled still use OBS. No old recordings are deleted.

Targeted verification:

```
node --test src/python/workerInput.test.js server/learningLessonAccess.test.js server/learningPrivateCollab.integration.test.js server/legacyRecording.test.js server/desktopRecording.integration.test.js
npm run build
```
