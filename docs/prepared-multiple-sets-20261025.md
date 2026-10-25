# Several sets on one lesson page

Open **⋯ → Add set / preparation**. The library shows the current page's queue
with set names and counts. A set already in this queue is marked **In queue**;
another set offers **Add after**. Opening on a new page is still available.
Adding after preserves every existing card, answer, code document, file and
board annotation. It queues new tasks without interrupting an unfinished one.
The teacher can choose a task immediately in **All tasks**, or continue with
Next, Skip and automatic advancement across set boundaries.

The task picker groups conditions by set name, includes set names in search,
and offers a set filter. The compact board navigation marks set boundaries;
each card includes its own exam number and source set label.

`POST /api/lesson-task-runs/:id/sets` accepts a source `setId` and `setVersion`.
The authenticated teacher must own both the existing lesson and the completed
set. Append is serialized and idempotent per source set; stale source revisions,
drafts, private homework runs and more than 100 tasks on a page are rejected.

One existing run remains the queue and collaboration authority. Appended tasks
carry immutable source metadata (set name, exam task number, part, task identity
and original index). In the unusual case of duplicate source task UUIDs, the
queue assigns a fresh local ID while retaining the source identity. Old runs
need no migration. No existing card IDs or code links are changed.

Source-aware file, checking and queue synchronization updates only that set.
Conditions and answer keys remain snapshots. Notes folder placement, workbook
helper text eligibility, homework snapshots and lesson achievement receipts use
the card's actual task number and part. Future conditions and answer keys retain
the existing access rules; group workbook edits remain teacher-only.

Validation covers teacher/student isolation, stale requests, duplicate append,
source-ID collisions, native code preservation, cross-set transitions, source
sync, automatic continuation, restart persistence, correct workbook source/notes
topic and homework metadata. Existing prepared board, homework and achievement
regression suites are run before publication, along with lint and a production
build. The actual teacher UI is checked in a disposable local lesson.
