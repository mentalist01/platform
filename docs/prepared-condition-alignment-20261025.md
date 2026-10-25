# Stable condition coordinates on a shared board

The task condition previously followed the interactive controls in normal
document flow. The teacher-only reference answer, takeover button, feedback,
file permissions and solved-participant details can give those controls a
different height for each participant. Shared strokes retain world coordinates,
so the same underline then lands on a different line of the condition image.
Different display scales make this conspicuous but are not the underlying
cause. A task without those extra controls can appear correct.

The first teacher layout measurement now records `conditionTop` for each card.
The server validates it and only accepts it from a managing teacher. Both roles
receive the same coordinate. The controls wrapper occupies exactly that height;
extra contents scroll inside it. The condition and subsequent images remain in
stable world positions as feedback, leases, reference visibility and file
controls change. The card's total height and canvas anchor still follow the
existing measured layout protocol. Theory cards keep their simpler layout.

The coordinate is set once and persists across reconnects. Existing cards use
the teacher's current condition position when first measured, preserving their
canvas anchors and stroke arrays; there is no global rewrite of saved drawings.
Both participants should reload the updated app. Older clients cannot use the
new condition position until they reload. Historical drawings made while the
image itself had already shifted cannot be assigned a previous intended line
automatically.

The regression test verifies authorization, bounds, persistence, immutable
condition position after wrong answers, and unchanged ink/card/code identities.
A browser reproduction rendered the real task-card component with teacher-only
reference and takeover controls: the initial offset difference was 66 CSS pixels.
Pinning removed the difference at 100% and 75% scale. Toggling wrong-answer,
lease and reference visibility preserved the zero difference. Browser proof is
saved under `output/condition-alignment-before-20261025.png` and
`output/condition-alignment-after-20261025.png`.
