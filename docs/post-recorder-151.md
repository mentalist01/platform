# Requests after recorder 1.5.1

The October 7 release keeps finance work in the other checkout separate. These changes do not introduce student balance accounts or change payment allocation.

| Request | Result |
| --- | --- |
| Individual lesson pace, as in groups | After a real individual lesson, a pupil answers the 0–100 survey. The teacher roster shows the latest answer and outstanding answers; the pupil history shows dates and both individual/group lessons. See `individual-lesson-pace.md`. |
| Pages containing independent stacks of code tabs | Each page owns its tabs, code, input, files and output. Creation starts blank. Rename, delete and restore affect the page as a whole. Existing rooms retain their original stack on page one. |
| See pupils in private group code without visiting them | Each pupil tab shows an online indicator and current variant. Its tooltip lists the page/variant and whether the pupil is in common or private code. Authenticated socket identities are used, rather than user names supplied by awareness. No private code is returned by the presence API. |
| Concurrent weekly EGE and Python homework | Choose a group in My Schedule, open Homework, and use the usual homework composer. Select EGE/Python, title and an explicit next-week lesson deadline or a manual date. Both assignments persist independently and appear in the pupil's Today view. Checklists, goals, rewards and progress are per assignment/pupil. The quick-start target uses the closest unfinished goal. |
| Disk space and accumulated historical copies | User-approved cleanup removed 41 older release directories and 25 temporary archives, preserving 16 recovery/data checkpoints. Measured free space after cleanup: 20.82 GiB, 56% used. New release snapshots use content-addressed objects independent of live files: identical content is stored once. Successful release staging is temporary and is removed only after all publication checks pass. Existing historical/data snapshots are not automatically purged. |
| Group sharing/OBS overload | Group screen video shares a 7 Mbps aggregate sender budget; cameras share 1.8 Mbps. FPS and maximum dimensions adapt to recipient count, preserving lower poor-connection limits. Peer joins/leaves retune existing senders. The local IVAN100 Lessons OBS profile was changed from 1440p/30 output to 1080p/30, retaining the 1440p capture canvas and NVENC. |

## Verification

- Individual pace: authenticated integration/unit checks and isolated real-app UI checks from the earlier pace change.
- Code pages: legacy data migration without rewrites, independent state, simultaneous/offline edits, delete/restore, restart persistence and room authorization. Real-app page switching, rename/delete/undo, Python execution and narrow dark UI were checked.
- Presence: real authenticated WebSocket clients in separate private documents; teacher connected only to common code. Canonical roster identities survive forged awareness names/IDs, disconnect removes presence, common-code movement is reflected, foreign teachers and pupils receive 403.
- Homework: real API issuance and projection to two pupils, independent deadlines/checklists, foreign-access checks; real-app teacher issuance and pupil goal completion with the second assignment remaining at 0%. A 390 px iframe of the real app had document width 390 px with no horizontal overflow.
- Video: real six-recipient WebRTC sender test accepted the aggregate budget and frame-rate limits. This is a local synthetic screen test, not a full live-class load test.
- OBS: real local two-take recording, pause preview, trim and MP4 export at 1920×1080/30 with AAC audio. Zero skipped encoding frames in the short recording. Saved recorder configuration and existing recording jobs were unchanged. No test video was published. The microphone was quiet during this test, so spoken-word quality was not established.
- Snapshot storage: repeated snapshots share identical content but remain unchanged when live files are overwritten; corrupt objects and reuse of an existing snapshot destination are rejected.

Production publication must additionally pass the release script's idle-lesson preflight, exact published bundle checks, authenticated production read checks, recorder-package verification and unchanged server-process configuration check.
