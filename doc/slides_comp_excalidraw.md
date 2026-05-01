# CompExcalidraw: container size / aspect behavior

Container resize (including aspect change) needs no explicit handling:

- Excalidraw library watches its own root, resizes its canvas buffer, updates `appState.width/height`, and redraws.
- `zoom` and `scrollX/Y` stay unchanged, so content keeps its screen-pixel size and stays anchored to the top-left.
- Growing reveals more scene; shrinking clips the visible window; aspect change never stretches content (scene is infinite).

Only `slidePagePixelSize` drives a zoom update in CompExcalidraw.
