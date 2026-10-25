# Introductory theory in prepared sets

The set editor has **Add theory** before the numbered task tabs. It opens a
separate compact editor for up to eight images, including file selection,
drag/drop, clipboard paste, reordering and removal. Images autosave with the
set; adding theory does not require filling the first practice task first.
A set can remain a draft until its actual tasks are ready.

Theory is a distinct initial queue step for each set. It displays an image
card headed **Theory**, with no answer, file actions, homework button, score or
Python tab. Next marks the introduction as reviewed and opens the first actual
task. Automatic advancement between sets stops on the next set's introduction,
so the teacher can explain it before proceeding. Theory does not consume the
100-practice-task limit; there can be at most one introduction per source set.

`theoryImages` is an owner-validated image ID array in a saved set. Existing
clients omitting it preserve the current value. `theoryImageFiles` is a derived
view. The intro is represented by a source-aware synthetic `kind: theory` step
in the lesson snapshot. Existing single-set runs are not migrated. Public
`total` counts queue steps; `taskTotal` and source `total` count practice tasks.
The same image authorization gate exposes only already placed introductions.

Updating a running set can connect a newly added introduction without changing
card/code IDs, previous answers or drawings. It inserts a queue step before the
source's first task and adjusts card indices. The teacher can open this newly
available introduction from the task picker. Existing theory remains a snapshot,
as do existing task conditions. Starting a fresh page uses the latest version.

Theory is included in private set sharing and independent copies. Check, answer,
achievement receipt and homework queue operations reject theory explicitly.
It never creates a native Python document. Regression tests cover initial and
appended introductions, source sync, restart, image authorization, private
sharing/copying and the transition from theory to the first real question.
