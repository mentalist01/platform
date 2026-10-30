# Workbook Helper 1.5.11 and platform fixes

## Behaviour

- Negotiated formatting capability adds font name/size/RGB/bold/italic/underline/strike, alignment, wrap/shrink/rotation, portable number formats, and merged ranges. Borders and fills retain separate conflict versions. Column widths, row heights, conditional formatting and arbitrary objects are not added to this protocol.
- Formatting is sparse relative to the workbook's default format. Explicit resets (including `false`, Calibri and General) remain meaningful. Full OOXML exports and fast native reads share the same base; this matters after ODS import, where a named default style can differ from OOXML style zero. Implicit blank neighbours are not promoted into thousands of styled cells.
- Merge/unmerge applies atomically with native preconditions. Conflicting contents/layout retain explicit recovery. Conflicting cosmetic properties can accept the latest shared version after retaining the full local recovery copy.
- The five-second full audit is no longer postponed by every incremental edit. Leaving an observed draft forces an immediate confirmed snapshot. Native range moves and fill-right formula operations are covered in both directions.
- Calc accessibility coordinates are transformed from the producing window's DPI context into physical pixels, using both window origins and scales. Monitor movement invalidates the geometry cache. Peer presence does not move the local cursor, zoom or viewport.
- Old active/unsaved sessions retain their previous capability. A formatting epoch starts only after a checkpoint and disconnect; clients below 1.5.11 cannot enter that epoch.
- Code solution tabs show a thin scrollbar and previous/next scroll buttons when overflowing. Selection and resize reveal the active tab; ordinary manual scrolling does not snap back. Existing keyboard tab navigation and reordering remain available.
- New homework life deductions use monthly damage 4 instead of 8. A durable installation cutover preserves recorded balances and historical deadlines, including delayed assessment of old work. The introductory multiplier still applies. No historical balance migration is performed.

## Verification

- 70 server/update/notes checks: lives cutover and persistence; different monthly plans and introductory period; live cell/format/layout validation, journal/replay, conflicts, capability upgrades, old-session protection, presence and signed update envelopes.
- Real Excel/Calc integration through scoped production routes: formatting and clearing, merge/unmerge, moving colored ranges, committed COUNT formulas and fill-right, continuous-edit audit, sort/filter, reconnect/recovery, conflicts, native row insertion, board/notes checkpoint and 20,000-row transfer.
- Calc/Calc formatting subset verifies the same new operations and their default-style normalization.
- Separate actual native capacity checks: initial 300,001-row file and growth past 250,000 cells, for each of Excel and Calc. Whole-file board saving remains available without truncation.
- Visible geometry fixture was checked on primary 2560×1440 at 125% and secondary 1920×1080 at 100%, including moving back. Interactive keyboard/draft testing was interrupted when the teacher started using the primary monitor; it is not counted as a passed keyboard test. Subsequent checks use hidden fixtures during the lesson.
- Browser fixture with 20 tabs and a 580px code panel: arrows, last-tab access, keyboard End, visible scrollbar and active-tab reveal. Manual scrolling retains its position.

Local receipts are in `output/helper-1511-signed-candidate-full-20261030`, `output/helper-1511-default-cache-calc-calc-20261030`, `output/helper-1511-candidate-capacity-20261030`, `output/helper-1511-visible-calc-calc-20261030`, and `output/helper-1511-tests-final-20261030.log`. They contain disposable fixtures, not user lesson workbooks.

## Release

Windows package version: 1.5.11.0. The update manifest is ECDSA signed; this is not a trusted Authenticode publisher signature for the EXE. Both participants need 1.5.11 and a newly opened saved/disconnected session for the formatting capability. Backend installation requires a brief restart and must wait for the active lesson to end.
