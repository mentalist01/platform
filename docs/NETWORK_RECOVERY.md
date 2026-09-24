# Recovery after changing network / VPN during a lesson

## Failure found

The browser call client used `WebSocket.close(1011)` on a missing heartbeat
and `close(1013)` on a missing room acknowledgement. The browser API rejects
both codes (only 1000 and 3000–4999 may be supplied by script). The exceptions
were swallowed, leaving the stale OPEN socket in place. Even a valid close
may wait for a dead TCP route, so recovery cannot rely solely on `onclose`.

Most API reads also had no timeout. Explicit timeouts ended at the response
headers, leaving partial JSON bodies and shared in-flight promises unbounded.

## Change

- Retire failed call sockets locally, detach their callbacks, use code 4000,
  and run the existing reconnect cleanup immediately. Late socket events
  cannot close the replacement connection.
- Check signalling every 5 seconds, with a 15-second heartbeat deadline.
  Bound the initial WebSocket handshake as well as the room acknowledgement.
- On `online` / NetworkInformation `change`, probe first; only reconnect if
  no pong arrives within 4 seconds. Speed-change notifications leave healthy
  calls alone. Heartbeats cover browsers/VPNs without these notifications.
- Reconnect with capped backoff until the user leaves. Keep the connecting
  status, local audio/camera/screen tracks and microphone mute state. This also
  preserves the existing active-call protection against deployment reloads.
- If only the WebRTC media path fails, use the existing peer restart control
  before room resynchronization so both ends negotiate fresh media connections.
- API GETs have a 20-second deadline through completion of JSON, with one
  retry after a network failure. Writes are never retried automatically.
  Explicit cancellation/account changes prevent retries. Existing HTTP error
  handling remains; downloads/streams are not buffered as JSON.

This does not toggle VPN, change authentication/network permissions, finish
lessons, or change the OBS recording state machine. An interruption in audio
while the network itself is unavailable remains possible.

## Validation

`node --test src/utils/socketRecovery.test.js src/utils/recoverableFetch.test.js src/services/api.test.js src/utils/scheduleSyncChannel.test.js`

30 tests cover stalled headers/body, one-read retry, no duplicate writes,
cancellation/auth changes, valid socket close, a stalled closing handshake,
healthy/unresponsive probes, cleanup and existing API/cache behaviour.

Local browser harness renders the actual CallSection with synthetic media
and a signalling test double. Checks cover reconnect after a network hint,
heartbeat-only recovery, preservation of track IDs and mute, and manual exit.
It does not switch the user's real VPN or exercise a live student's connection.

Frontend-only deployment retains old lazy chunks and does not restart the
backend or reload active calls. Open calls pick up the change after the lesson.
