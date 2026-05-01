## Excalidraw integration essentials (code-first)

Embed in React (`@excalidraw/excalidraw`):

```tsx
import { Excalidraw } from "@excalidraw/excalidraw";

<Excalidraw
  excalidrawAPI={(api) => {
    excalidrawApiRef.current = api;
  }}
/>
```

Extract scene for save:

```ts
const elements = excalidrawApiRef.current.getSceneElements();
const appState = excalidrawApiRef.current.getAppState();
const files = excalidrawApiRef.current.getFiles?.() ?? {};

const scenePayload = { elements, appState, files };
```

Restore scene from persisted data:

```tsx
<Excalidraw
  initialData={{
    elements: savedScene.elements,
    appState: savedScene.appState,
    files: savedScene.files,
  }}
/>
```

Recommended whiteboard data shape (multi-instance):

```ts
const whiteboardData = {
  id: "board-1",
  excalidrawItems: [
    {
      id: "item-1",
      position: { x: 0.12, y: 0.18 },
      size: { w: 0.48, h: 0.36 },
      sceneData: { elements, appState, files },
    },
  ],
};
```

Store version together with scene data:

```ts
const persistedScene = {
  excalidrawVersion: "0.17.x",
  data: { elements, appState, files },
};
```

Storage note:
- persist scene JSON in DB (PostgreSQL JSONB/document DB is fine)
- avoid large inline base64 files when possible; store binaries externally and keep ids/urls in `files`

## changes made and experiences gained from in commit bbaaff9 on CompExcalidraw.tsx:

- root bug: viewport update attempts came from non-user source (Excalidraw internal post-load/layout/onChange), then wrote wrong `zoomBySlideWidth`
- when/where: after slide return or reload, in `CompExcalidraw` `onChange` path, delayed attempt overwrote user zoom state
- key conflict: enabling built-in Excalidraw `+/-` needs permissive accept, but anti-drift needs strict reject of non-user viewport change
- difficulty: same callback (`onChange`) contains both real user zoom and internal auto-adjust, hard to distinguish with high confidence
- current workaround: use custom panel `-` `+` buttons (API-driven zoom + explicit persist), guard unauthorized viewport writes, and stop relying on built-in `+/-` as trusted source

key code points (from `CompExcalidraw.tsx`):

```ts
// apply persisted viewport when component mounts / slide switches
const { zoomValue, scrollX, scrollY } = computeAppliedViewport(effectiveViewport, slidePixelX);
api.updateScene({ appState: { zoom: { value: zoomValue }, scrollX, scrollY } });
```

```ts
// critical path where non-user attempts can appear (internal onChange after mount/layout)
onChange={(elements, appState, files) => {
  const nextZoomValue = Number(appState?.zoom?.value ?? 1);
  const nextScrollX = Number(appState?.scrollX ?? 0);
  const nextScrollY = Number(appState?.scrollY ?? 0);
  // ... authorization / revert / persist decision happens here
}}
```

```ts
// persist viewport to comp data (authoritative zoomBySlideWidth source)
const zoomBySlideWidth = zoomValue / slidePixelX;
store.requestContainerCompDataUpdate(containerId, {
  sceneViewport: { zoomBySlideWidth, scrollX, scrollY },
});
```

```ts
// workaround: custom zoom buttons bypass built-in excalidraw +/- ambiguity
handleCustomZoomStep('out');
handleCustomZoomStep('in');
// internally: api.updateScene(...) + commitViewportFromApi(...);
```