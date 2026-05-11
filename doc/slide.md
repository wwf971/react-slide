



## Frontend Hierarchy

```
store
  -> Slide (document-level provider + page switch toolbar)
  -> Page (current page surface + layer)
  -> CompContainer (select, move, resize shell)
  -> Comp (resolved by getComp, e.g. text/image/metadata)
```

Hierarchy of persisted entities:

```
slide-group -> slide -> page
```


## Size System and Full-Window Behavior
  - container geometry is ratio based: `pos.x/y` and `size.x/y` are percentages of `slide-page-layer`
  - drag/resize converts pointer delta by current page pixel size: `deltaX / pageRect.width`, `deltaY / pageRect.height`
  - component pixel size is derived by `ResizeObserver` on each `CompContainer`, so pixel values always depend on current layer size
  - full-window issue was not ratio model itself; it was layout constraints:
    - full-window root had padding
    - canvas wrapper still had border + padding
    - page surface still followed normal `width: min(100%, 960px)` path in practice
  - fix in css keeps ratio model and maximizes page fit in viewport:
    - full-window removes extra padding/border wrapper constraints
    - page surface uses viewport-constrained ratio fit:
      - `width: min(100vw, 100vh * aspectRatio)`
      - `height: min(100vh, 100vw / aspectRatio)`
    - `slide-page-layer` still stays `width:100%; height:100%`, so ratio coords and derived pixel sizes remain consistent


## Create New Component on Page

1. Create via guidance component `CompSwitcher` in `/frontend/src/comp_custom/CompSwitcher.tsx`; available options are resolved by component name rule `CompXxxx.tsx -> Xxx`.

2. Create via context menu (right click menu), by right clicking on empty space of a page.

## Custom Components

For how to implement/things you need to be careful about when implementing a custom component, see ./comp_custom_design.md



## temporarily make component container display overflown content.

`CompIFrame` can open an iframe panel outside container bounds by using runtime-only overflow visibility in `contentStore` (`setContainerOverflowVisible`), so iframe open/close state is not persisted.



to run test server:

```
pnpm run slides
```