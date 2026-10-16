# Python homework presentation and assigned mock exams

Python homework subsections have solid plum headings, visible task number tiles,
stronger card borders, and green completion marks. Teacher and student views use
the same component. Task indexing, selection, and progress remain unchanged.
Keyboard focus, narrow screens, and the dark theme are supported.

Students can launch a published mock of the current month or a mock assigned in
their homework. Merely allowing an exam for all students does not assign it.
The student catalogue, search, attempt reads, and attempt writes enforce this
rule. Personal random generation is disabled, including direct API requests.
Teachers retain access to attempts and corrections.

Measured mock statistics include assigned attempts and teacher-entered manual
scores. Old practice history remains stored. Legacy assignment evidence comes
from the pupil's homework at the time of the attempt or the teacher's monthly
publication, including a historical exam snapshot. New attempts have a
server-derived assignment source. The answer-free student response carries the
server's statistics decision so that student and teacher charts agree. An old
practice attempt cannot conceal a later official attempt at the same exam.

No stored attempts, homework, payment records, or solutions are migrated or
deleted. The 120 new Python exercises are a separate append-only content update,
documented in `python-second-expansion-20261016.md`.

Validation: scoped unit and server integration tests cover assignment gates,
monthly publication dates, direct API access, forged request metadata, history
preservation, official attempts after practice, corrections, parent reports, and
statistics. Browser checks cover light/dark themes and a 390px viewport. Both
beginner solutions to each of the 120 new exercises passed 2,876 executions in
the platform Python runner.
