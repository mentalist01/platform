# Loading stalls with multiple platform tabs

The lesson alarm, schedule, calendar and reschedule inbox used separate
`EventSource` requests to `/api/schedule-sync/stream`. A teacher's page could
hold three connections. Two such tabs consumed Chrome's six HTTP/1.1
connections to the origin, leaving ordinary fetches queued indefinitely.
Closing a tab freed connections; the server itself could still respond quickly.

All four consumers now use `subscribeScheduleSync`. It shares one connection
per session and URL within a tab, fans out events, and closes only when its last
subscriber leaves. Different authentication sessions cannot share listeners.
The existing polling fallback remains in place.

The production TLS virtual host must also support HTTP/2, since the HTTP/1.1
limit is shared across tabs. On the current nginx 1.24 installation,
`/etc/nginx/sites-available/ivan100.ru` uses:

```nginx
listen [::]:443 ssl http2 ipv6only=on;
listen 443 ssl http2;
```

Keep HTTP/1.1 on the upstream proxy for WebSocket upgrades. Validate with
`nginx -t`, apply with a graceful `systemctl reload nginx`, and verify that a
new TLS connection actually negotiates `h2`. Do not restart the application
or disconnect existing calls for this configuration change.

Verification on 2026-09-24:

- 24 focused tests passed (channel lifecycle/session isolation, API cache and
  lesson alarms); production build passed.
- Isolated browser reproduction: six SSE requests blocked an ordinary fetch
  beyond its 1.5-second timeout; closing them immediately restored requests.
- Two simulated tabs with three shared subscribers each used two connections;
  the same fetch completed in 3 ms.
- Server legacy recording flag was disabled, with no legacy recording writes
  in the preceding hour. OBS coordination traffic remains separate from old
  audio/screen/event recording.
