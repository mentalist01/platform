# Programmable theory in existing prepared sets

## Storage and compatibility

`theoryItems` is an optional ordered list of data-only `{id, kind: image, assetId}` or `{id, kind: interactive, typeId, params}` instances. Existing `theoryImages` sets are read unchanged; legacy image IDs, grouping, board anchors, annotations, dimensions and rotations are preserved. `theoryImages` remains the image projection for existing asset ownership and download paths. Both types share existing placements, displays, boardLayout, task-part filtering, queue/Next/Start, cameras and set copies. Interactive leaves are separate objects in together mode. No database migration rewrites old sets.

The pure catalog validates a stable versioned type ID and parameters on the server. The frontend registry adds its React component and optional settings component. There is no uploaded HTML, eval or remote code. A new programmed component is registered by the developer and then appears automatically in the existing library UI.

## Live state and interaction

Initial parameters are library data. Geometry remains in the existing board items. A replaceable live state snapshot uses a separate `preparedInteractiveTheory` map in the same authorized board Y.Doc and existing WebSocket/persistence. Independent fields merge through Yjs; no extra sockets, polling, database or per-action history was introduced. Reset restores saved defaults; it does not modify the set. State is isolated by the globally unique live card ID. Browser preview uses local state and cannot affect the pupil or live board.

In builder placement, controls are disabled and pointer input belongs to the existing move/resize gestures. Playback enables local interaction. On the live board, Select mode enables controls, while pen/hand keep their existing board behavior; the small Move toggle yields pointer input to the board. Controls stop pointer/key/wheel bubbling. The enlarge button opens an unscaled, keyboard-accessible dialog without changing board camera/geometry. Content has a stable height; answer/explanation scroll inside it.

Pointer movement over live controls separately uses the board's existing awareness cursor and its existing RAF/throttle/visibility preference. It never calls drawing or drag handlers. The enlarged view maps its pointed DOM element (including individual bits) to the corresponding board element before translating to world coordinates; dialog width, wrapping and scroll do not shift the intended target. Leaving the content clears this transient cursor. Preview does not broadcast it.

## First card and extension

`ipv4-subnet-boundaries-v1`: IP input, /0–/32 slider, four examples, dotted mask, aligned IP AND mask = network binary rows, per-bit explanations, subnet interval, network/broadcast and first/last host, counts, show answer, explain, reset. Standard /31 point-to-point and /32 host-route cases are explicitly labeled, not treated as ordinary LAN broadcast subnets. Arithmetic uses exact safe integer values up to 2^32 rather than signed JS bitwise operations. Reference semantics: https://docs.python.org/3/library/ipaddress.html#ipaddress.IPv4Network.hosts .

To extend: define data validation/defaults/reset in `src/utils/interactiveTheoryCatalog.js`, create a trusted React component in `src/components/interactiveTheory`, register it in `registry.jsx`; optional Settings edits only initial parameters. Preserve published IDs and add a new versioned ID for incompatible semantics.

## Verification

New tests cover requested /26 result, /27 and cross-octet networks, /0 and /31–/32, invalid data, concurrent bidirectional Yjs changes, reset/read-only/instance isolation, mixed and theory-only sets, reload, camera/placement, private copy identity remapping, authorization, legacy annotated theory and unknown-type rejection. The prepared set regression suite also passes. Browser QA uses isolated fixture teacher/pupil accounts: teacher slider and answer sync to the pupil, preview state stays local, placement gestures do not trigger controls, and saved mixed sets reopen with initial parameters intact.
