# Screenshot strip removal and board page controls

## Remove a middle strip

The prepared-task editor offers **Remove strip** beside the existing crop tool.
The theory image editor exposes the same operation on each image. The modal
shows the source on the left and a joined preview on the right. Dragging creates
a horizontal band; its handles or percentage inputs adjust the exact boundaries.
Apply removes the band and joins the remaining pixels at their original width.
The editor stays open for another cut, undo, or Done.

`POST /api/lesson-task-images/:id/remove-strip` validates owner, image type and
strict internal fractional boundaries. Shared geometry converts them to integer
rows consistently in the client preview and server output. Sharp extracts and
joins the top and bottom into a new PNG asset. It never modifies the source.
The output records its parent and original asset IDs.
`GET /api/lesson-task-images/:id/edit` exposes authorized image metadata and undo
history to the owning teacher. A later editor session can undo the last cut by
referencing the previous asset. Learners and other teachers cannot read this
history or invoke editing endpoints. Responses are private and uncached.

Applying replaces only the selected library image, preserving task identity,
answers, attachments and order. Existing lesson conditions remain snapshots;
the edit appears when opening a new lesson page. Undo references the retained
source asset. No image generation or text recognition changes document content.

## Board menu and page titles

The prepared options menu is positioned relative to the canvas bounds on open,
resize and scrolling. It avoids the left tool rail and stays within the board,
including when the page sidebar is docked. Long menus scroll internally.
Outside clicks and Escape dismiss the menu.

Creating either a main page or a subpage immediately edits its title in that row.
The pencil or a double click reopens inline editing. Enter/confirm saves;
Escape/cancel discards the title change. The parent selector is in the same row.
The previous detached form at the bottom of the sidebar is removed. Existing
page APIs, permissions, persistence and read-only behavior remain unchanged.

Validation includes exact image-row preservation and dimensions, invalid cuts,
owner isolation, persistent undo history, immutable lesson conditions and
authenticated route coverage. Browser QA uses the supplied screenshot in a
disposable local lesson: drag selection, live preview, apply, undo, save/reopen,
create/rename/cancel main pages and subpages, and menu/canvas bounds.
