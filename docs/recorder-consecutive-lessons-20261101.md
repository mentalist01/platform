# Consecutive individual lesson recording

## Incident and cause

An individual call continued across two adjacent scheduled lessons with the same
pupil. The recorder correctly stopped the first file at its schedule cutoff.
The platform retained the first replay occurrence as the preferred active
occurrence for up to two hours after its end. Browser recording heartbeats then
reused the expired recording/activity; device polling did not create a successor.
Consequently the pult had no current lesson and manual start also failed.

The isolated HTTP/WebSocket regression reproduced the missing current lesson at
the exact boundary before the fix. No real recording was started by these tests.

## Change

- Prefer a currently running scheduled successor over an expired active replay.
- Ignore expired job/activity bindings when resolving a browser recording start.
- Device polling rolls an ongoing call into an adjacent scheduled lesson without
  depending on a foreground browser timer or a call reconnect.
- Keep each lesson's original deadline, file ID and replay binding. The existing
  recorder engine performs the normal stop/start transition into a separate file.
- Refresh Telemost's activity boundary so it does not expire relative to the
  first lesson after the second one has started.
- Serialize rollover per teacher. Do not restart after explicit stop,
  disconnection or quarantine, start another pupil/group, bridge a schedule gap,
  or create an unscheduled third hour. No new replay writes on unsuccessful probes.

## Verification

`server/recordingRollover.integration.test.js` starts the real API server with a
fixture clock and two same-pupil lessons. It tests platform RTC, Telemost,
explicit stop and disconnection; verifies the exact boundary, browser/device
agreement, correct second deadline, and absence of an invented third lesson.
`server/recordingRollover.test.js` checks successor scope and boundaries.

The recorder engine and desktop-recording integration/unit suites also passed,
including file switching, offline cutoff, reconnect grace, group channels and
recording ownership. Calendar start/end edit regression is checked separately.

Deployment is pending the end of the active lesson. This is a server-only fix;
the installed recorder does not require an update.
