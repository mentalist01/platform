# Compact lesson cards and confirmed reference publication

The card keeps the answer, source filename, launch button and a small reference
button visible. Original download, save history, restart, editor preference and
advanced helper operations move into a viewport-positioned menu. The same menu
works inside fullscreen. The condition box, image dimensions and collaborative
anchor are unchanged; menus and result dialogs never become part of that layout.
Decorative accents use CSS gradients and a short hover sheen with reduced-motion
support. Existing solve celebration and helper launch protocols are retained.
The header has no separate top-edge pseudo-element that can protrude beyond the
rounded corner. A pupil's compact reference badge shows a closed keyhole lock
before a correct answer and transitions to an open lock with a brief halo after
unlocking. Old solved tasks do not replay the animation when opened. Reduced
motion disables both transitions and the unlock animation. File metadata and
download authorization remain gated on the server.

## Saved workbook as a reference

After a fully correct answer, an owned classroom task with no existing reference
may offer its current helper-saved workbook to the teacher. This also works when
the last save arrives after the correct answer. Wrong and partially correct
independent answers, previous attempts, homework runs and ordinary manual uploads
do not trigger publication offers.

The teacher gets the filename, save time, download preview and explicit attach or
decline actions after the existing solve celebration. Old solved tasks do not
open modal backlogs; an eligible saved file remains available from its menu.
Declining is persisted per lesson card. Only the owning teacher can confirm.

Confirmation checks the current solution ID and revision and rejects a save that
changed since the prompt. It stores an immutable teacher-owned asset, adds the
reference to the exact source task in the library and refreshes matching owned
run snapshots. Existing references are never replaced. Future and existing pupils
still need their own correct answer before downloading the reference (group
answers remain shared). Values, working-file history, code and drawings are kept.
The reference uses separate metadata and content-addressed immutable bytes, so
later saves of the working file do not change it.

The library reference is durable before run notifications. An approved generated
reference can also be resolved directly from its owned source task after a crash
between those writes. Notifications increment only run metadata versions and do
not change board geometry or answer revisions.

## Verification

35 focused regressions cover promotion through real helper HTTP uploads, teacher
ownership, pupil restrictions, stale confirmations, byte-preserving downloads,
immutable copies, decline persistence, reference gating, set updates/exchange,
homework isolation, condition geometry, workbook history and solve celebration.
Production build and targeted ESLint checks passed. Browser checks cover the
teacher prompt and confirmation, student lock, history menu, fullscreen menu and
unchanged pinned condition coordinates on an incorrect answer.

The main release was installed after all lessons finished. The visual follow-up
also checks that wrong answers leave the reference locked, correct answers expose
the download, and the condition stays at the same screen coordinate throughout.
