# Parent contacts and Python homework sections

Each teacher can save an optional parent name and a contact URL for their student. Telegram, MAX, WhatsApp and other http(s) contact links are supported; Telegram @usernames also normalize to https links. Parent contacts live in a separate `student-parent-contacts.json` file and are available only through staff-authorized endpoints. Student and parent sessions cannot read/write them; another teacher cannot read or change a pupil's contact. Ordinary student payloads and finance records are unchanged.

The shared contact control is available in student cards, monthly parent reports, direct student chats, calendar payment reminders, and lives review panels/notices. In a parent report, the contact link starts copying the currently reviewed report text and opens the saved URL with normal browser navigation to a separate destination. The teacher pastes and sends the message. Opening/copying does not send a report or mark it sent. If copying fails the report stays available and an error is shown. No messenger account/token or automatic message delivery is introduced.

Python homework now groups assigned tasks by the same subsections as Python study, shows task names and subsection completion counts, and opens individual tasks by their existing global question numbers. The shared view is used by the student's Today/homework summary and the teacher's homework view. Grouping only changes presentation; assignment snapshots, solved IDs, deadlines and life calculations stay unchanged. The theory instruction refers to the topic instead of claiming every selected task belongs to the theory's single subsection.

Validation:

- Integration test checks owner/other-teacher/student/parent authorization, invalid-link rejection, persistence, clearing one contact without changing another, and unchanged student records/public payloads.
- Unit tests cover links including Telegram/MAX/WhatsApp, script and credential URL rejection, exact reviewed-text copying, noncontiguous global task numbers, completion states, legacy subsections and missing bank tasks.
- Browser fixture uses the actual components and backend with synthetic students only. A contact survives reload, appears in the report, and the teacher's edited text is copied exactly. Task 5 opens from the appropriate named subsection. The test contact URL points to a local dummy page; no real parent messages were sent.
- Production build preserves authenticated TURN/relay configuration and the initial bundle budget; scoped ESLint has no errors. Existing large components retain pre-existing hook warnings.

Browser proofs: `output/parent-python-homework-browser-20261015.png` and `output/parent-report-browser-20261015.png`.

The backend registration requires a safe server restart. Installation must check both server lesson/recording state and the local recorder immediately before restart. Preserve the custom ecosystem/environment, the prior static frontend overlay and old assets, Python bank content, and all finance/payment data.
