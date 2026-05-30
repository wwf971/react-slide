
## How to support drag to move behavior

If a custom component do no have semantically meaninful drag behavior, it is suggested not to consume the events related to drag-events, and instead delegated it to `CompContainer`, which will generate drag to move behavior.

- `CompImage`: on pointer down, it only forwards the event with `requestContainerMoveByPointer(event)`.
- `CompMetadata`: same forwarding pattern, no local move math.
- `CompTextMultline`: it only detects drag-start threshold; once detected, it calls `requestContainerMoveByPoint({ x, y })`, then container owns the real move interaction.
- `CompIFrame`: on non-interactive regions it forwards pointer down to `requestContainerMoveByPointer(event)`, and interactive controls keep their own behavior.

Result: example comps stay focused on content/editing, while move/resize logic is centralized in `CompContainer`.

## Font scaling rule for text-like components

For `CompTextSingleLine`, `CompTextMultline`, and `CompIFrame`, font size should be derived from slide width ratio, not fixed pixels. Keep `fontScale` in comp data and compute runtime pixel size by `(slidePixelWidth * fontScale) / 100` with min and max clamps.


