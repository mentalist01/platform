# Parent report study focus

The monthly parent report keeps the explicit **Скопировать отчёт и открыть контакт** action next to the saved contact. It copies the currently reviewed message and opens the contact; the teacher sends the message and marks it sent separately.

The report can describe a Python, EGE or mixed study focus. Automatic inference uses saved lesson topics and explicit task numbers, never homework solution counts or the calendar's generic subject. It needs at least two classified lessons and coverage of at least 60% of the month's lessons. A pure focus needs 75% of classified lessons; otherwise the focus is mixed. Incomplete evidence leaves the focus unspecified. A collapsed teacher control shows the evidence, allows an override and accepts an optional next step. These choices apply to the currently open report and reset for another pupil/month.

No fresh mock result, the first comparable point, unchanged results and lower results get distinct wording. A Python focus never automatically explains a flat/lower score or promises later score growth. The report retains exact recorded lesson/task facts and homework statistics. An optional teacher plan replaces the generic conclusion. Changing focus or receiving a parent name late updates untouched automatic text but preserves teacher edits; **Вернуть автотекст** explicitly rebuilds the draft.

Validation: focused inference/composition/draft-preservation tests; existing monthly report, homework practice, parent-contact and reminder tests; API authorization and dated-practice integrations. Browser QA uses isolated synthetic pupils and a local dummy contact to verify overrides, plan insertion, edit preservation and the copy/open action without sending a real message.
