# Per-sheet theory size and reference sheet

In the theory editor, use step mode and expand **Размер и расположение** on each image. Choose its size, a preceding sheet in the same theory block, below/right placement, and whether to frame this sheet or it together with the reference sheet.

Example:

| Sheet | Size | Relative to | Position |
| --- | --- | --- | --- |
| 1 | 150% | First sheet | Start |
| 2 | 50% | Sheet 1 | Right |
| 3 | 150% | Sheet 1 | Below |
| 4 | 150% | Sheet 3 | Below |

Sizes are percentages of the usual board card. Aspect ratio and the canonical image coordinate system stay unchanged. The existing spawn scale incorporates the sheet-specific factor, so resizing does not reflow the picture or create different pupil/teacher geometry.

Placement uses the selected sheet's current board anchor, including a manually moved/resized anchor. Below placement preserves handwritten work beneath it. Unrelated prepared cards in a non-overlapping adjacent column do not force a left-column sheet below that column. Intersecting cards still count as obstacles. Pair framing uses the selected reference anchor and fits unequal rectangles on each screen.

References use asset identities, not mutable display numbers. Cropping and private set copying remap them. Removing a reference, moving it after the dependent sheet, or changing its theory block falls back to the preceding available sheet while retaining other display options. Invalid sizes are rejected by the API.

These are creation settings. Live set updates do not rescale or reposition opened sheets or ink. Existing board resize/move controls remain available; a new opening of the set uses the saved layout.

Validation artifacts: output/theory-size-anchor-tests-20261103.log, output/theory-size-pair-20261103.jpg, output/theory-size-layout-20261103.jpg. The browser fixture uses the actual theory editor and card components with an isolated PreparedLessonTasks store and generated example images. It verifies editing all four settings, saving, opening successive sheets and the pupil view. No real lesson content is modified by the fixture.
