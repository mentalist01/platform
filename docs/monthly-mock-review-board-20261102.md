# Monthly mock review from the schedule

The teacher's completed monthly result offers task review and the existing deep
analysis. The selected completed attempt is matched by identity (legacy records
by completion timestamp); an unfinished retry never substitutes for it. Task
conditions come from its historical exam snapshot. Review is read-only and does
not start an attempt, submit answers, issue rewards or change the stored score.
Correct tasks are green, incorrect answers amber, unanswered tasks neutral.

Copy uses the existing cross-window task clipboard envelope. A mock source
reference contains only exam, pupil, attempt and slot identity. Pasting resolves
that source again on the server, checks teacher access to both the source pupil
and destination board, and creates a prepared task with private answer variants
and immutable input-file copies. Existing board tasks, drawings, code and saved
files remain intact. Imported tasks stay out of the teacher's set library.

Verification covers exact historical attempts, an active retry, clipboard across
isolated storage, teacher/pupil access, attachments and runtime filenames,
repeated paste, preservation of an existing card, accepted answer alternatives,
missing history, and absence of answer keys in pupil responses.
