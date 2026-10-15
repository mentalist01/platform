# Monthly parent report workflow

Teachers get a recipient list from the existing accessible pupil roster intersected with staff-only parent contacts. It includes all non-deleted pupils with valid links, shows the saved parent name and reuses monthlyReportSentMonths. No contacts are sent to pupils or parents through platform payloads.

Starting on the 25th in Moscow, a pending list opens when the teacher is not in a lesson, call or recording and no other modal is open. Dismissal snoozes until the next Moscow day, scoped by teacher and month on that device. A manual entry remains available. No report is generated for the whole roster on each tick: reports load individually when opened.

Parent text starts with the saved name. A late contact load updates untouched automatic text without overwriting teacher edits. The Send link initiates copying of the reviewed text and opens the saved destination; the separate Copy button remains. Only an explicit checkbox sets the existing sent status. Both the list and roster receive the result through onStudentUpdated.

The report generator preserves explicit taskNumbers in stored lesson topics (including numbers beyond a shortened display label). An exact catalog-title match can label a named topic with a number; ambiguous names are left as saved. Teacher-specific classic and Python catalogs supply titles. Homework is described separately from class work.

Homework practice counts dated completed items from buildHomeworkStatistics across all homework entries, filtering by completion month in Moscow and by report generation time. The type/level/question identity deduplicates carryovers. Wrong, untouched, mock, undated lifetime-fallback and future completions are excluded. Counts are presented by EGE topic or Python section in a supplemental table and in natural parent/student prose. The quantity alone does not imply mastery or regular attendance.

Validation covers month boundary, snooze isolation, valid contacts, existing sent status, greeting, preserved report facts, dated practice/carryover deduplication, explicit lesson task IDs and endpoint integration. Browser QA uses synthetic pupils and a local dummy contact only; no real messages or contact/report-status changes are needed for live verification.
