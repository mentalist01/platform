# Prepared answer tables

Each prepared task can carry `answerTable: {rows, columns}`. The editor exposes
both dimensions beside the expected answers. Applying a shape changes its cell
count, preserves values in their current visible order, pads empty cells and
refuses to truncate nonempty cells. The limit remains 50 cells, with 10 columns.
Dimensions belong to each task, so one set can contain differently shaped keys.

Explicit tables store answers in row order. The same order drives rendering,
bulk paste starting at any cell, checking, reference placeholders, homework and
teacher-to-teacher copies. Existing tasks have no table metadata: their display
and storage remain unchanged, including the legacy 20-cell column-first layout.
Reshaping that legacy layout converts its visible row order exactly once.
The testing/mock answer helpers retain their existing behaviour.

For combined №25 tasks, wholly empty rows are allowed. Every cell in a used row
is required. A one-column table therefore supports a simple list of numbers.
Independent questions and other task numbers retain their required fields.

The server rejects invalid dimensions, mismatched cell counts and conflicting
count overrides, including during autosave. Only the owning teacher can alter a
task. Public student projections expose the shape but never the reference key.
Sharing and homework clone the table metadata alongside the rest of the task.

Changing a library shape leaves existing lesson snapshots intact until the
teacher explicitly saves and updates the lesson. The checking-sync operation
can then reshape the reference and pupil arrays while retaining card and code
identity. It accepts only an equivalent reference key in visible order and
rejects any reshape that would discard a pupil's populated cell. Revision bumps
protect concurrent answer edits; answered/solved states are preserved.

Validation covers row-wise paste for 4×4 and 20-cell shapes, legacy conversion,
loss prevention, partial-row rules, API persistence and validation, teacher
copies, pupil privacy, correct checking, homework snapshots and safe live sync.
