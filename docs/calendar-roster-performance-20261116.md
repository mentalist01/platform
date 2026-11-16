# Calendar and pupil directory startup

The timetable publishes schedule data and ends its loading state as soon as the
schedule request completes. Trial slots load in parallel and publish independently.
Both results use the same snapshot revision guard: an old response or error cannot
overwrite a saved edit or a newer teacher's request. Failed silent reloads retain
the existing timetable. Refresh callers still await both sources.

Calendar event forms and trial participant forms load on demand behind a local
loading/error boundary. The small trial reserve grid remains eager, including drag
handlers and its existing styling. Monthly reports and broadcast notification forms
also load on demand. Parent views, filters and unsaved form state retain their
component identities. Currency formatters are reused across pupil cards, with the
same whole/fractional precision, rounding, negative balances and RUB locale output.

No server endpoint, payment calculation, group membership, database, call or
recording implementation changes. No read cache or stale financial snapshot added.
Static releases retain old hashed assets and require no application restart.

Validation: production build and startup dependency budgets for both views;
42 focused tests covering asynchronous snapshot races, saved moves, payments,
trial booking ownership/conflicts, pupil filters and currency parity; isolated
production UI with 50 fake pupils. Additional JavaScript after the already-loaded
cabinet decreased from approximately 229 to 204 kB for the calendar and from
281 to 231 kB for the directory (uncompressed). These figures describe script
downloads, not a guaranteed end-to-end page speed ratio.
