# Section startup, 16 November 2026

The public production JavaScript dependency graph initially required 2,684,745
bytes for Python, 2,723,701 for progress and 2,761,427 for notes, excluding modules
already required by App. Their gzip transfers were 722,261, 731,663 and 726,570
bytes respectively. These figures describe section modules, not full-page timing.

The main contributor was an eagerly imported 2,179,330-byte editor vendor chunk.
Unused modal imports also initialized the self-hosted editor before a task was
opened. A closed task library in notes imported its editing tools.

## Change

- Load task/review/mock dialogs and the theory recorder when their existing
  render conditions request them. Their props, keys, close handlers and saved
  state contracts remain unchanged.
- Load notes editors and the prepared library's editing canvases on demand.
  The original library button and parent autosave stay mounted.
- Separate the small Monaco React/AMD adapter from the ESM Monaco runtime used
  by collaborative code. Existing imports and runtime identities are retained.
- Keep each loading/error boundary local to the requested tool. Pending loads
  can be closed; a failed load can be retried without reloading the cabinet.
- Check the built static dependency graphs. A build fails if any of the three
  overview sections requires the editor, including through a transitive import
  or re-export, or exceeds its startup budget.

No API caching, permissions, student solutions, progress, payment, lesson timers,
recording, RTC or collaboration synchronization logic changes are included.
Deployment replaces static client files and retains old hashed assets; no
application process restart is required.
