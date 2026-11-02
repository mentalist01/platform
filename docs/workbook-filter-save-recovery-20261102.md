# Workbook helper 1.5.14

Observed incident: a board workbook had pupil filter changes through revision 6; teacher G1 edits reached revisions 7–9 and a later teacher checkpoint stored revision 10. No later pupil checkpoint reached the server. The local teacher log also contained an initialization LiveOfficeBusyException. The pupil status/log was unavailable, so the precise failure on that machine remains unconfirmed.

Fixes: native UI busy during initialization retries without dropping the worker; advanced OOXML filters use their exact exported hidden-row mask instead of aborting all workbook reads. A combined advanced filter drops all predicates from the shared model to avoid applying an incomplete subset. Original native filter criteria remain in the originating file; other editors receive equivalent visible rows. Sync errors and save/conflict waits emit bounded, redacted diagnostics. An unacknowledged save is not reported as saved. A successful checkpoint updates durable recovery metadata.

Validation: helper self-tests cover grouped dates/top-N/color masks and startup retry/cancellation. The native save-only scenario uses two hidden Calc instances and a real lesson recovery copy: teacher checkpoints and closes, pupil changes G2, saves natively, and the board receives a newer file revision and the confirmed formula. No production workbook is edited by these checks.
