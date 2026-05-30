import React, { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import DragIcon from '@wwf971/react-comp-misc/DragIcon';
import Menu from '@wwf971/react-comp-misc/Menu';
import { useSlidesStore } from './store/slidesStore';

const HANDLE_DIRS = [
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
  'nw',
];

const MIN_RATIO_SIZE = 0.03;
const MAX_RATIO_SIZE = 4;
const FONT_SCALE_MIN = 0.4;
const FONT_SCALE_MAX = 3;
const FONT_SCALE_STEP = 0.05;
const FONT_SCALE_HOLD_INTERVAL_MS = 90;
const CONTAINER_Z_INDEX_BASE = 30;

const clamp = (value, min, max) => {
  return Math.min(max, Math.max(min, value));
};

const normalizeRect = (rect) => {
  const width = clamp(rect.width, MIN_RATIO_SIZE, MAX_RATIO_SIZE);
  const height = clamp(rect.height, MIN_RATIO_SIZE, MAX_RATIO_SIZE);
  const left = Number.isFinite(rect.left) ? rect.left : 0;
  const top = Number.isFinite(rect.top) ? rect.top : 0;
  return { left, top, width, height };
};

const toRectFromContainer = (containerData) => {
  return {
    left: containerData.pos.x,
    top: containerData.pos.y,
    width: containerData.size.x,
    height: containerData.size.y,
  };
};

const fromRectToContainer = (rect) => {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
};

const applyAspectByDirection = (startRect, rect, dir) => {
  const aspectRatio = startRect.width / startRect.height;
  if (!aspectRatio || !Number.isFinite(aspectRatio)) return rect;

  let left = rect.left;
  let top = rect.top;
  let width = rect.width;
  let height = rect.height;

  const hasN = dir.includes('n');
  const hasS = dir.includes('s');
  const hasE = dir.includes('e');
  const hasW = dir.includes('w');
  const isCorner = (hasN || hasS) && (hasE || hasW);
  const centerX = startRect.left + startRect.width / 2;
  const centerY = startRect.top + startRect.height / 2;

  if (isCorner) {
    if (width / height > aspectRatio) {
      width = height * aspectRatio;
    } else {
      height = width / aspectRatio;
    }

    if (hasW) {
      left = startRect.left + startRect.width - width;
    } else {
      left = startRect.left;
    }

    if (hasN) {
      top = startRect.top + startRect.height - height;
    } else {
      top = startRect.top;
    }
    return { left, top, width, height };
  }

  if (hasE || hasW) {
    height = width / aspectRatio;
    top = centerY - height / 2;
    if (hasW) {
      left = startRect.left + startRect.width - width;
    } else {
      left = startRect.left;
    }
    return { left, top, width, height };
  }

  if (hasN || hasS) {
    width = height * aspectRatio;
    left = centerX - width / 2;
    if (hasN) {
      top = startRect.top + startRect.height - height;
    } else {
      top = startRect.top;
    }
    return { left, top, width, height };
  }

  return { left, top, width, height };
};

const clampResizeRectByDirection = (startRect, rect, dir, limits) => {
  const hasN = dir.includes('n');
  const hasS = dir.includes('s');
  const hasE = dir.includes('e');
  const hasW = dir.includes('w');
  const minWidth = Math.max(MIN_RATIO_SIZE, limits?.minWidth ?? 0);
  const minHeight = Math.max(MIN_RATIO_SIZE, limits?.minHeight ?? 0);
  const maxWidth = Math.max(minWidth, MAX_RATIO_SIZE);
  const maxHeight = Math.max(minHeight, MAX_RATIO_SIZE);

  let left = rect.left;
  let top = rect.top;
  let width = clamp(rect.width, minWidth, maxWidth);
  let height = clamp(rect.height, minHeight, maxHeight);

  if (hasW) {
    left = startRect.left + startRect.width - width;
  } else if (!hasE) {
    left = Number.isFinite(rect.left) ? rect.left : startRect.left;
  } else {
    left = startRect.left;
  }

  if (hasN) {
    top = startRect.top + startRect.height - height;
  } else if (!hasS) {
    top = Number.isFinite(rect.top) ? rect.top : startRect.top;
  } else {
    top = startRect.top;
  }

  return { left, top, width, height };
};

const resolveCursorClass = (dir) => {
  if (dir === 'n' || dir === 's') return 'cursor-ns';
  if (dir === 'e' || dir === 'w') return 'cursor-ew';
  if (dir === 'ne' || dir === 'sw') return 'cursor-nesw';
  return 'cursor-nwse';
};

const FontScaleControl = ({ fontScaleValue, onChangeFontScale }: any) => {
  const latestFontScaleRef = useRef(fontScaleValue);
  const holdTimerRef = useRef<any>(null);

  useEffect(() => {
    latestFontScaleRef.current = fontScaleValue;
  }, [fontScaleValue]);

  useEffect(() => {
    return () => {
      if (!holdTimerRef.current) return;
      window.clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    };
  }, []);

  const stopHold = () => {
    if (!holdTimerRef.current) return;
    window.clearInterval(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const requestStep = (delta) => {
    const nextValue = clamp(
      Number((latestFontScaleRef.current + delta).toFixed(2)),
      FONT_SCALE_MIN,
      FONT_SCALE_MAX,
    );
    latestFontScaleRef.current = nextValue;
    onChangeFontScale(nextValue);
  };

  const beginHold = (delta, event) => {
    event.preventDefault();
    event.stopPropagation();
    requestStep(delta);
    stopHold();
    holdTimerRef.current = window.setInterval(() => {
      requestStep(delta);
    }, FONT_SCALE_HOLD_INTERVAL_MS);
    const releaseHold = () => {
      stopHold();
      window.removeEventListener('pointerup', releaseHold, true);
      window.removeEventListener('blur', releaseHold);
    };
    window.addEventListener('pointerup', releaseHold, true);
    window.addEventListener('blur', releaseHold);
  };

  return (
    <div
      className="slide-font-menu-control"
      onClick={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <input
        className="slide-font-menu-input"
        value={`${fontScaleValue}`}
        onChange={(event) => {
          event.stopPropagation();
          const nextValue = Number(event.target.value);
          if (!Number.isFinite(nextValue)) return;
          onChangeFontScale(clamp(nextValue, FONT_SCALE_MIN, FONT_SCALE_MAX));
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
      />
      <button
        className="slide-font-menu-step-btn"
        type="button"
        onPointerDown={(event) => beginHold(FONT_SCALE_STEP, event)}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
          <polyline points="18,15 12,9 6,15" />
        </svg>
      </button>
      <button
        className="slide-font-menu-step-btn"
        type="button"
        onPointerDown={(event) => beginHold(-FONT_SCALE_STEP, event)}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </button>
    </div>
  );
};

const CompContainer = observer(({ containerId, getComp }: any) => {
  const store: any = useSlidesStore();
  const containerData = store.getContainerData(containerId);
  const isSelected = store.selectedContainerId === containerId;
  const isReadOnly = store.isPersisting;
  const isOverflowVisible = store.getIsContainerOverflowVisible(containerId);
  const isPasteEnabled = store.getHasCopiedContainer();
  const [isHovering, setIsHovering] = useState(false);
  const [menuState, setMenuState] = useState<any>(null);
  const interactionRef = useRef<any>(null);
  const containerRef = useRef<any>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const resizeObserver = new ResizeObserver((entries) => {
      const nextRect = entries[0]?.contentRect;
      if (!nextRect) return;
      store.setContainerPixelSize(containerId, {
        pixelX: Math.round(nextRect.width),
        pixelY: Math.round(nextRect.height),
      });
    });
    resizeObserver.observe(element);
    return () => {
      resizeObserver.disconnect();
    };
  }, [containerId, store]);

  useEffect(() => {
    return () => {
      const active = interactionRef.current;
      if (!active) return;
      window.removeEventListener('pointermove', active.onPointerMove);
      window.removeEventListener('pointerup', active.onPointerUp);
      document.body.style.userSelect = '';
    };
  }, []);

  const startInteraction = (startPointer, mode, dir) => {
    if (isReadOnly) return;
    if (!containerData) return;
    store.setSelectedContainer(containerId);

    const startRect = toRectFromContainer(containerData);
    const pageElement = containerRef.current?.parentElement;
    const pageRect = pageElement?.getBoundingClientRect();
    const safeWidth = Math.max(pageRect?.width || 0, 1);
    const safeHeight = Math.max(pageRect?.height || 0, 1);

    const onPointerMove = (nextEvent) => {
      nextEvent.preventDefault();

      const deltaX = (nextEvent.clientX - startPointer.x) / safeWidth;
      const deltaY = (nextEvent.clientY - startPointer.y) / safeHeight;
      let nextRect = { ...startRect };

      if (mode === 'move') {
        nextRect.left = startRect.left + deltaX;
        nextRect.top = startRect.top + deltaY;
      } else {
        const hasN = dir.includes('n');
        const hasS = dir.includes('s');
        const hasE = dir.includes('e');
        const hasW = dir.includes('w');

        let left = startRect.left;
        let top = startRect.top;
        let right = startRect.left + startRect.width;
        let bottom = startRect.top + startRect.height;

        if (hasW) left = startRect.left + deltaX;
        if (hasE) right = startRect.left + startRect.width + deltaX;
        if (hasN) top = startRect.top + deltaY;
        if (hasS) bottom = startRect.top + startRect.height + deltaY;

        const width = right - left;
        const height = bottom - top;
        nextRect = {
          left,
          top,
          width,
          height,
        };

        if (nextEvent.shiftKey) {
          nextRect = applyAspectByDirection(startRect, nextRect, dir);
        }

        const minPixelSize = store.getContainerMinPixelSize(containerId);
        const minRatioWidth =
          minPixelSize.pixelX > 0 ? minPixelSize.pixelX / safeWidth : MIN_RATIO_SIZE;
        const minRatioHeight =
          minPixelSize.pixelY > 0 ? minPixelSize.pixelY / safeHeight : MIN_RATIO_SIZE;
        nextRect = clampResizeRectByDirection(startRect, nextRect, dir, {
          minWidth: minRatioWidth,
          minHeight: minRatioHeight,
        });
      }

      const safeRect = normalizeRect(nextRect);
      store.requestContainerRectUpdate(containerId, fromRectToContainer(safeRect));
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      interactionRef.current = null;
      document.body.style.userSelect = '';
    };

    interactionRef.current = { onPointerMove, onPointerUp };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const beginInteraction = (event, mode, dir) => {
    if (isReadOnly) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    startInteraction({ x: event.clientX, y: event.clientY }, mode, dir);
  };

  const Comp = useMemo(() => {
    if (!containerData) return null;
    const compData = store.getCompData(containerData.compId);
    if (!compData) return null;
    return getComp(compData.compName);
  }, [containerData, getComp, store]);

  if (!containerData || !Comp) return null;
  const compData = store.getCompData(containerData.compId);
  if (!compData) return null;

  const containerStyle = {
    left: `${containerData.pos.x * 100}%`,
    top: `${containerData.pos.y * 100}%`,
    width: `${containerData.size.x * 100}%`,
    height: `${containerData.size.y * 100}%`,
    zIndex: CONTAINER_Z_INDEX_BASE + (containerData.layer ?? 0),
  };

  const requestContainerMoveByPointer = (event) => {
    if (isReadOnly) return;
    beginInteraction(event, 'move', '');
  };

  const requestContainerMoveByPoint = (point) => {
    if (isReadOnly) return;
    if (!point) return;
    startInteraction({ x: point.x, y: point.y }, 'move', '');
  };

  const resolveAnchorPointByClient = (clientX, clientY) => {
    const pageElement = containerRef.current?.parentElement;
    const pageRect = pageElement?.getBoundingClientRect();
    const safeWidth = Math.max(pageRect?.width || 0, 1);
    const safeHeight = Math.max(pageRect?.height || 0, 1);
    const ratioX = clamp((clientX - (pageRect?.left || 0)) / safeWidth, 0, 1);
    const ratioY = clamp((clientY - (pageRect?.top || 0)) / safeHeight, 0, 1);
    return { x: ratioX, y: ratioY };
  };

  const openContextMenuAtPoint = (clientX, clientY) => {
    if (isReadOnly) return;
    store.setSelectedContainer(containerId);
    const nextState = {
      position: { x: clientX, y: clientY },
      anchorPoint: resolveAnchorPointByClient(clientX, clientY),
    };
    setMenuState(null);
    requestAnimationFrame(() => {
      setMenuState(nextState);
    });
  };

  const openContextMenu = (event) => {
    if (isReadOnly) return;
    event.preventDefault();
    event.stopPropagation();
    openContextMenuAtPoint(event.clientX, event.clientY);
  };

  const menuItems = useMemo(() => {
    const compName = compData?.compName ?? '';
    const isFontAdjustableComp =
      compName === 'CompTextSingleline' ||
      compName === 'CompTextMultline' ||
      compName === 'CompCode' ||
      compName === 'CompIFrame' ||
      compName === 'CompUrl';
    const isIFrameComp = compName === 'CompIFrame';
    const isUrlComp = compName === 'CompUrl';
    const fontScaleValueRaw = Number(compData?.compData?.fontScale);
    const fontScaleValue = Number.isFinite(fontScaleValueRaw) ? fontScaleValueRaw : 1;
    const safeFontScale = clamp(fontScaleValue, FONT_SCALE_MIN, FONT_SCALE_MAX);
    const fontScaleUnit = compData?.compData?.fontScaleUnit ?? '1/100 slide width';
    const getComponentMenuItems = (Comp as any)?.getMenuItems;
    const componentMenuItems =
      typeof getComponentMenuItems === 'function'
        ? getComponentMenuItems({
            data: compData?.compData ?? {},
            compData,
            containerData,
            containerId,
            store,
          })
        : [];
    const requestSetFontScale = (nextFontScale) => {
      store.requestContainerCompDataUpdate(containerId, {
        fontScale: clamp(nextFontScale, FONT_SCALE_MIN, FONT_SCALE_MAX),
        fontScaleUnit: '1/100 slide width',
      });
    };
    const newChildren = store.getAvailableCompNames().map((compName) => ({
      id: `new-comp-${compName}`,
      label: compName,
      data: { action: 'new-comp', compName },
    }));
    return [
      {
        id: 'new',
        label: 'New',
        children: newChildren,
      },
      {
        id: 'layer',
        label: 'Layer',
        children: [
          {
            id: 'layer-down',
            label: 'One Layer Down',
            data: { action: 'layer-down' },
          },
          {
            id: 'layer-up',
            label: 'One Layer Up',
            data: { action: 'layer-up' },
          },
          {
            id: 'layer-bottom',
            label: 'To Bottom Layer',
            data: { action: 'layer-bottom' },
          },
          {
            id: 'layer-top',
            label: 'To Top Layer',
            data: { action: 'layer-top' },
          },
        ],
      },
      ...(isFontAdjustableComp
        ? [
            {
              id: 'font',
              label: 'Font',
              children: [
                {
                  id: 'font-control',
                  label: (
                    <FontScaleControl
                      fontScaleValue={safeFontScale}
                      onChangeFontScale={requestSetFontScale}
                    />
                  ),
                  data: { action: 'font-control' },
                },
                {
                  id: 'font-decrease',
                  label: 'Decrease',
                  data: { action: 'font-decrease' },
                },
                {
                  id: 'font-increase',
                  label: 'Increase',
                  data: { action: 'font-increase' },
                },
                {
                  id: 'font-scale-0-8',
                  label: '0.8',
                  data: { action: 'font-set', fontScale: 0.8 },
                },
                {
                  id: 'font-scale-1',
                  label: '1.0',
                  data: { action: 'font-set', fontScale: 1.0 },
                },
                {
                  id: 'font-scale-1-2',
                  label: '1.2',
                  data: { action: 'font-set', fontScale: 1.2 },
                },
                {
                  id: 'font-scale-1-5',
                  label: '1.5',
                  data: { action: 'font-set', fontScale: 1.5 },
                },
              ],
            },
          ]
        : []),
      ...(Array.isArray(componentMenuItems) ? componentMenuItems : []),
      ...(isUrlComp
        ? [
            {
              id: 'url-edit',
              label: 'Edit URL',
              data: { action: 'url-edit' },
            },
          ]
        : []),
      {
        id: 'copy-container',
        label: 'Copy',
        data: { action: 'copy-container' },
      },
      {
        id: 'paste-container',
        label: 'Paste',
        data: { action: 'paste-container' },
        isDisabled: !isPasteEnabled,
      },
      {
        id: 'delete-container',
        label: 'Delete',
        data: { action: 'delete-container' },
      },
      ...(isIFrameComp
        ? [
            {
              id: 'iframe-cancel',
              label: 'Cancel IFrame',
              data: { action: 'iframe-cancel' },
            },
          ]
        : []),
    ];
  }, [Comp, store, compData, containerData, containerId, isPasteEnabled]);

  return (
    <div
      ref={containerRef}
      className={`slide-comp-wrap ${isSelected ? 'is-selected' : ''}`}
      style={containerStyle}
      onPointerDown={(event) => {
        if (isReadOnly) return;
        event.stopPropagation();
        store.setSelectedContainer(containerId);
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onContextMenu={openContextMenu}
    >
      <div className={`slide-comp-toolbar ${isHovering || isSelected ? 'is-visible' : ''}`}>
        <button
          className="slide-comp-menu-btn"
          disabled={isReadOnly}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openContextMenuAtPoint(event.clientX, event.clientY);
          }}
        >
          <svg
            className="slide-comp-menu-icon"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path d="M2 3.2H10" />
            <path d="M2 6H10" />
            <path d="M2 8.8H10" />
          </svg>
        </button>
        <button
          className="slide-comp-drag-btn"
          disabled={isReadOnly}
          onPointerDown={(event) => beginInteraction(event, 'move', '')}
          type="button"
        >
          <DragIcon size={12} />
        </button>
      </div>

      <div className={`slide-comp-content ${isOverflowVisible ? 'is-overflow-visible' : ''}`}>
        <Comp
          data={compData.compData}
          containerId={containerId}
          compId={compData.id}
          requestContainerMoveByPointer={requestContainerMoveByPointer}
          requestContainerMoveByPoint={requestContainerMoveByPoint}
          isReadOnly={isReadOnly}
        />
      </div>

      {isSelected &&
        !isReadOnly &&
        HANDLE_DIRS.map((dir) => (
          <button
            key={dir}
            className={`slide-comp-handle handle-${dir} ${resolveCursorClass(dir)}`}
            type="button"
            onPointerDown={(event) => beginInteraction(event, 'resize', dir)}
          />
        ))}
      {menuState?.position && !isReadOnly ? (
        <Menu
          data={{
            items: menuItems,
            position: menuState.position,
          }}
          onEvent={(eventType, eventData) => {
            if (eventType === 'close') {
              setMenuState(null);
              return;
            }
            if (eventType === 'backdropContextMenu') {
              openContextMenu(eventData.event);
              return;
            }
            if (eventType !== 'itemClick') return;
            const item = eventData.item;
            if (item?.data?.action === 'delete-container') {
              store.requestDeleteContainer(containerId);
            }
            if (item?.data?.action === 'copy-container') {
              store.requestCopyContainer(containerId);
            }
            if (item?.data?.action === 'paste-container') {
              store.requestPasteCopiedContainerToPage(
                store.metadata.currentPageId,
                menuState?.anchorPoint ?? null,
              );
            }
            if (item?.data?.action === 'iframe-cancel') {
              store.requestContainerCompDataUpdate(containerId, {
                isIframeActive: false,
              });
              store.setContainerOverflowVisible(containerId, false);
            }
            if (item?.data?.action === 'url-edit') {
              store.setSelectedContainer(containerId);
              store.setEditingComp(compData.id);
            }
            if (item?.data?.action === 'new-comp') {
              store.requestCreateContainerWithComp(item?.data?.compName, menuState.anchorPoint);
            }
            if (item?.data?.action === 'layer-up') {
              store.requestMoveContainerLayer(containerId, 'up');
            }
            if (item?.data?.action === 'layer-down') {
              store.requestMoveContainerLayer(containerId, 'down');
            }
            if (item?.data?.action === 'layer-top') {
              store.requestMoveContainerLayer(containerId, 'top');
            }
            if (item?.data?.action === 'layer-bottom') {
              store.requestMoveContainerLayer(containerId, 'bottom');
            }
            if (
              item?.data?.action === 'font-set' ||
              item?.data?.action === 'font-increase' ||
              item?.data?.action === 'font-decrease'
            ) {
              const fontScaleValueRaw = Number(compData?.compData?.fontScale);
              const fontScaleValue = Number.isFinite(fontScaleValueRaw) ? fontScaleValueRaw : 1;
              let nextFontScale = fontScaleValue;
              if (item?.data?.action === 'font-set') {
                nextFontScale = Number(item?.data?.fontScale ?? 1);
              }
              if (item?.data?.action === 'font-increase') {
                nextFontScale = fontScaleValue + FONT_SCALE_STEP;
              }
              if (item?.data?.action === 'font-decrease') {
                nextFontScale = fontScaleValue - FONT_SCALE_STEP;
              }
              store.requestContainerCompDataUpdate(containerId, {
                fontScale: clamp(nextFontScale, FONT_SCALE_MIN, FONT_SCALE_MAX),
                fontScaleUnit: '1/100 slide width',
              });
            }
            const handleComponentMenuItem = (Comp as any)?.handleMenuItem;
            if (typeof handleComponentMenuItem === 'function') {
              const isHandled = handleComponentMenuItem({
                item,
                data: compData?.compData ?? {},
                compData,
                containerData,
                containerId,
                store,
              });
              if (isHandled) return;
            }
          }}
        />
      ) : null}
    </div>
  );
});

export default CompContainer;
