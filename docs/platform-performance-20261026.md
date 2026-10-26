# Platform performance, 26 October 2026

## Measured bottlenecks

The production audit found event-loop pauses up to 2.6 seconds, background pupil
schedule requests up to 8.17 seconds, and teacher calendar requests up to 5.84
seconds. A large board had 2,498 elements and a 3.13 MB Yjs snapshot. The drawing
loop repainted offscreen items and built a full-board raster while its minimap
was closed. Prepared conditions loaded even far outside the viewport.

## Changes

- Index immutable board geometry, paint visible candidates in document order,
  and retain crossing/wide strokes and active drag previews.
- Build the full-board minimap raster on demand. Full exports retain all items.
- Load condition images near the viewport without changing their saved geometry.
  Revalidate private image caches only after the existing access checks.
- Coalesce prepared-run refreshes and abort reads when leaving a room.
- Use schedule-only background endpoints for lesson reminders and join prompts;
  keep normal calendar and payment endpoints unchanged. Reuse immutable finance
  snapshots for hot eligibility reads instead of cloning the whole journal.
- Compress large collaboration messages; leave small messages and RTC unchanged.
- Load the set editor on demand. Replace five tour PNGs (22.24 MB total) with
  resized lossless WebP assets (1.26 MB total); retain original sources.

## Validation and practical limits

In sequential requests on the same isolated server with a private copy of the
production data, warmed full pupil schedules took 147–224 ms, while the
schedule-only mode took 9–56 ms. These measurements exclude network latency.
Teacher schedule-only requests took 34–47 ms; calendar marks took 4 ms.

Regression checks cover financial isolation, schedule ownership/cancellations,
private image revalidation, actual compressed WebSockets, prepared runs,
achievements, spatial rendering, clipping and ink alignment. Browser QA used
eight cards and 2,500 strokes, separate teacher/pupil sessions, lazy image
loading, task navigation, minimap and the lazily opened set library. A new
underline remained beneath the same image text in both sessions.

The large shared CSS bundle remains. This release does not establish that all
network or real-time audio/video delays are resolved. No historical lives,
deadlines or financial balances are recalculated by these changes.
