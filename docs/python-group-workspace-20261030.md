# Python: group progress and explanation workspace

## Behaviour

- Teacher selects a group in Python. Topic progress counts the union of the current members' solved question IDs, restricted to the teacher's current question catalog. A separate counter reports questions solved by everyone.
- Inside a topic: green = all current pupils solved; amber = some solved, with unsolved names; grey = none solved. The teacher can refresh; the visible screen also refreshes every ten seconds and on focus. Group switching discards stale responses. Individual and pupil progress remain personal.
- “Доска и код” reuses `CollabSection`, the lesson's ordinary editor, runner, input, output, and board. Explanation rooms are isolated from task solutions and ordinary lesson notebooks. Existing Python drawings remain on their original first page.
- The existing lesson page catalog projects each board page into its own code page. Teacher can create, name, delete and restore pages, and reorder code tabs through existing controls. Each page retains its drawings and code tabs. “Призвать к себе” moves pupils to the teacher's page and location.
- Teachers can upload input files and save examples to shared group notes. Group file lists expose only that group's shared notes and the teacher's common lesson materials. Pupil edits to the shared code are allowed; group note uploads remain teacher-only.
- No task solve or achievement is awarded for running an explanation example.

## Verification

- 35 tests: group union and all-members counts, changing membership, API owner access, real student solve update, authenticated two-way code/output/input synchronization, page creation/delete/restore, shared group file upload/read permissions, existing page catalog and code stacks.
- 40 regression tests: lesson access, page selection and teacher update catalog.
- Frontend build passed. ESLint: no errors; unchanged existing warnings in App (25), PythonReviewModal (5), and PythonTestModal (8).
- In-app browser on disposable local accounts: teacher ran `print(2 + 3)` → `5`; pupil edited and ran `print(6 * 7)` → `42`, seen by teacher. Shared `test.txt` contained `10 20`; reading it returned `30`, visible to pupil. Created “Циклы” page and summoned pupil; both board and code switched together. Green/amber/grey group task states checked in light and dark themes.
- Receipts: `output/python-group-workspace-final-tests-20261030.log`, `output/python-group-workspace-regression-20261030.log`, `output/python-group-workspace-build-20261030.log`, `output/python-group-workspace-final-lint-20261030.json`; screenshots `output/python-explanation-workspace-proof-20261030.png`, `output/python-group-progress-proof-20261030.png`.

## Release

Prepared together with the pending Workbook Helper 1.5.11, half-rate future lives deductions and code tab scrolling. No production restart while the teacher's lesson is active. Helper binary is unchanged from the validated 1.5.11 candidate.
