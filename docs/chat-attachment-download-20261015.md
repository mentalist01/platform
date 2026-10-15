# Chat attachment downloads preserve the lesson page

Chat file cards and image-viewer download actions now fetch through the existing authenticated upload API and save the returned bytes as a Blob. The click cancels navigation synchronously, blocks duplicate requests while downloading, and shows failures beside the action. Legacy data/blob attachments remain supported. The fallback link opens separately so it cannot replace the lesson tab.

Previously the actions were ordinary download links. Browser/native handling of an inline attachment or an authentication response could navigate the lesson page and unmount its call. This is a plausible cause of the reported disconnection, but the friend's browser, file type and incident time are unknown, so this change does not establish the cause of that particular incident.

Validation:

- Five Node tests cover cancellation before awaiting bytes, duplicate clicks, retry after failure, exact saved bytes, URL parameters and Blob cleanup.
- Production build passes; new files have no ESLint errors. Existing chat modules retain their previous hook warnings.
- Browser regression uses the actual component with an isolated HTTP/WS fixture. An inline PDF response downloaded as PDF bytes, a 401 response displayed an error, the page session ID remained unchanged, and WebSocket messages continued through both actions. No real student chat messages or lesson sessions were used.
- Browser proof: `output/chat-download-browser-proof-20261015.png`.

Deployment is frontend only: append hashed assets and atomically replace index files, retain previous assets, preserve environment/configuration, and verify the PM2 process and uptime are unchanged. The existing client reload guard defers automatic updates during an active call, recording or lesson. The last observed server restart before this fix was 2026-10-15 16:04:51 UTC (19:04:51 Moscow); the Python task publications after it were content saves without restarts.
