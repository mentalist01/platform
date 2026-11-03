# Group homework review survives background refresh

## Problem

LearningGroupsSection reset expandedAssignmentId whenever the selected group object changed, including ordinary detail refreshes. This unmounted GroupHomeworkReviewPanel and its pupil review modal. The summary list request also replaced loaded details with empty arrays, so concurrent list/detail refreshes could remove the panel even after removing that reset.

## Change

- Reset the expanded homework only when the selected group ID changes. Manual collapse and explicit deletion retain their existing behavior.
- Merge refreshed group metadata with cached detail fields until dedicated detail requests replace them. Missing groups remain removed.
- Ignore superseded list/detail requests. Background refresh does not reselect a group captured when the request started.
- Keep cached detail fields if their endpoint temporarily fails; successful empty responses remain authoritative.
- The top refresh button reloads details as well as the summary list.

## Validation

- 13 tests passed: group summary merge, group normalization/attendance, homework review unit and integration checks.
- Targeted ESLint: no errors; one existing openAssignmentComposer dependency warning remains unchanged.
- Actual LearningGroupsSection and GroupHomeworkReviewPanel against the isolated group homework fixture: eight background/list refreshes, including concurrent requests with the summary delayed by 800 ms.
- The opened pupil review survived refresh and a simulated assignments HTTP 503.
- Python homework remained expanded; scrollY stayed 716 and the homework heading stayed at 1.4375 px before/after repeated refreshes.
- Production build and deployed asset verification are recorded in output/group-homework-stability-20261103-*.

No production homework, answers, deadlines or group membership are modified by this change.
