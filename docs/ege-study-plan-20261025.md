# EGE preparation canvas · 25 October 2026

Teacher navigation: **Materials → Preparation plan** (`study-plan`). Lazy loaded;
students have neither the navigation route nor access to the API.

The initial route preserves the teacher's sequence. It covers 20 of the 27 tasks;
19–21 share one block. The seven remaining tasks are in the adjacent library.
The topic map follows the FIPI **2027 draft**, including IP masks in 10,
program counts in 13, graph algorithms in 23, and the Turing machine in 12.
The screen links to the official FIPI documents. Unknown part counts (5 and 8)
are left unset; 7 has three parts, 9 and 22 have two, 26 has eight.

Blocks support free positioning, a connected ordered route, grid arrangement,
editable titles, parts and notes, moving earlier/later, removal to the library,
adding omitted topics, undo, canvas panning, scaling and a PNG export.
No student learning progress, assignments or achievements are modified.

`GET /api/ege-study-plan` and `PUT /api/ege-study-plan` are authenticated
teacher-only endpoints. Ownership comes exclusively from the session.
`ege-study-plans.json` in the configured data directory stores plans by teacher
ID. A GET returns an unsaved default when no plan exists. Writes validate
all task IDs, dimensions, bounded text/parts and an optimistic revision,
then atomically replace the JSON file. An unreadable store fails closed.
Conflicts return 409 and the account copy; the user explicitly chooses which
version to keep. Responses are private and not cached.

The client serializes autosaves, keeps a teacher-specific local draft and
offers recovery of unsaved changes. An older response cannot overwrite newer
edits; network failures keep the draft and expose retry. Navigation triggers
a final save, and closing a tab with unsaved changes warns the user.

Validation: model and authenticated server integration tests cover topic
coverage, arrangement, preservation of custom parts, teacher isolation,
student denial, validation, conflicts, persistence, cache policy and unreadable
storage. Browser QA checks navigation, edits, saves and reloads in the actual
teacher interface; production build and release notes validation are required.
