import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import Menu from '@wwf971/react-comp-misc/Menu';
import CompContainer from '../CompContainer';
import { useSlidesStore } from '../store/slidesStore';
import CompSwitcher from '../comp_custom/CompSwitcher';
import PageEdgeNavControls from './PageEdgeNavControls';
import PageFullWindowButton from './PageFullWindowButton';

const PAGE_HANDLE_DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

const clamp = (value, min, max) => {
  return Math.min(max, Math.max(min, value));
};

const Page = observer(({
  pageId,
  getComp,
  isPrevEnabled,
  isNextEnabled,
  onGoPrev,
  onGoNext,
  onCreateNextPage,
  isFullWindow,
  onToggleFullWindow,
  isEdgeNavVisible = true,
  isFullWindowButtonVisible = true,
  isPageResizeEnabled = true,
  onPageSurfaceClick,
}: any) => {
  const store = useSlidesStore();
  const containers = store.getPageContainers(pageId);
  const pageAspectRatio = store.getPageAspectRatio();
  const slideSurfacePixelSize = store.getSlideSurfacePixelSize();
  const isPasteEnabled = store.getHasCopiedContainer();
  const [menuState, setMenuState] = useState<any>(null);
  const isReadOnly = store.isPersisting;
  const slideSurfaceRef = useRef<any>(null);
  const slideShellRef = useRef<any>(null);
  const [slidePixelWidth, setSlidePixelWidth] = useState(0);

  useEffect(() => {
    const element = slideSurfaceRef.current;
    if (!element) return undefined;
    const resizeObserver = new ResizeObserver((entries) => {
      const nextRect = entries[0]?.contentRect;
      if (!nextRect) return;
      setSlidePixelWidth(nextRect.width);
      store.setSlidePagePixelSize({
        pixelX: nextRect.width,
        pixelY: nextRect.height,
      });
    });
    resizeObserver.observe(element);
    return () => {
      resizeObserver.disconnect();
    };
  }, [isFullWindow, pageId, store]);

  const styleVars = useMemo((): any => {
    const safePagePixelWidth = Math.max(320, slidePixelWidth || 960);
    const pageUiBtnSize = clamp(safePagePixelWidth * 0.021, 16, 34);
    const pageUiFontSize = clamp(safePagePixelWidth * 0.0115, 10, 14);
    const edgeNavBtnWidth = clamp(safePagePixelWidth * 0.035, 28, 60);
    const edgeNavBtnHeight = Math.round(edgeNavBtnWidth * 1.5);
    const edgeNavIconSize = clamp(edgeNavBtnWidth * 0.52, 14, 28);
    const fullWindowBtnSize = clamp(safePagePixelWidth * 0.043, 30, 68);
    const fullWindowIconSize = clamp(fullWindowBtnSize * 0.48, 14, 30);
    const switcherFontSize = clamp(safePagePixelWidth * 0.012, 11, 20);
    const switcherDescFontSize = clamp(safePagePixelWidth * 0.0105, 10, 17);
    const switcherInputHeight = clamp(safePagePixelWidth * 0.028, 24, 44);
    const switcherOptionHeight = clamp(safePagePixelWidth * 0.023, 20, 36);
    const temporarySwitcherWidthRatio = 0.24;
    const temporarySwitcherHeightRatio = 0.09;
    const nextStyle: any = {
      '--slide-page-aspect-ratio': `${pageAspectRatio}`,
      '--slide-ui-btn-size': `${pageUiBtnSize}px`,
      '--slide-ui-font-size': `${pageUiFontSize}px`,
      '--slide-edge-nav-btn-width': `${edgeNavBtnWidth}px`,
      '--slide-edge-nav-btn-height': `${edgeNavBtnHeight}px`,
      '--slide-edge-nav-icon-size': `${edgeNavIconSize}px`,
      '--slide-full-window-btn-size': `${fullWindowBtnSize}px`,
      '--slide-full-window-icon-size': `${fullWindowIconSize}px`,
      '--slide-switcher-font-size': `${switcherFontSize}px`,
      '--slide-switcher-desc-font-size': `${switcherDescFontSize}px`,
      '--slide-switcher-input-height': `${switcherInputHeight}px`,
      '--slide-switcher-option-height': `${switcherOptionHeight}px`,
      '--slide-temp-switcher-width-ratio': `${temporarySwitcherWidthRatio}`,
      '--slide-temp-switcher-height-ratio': `${temporarySwitcherHeightRatio}`,
    };
    if (!isFullWindow && slideSurfacePixelSize.pixelX > 0 && slideSurfacePixelSize.pixelY > 0) {
      nextStyle.width = `${slideSurfacePixelSize.pixelX}px`;
      nextStyle.height = `${slideSurfacePixelSize.pixelY}px`;
    }
    return nextStyle;
  }, [
    isFullWindow,
    pageAspectRatio,
    slidePixelWidth,
    slideSurfacePixelSize.pixelX,
    slideSurfacePixelSize.pixelY,
  ]);

  const menuItems = useMemo(() => {
    const newChildren = store.getAvailableCompNames().map((compName) => ({
      type: 'item' as const,
      name: compName,
      data: { action: 'new-comp', compName },
      disabled: isReadOnly,
    }));
    return [
      {
        type: 'menu' as const,
        name: 'New',
        children: newChildren,
        disabled: isReadOnly,
      },
      {
        type: 'item' as const,
        name: 'Paste',
        data: { action: 'paste-container' },
        disabled: isReadOnly || !isPasteEnabled,
      },
    ];
  }, [store, isReadOnly, isPasteEnabled]);

  const openContextMenu = (event) => {
    if (event.target !== event.currentTarget) return;
    if (isReadOnly) return;
    event.preventDefault();
    event.stopPropagation();
    store.clearSelectedContainer();
    const pageRect = event.currentTarget.getBoundingClientRect();
    const safeWidth = Math.max(pageRect?.width || 0, 1);
    const safeHeight = Math.max(pageRect?.height || 0, 1);
    const anchorX = Math.min(1, Math.max(0, (event.clientX - pageRect.left) / safeWidth));
    const anchorY = Math.min(1, Math.max(0, (event.clientY - pageRect.top) / safeHeight));
    const nextState = {
      position: { x: event.clientX, y: event.clientY },
      anchorPoint: { x: anchorX, y: anchorY },
    };
    setMenuState(null);
    requestAnimationFrame(() => {
      setMenuState(nextState);
    });
  };

  const requestSlideResizeByPointer = (event, dir) => {
    if (!isPageResizeEnabled || isFullWindow || isReadOnly) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    store.setSlideSurfaceSelected();
    const surfaceRect = slideSurfaceRef.current?.getBoundingClientRect();
    const shellRect = slideShellRef.current?.getBoundingClientRect();
    if (!surfaceRect || !shellRect) return;

    const startWidth = surfaceRect.width;
    const startHeight = surfaceRect.height;
    const startX = event.clientX;
    const startY = event.clientY;
    const hasN = dir.includes('n');
    const hasS = dir.includes('s');
    const hasE = dir.includes('e');
    const hasW = dir.includes('w');
    const isCorner = (hasN || hasS) && (hasE || hasW);

    const maxWidthByShell = Math.max(220, shellRect.width);
    const maxHeightByShell = Math.max(120, shellRect.height);
    const maxWidthByRatio = maxHeightByShell * pageAspectRatio;
    const maxAllowedWidth = Math.max(220, Math.min(maxWidthByShell, maxWidthByRatio));
    const minAllowedWidth = 220;

    const onPointerMove = (nextEvent) => {
      nextEvent.preventDefault();
      const deltaX = nextEvent.clientX - startX;
      const deltaY = nextEvent.clientY - startY;
      const widthByX = startWidth + (hasE ? deltaX : 0) + (hasW ? -deltaX : 0);
      const heightByY = startHeight + (hasS ? deltaY : 0) + (hasN ? -deltaY : 0);

      let nextWidth = startWidth;
      if (isCorner) {
        const scaleX = widthByX / Math.max(startWidth, 1);
        const scaleY = heightByY / Math.max(startHeight, 1);
        const scaleByX = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1);
        const nextScale = scaleByX ? scaleX : scaleY;
        nextWidth = startWidth * nextScale;
      } else if (hasE || hasW) {
        nextWidth = widthByX;
      } else if (hasN || hasS) {
        nextWidth = heightByY * pageAspectRatio;
      }

      nextWidth = clamp(nextWidth, minAllowedWidth, maxAllowedWidth);
      const nextHeight = nextWidth / pageAspectRatio;
      store.setSlideSurfacePixelSize({
        pixelX: nextWidth,
        pixelY: nextHeight,
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      document.body.style.userSelect = '';
    };

    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const convertFileToDataUrl = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(`${reader.result ?? ''}`);
      reader.onerror = () => reject(new Error('failed to read image data'));
      reader.readAsDataURL(file);
    });
  };

  const requestCreateImageCompByPaste = async (file) => {
    const createContainerResult = store.requestCreateContainerWithComp('CompImage', {
      x: 0.5,
      y: 0.5,
    });
    if (!createContainerResult?.ok || !createContainerResult?.containerId) return;
    const createResourceResult = await store.requestCreateBytesResource();
    if (!createResourceResult?.ok || !createResourceResult?.resourceId) return;
    const imageDataUrl = await convertFileToDataUrl(file);
    const saveResourceResult = await store.requestSetResourceBytes(
      createResourceResult.resourceId,
      imageDataUrl,
    );
    if (!saveResourceResult?.ok) return;
    store.requestContainerCompDataUpdate(createContainerResult.containerId, {
      imageResourceId: createResourceResult.resourceId,
      imageMimeType: file.type || 'image/png',
      imageUrl: '',
      isCover: true,
    });
  };

  const requestCreateTextCompByPaste = (textValue) => {
    const trimmedText = `${textValue ?? ''}`;
    if (!trimmedText.trim()) return;
    const createContainerResult = store.requestCreateContainerWithComp('CompTextMultline', {
      x: 0.5,
      y: 0.5,
    });
    if (!createContainerResult?.ok || !createContainerResult?.containerId) return;
    store.requestContainerCompDataUpdate(createContainerResult.containerId, {
      text: trimmedText,
    });
  };

  const requestCreateSwitcherCompByPoint = (event) => {
    if (isReadOnly) return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    event.stopPropagation();
    const selection = window.getSelection?.();
    selection?.removeAllRanges?.();
    const pageRect = event.currentTarget.getBoundingClientRect();
    const safeWidth = Math.max(pageRect?.width || 0, 1);
    const safeHeight = Math.max(pageRect?.height || 0, 1);
    const anchorX = Math.min(1, Math.max(0, (event.clientX - pageRect.left) / safeWidth));
    const anchorY = Math.min(1, Math.max(0, (event.clientY - pageRect.top) / safeHeight));
    store.openTemporarySwitcher(pageId, {
      x: anchorX,
      y: anchorY,
    });
  };

  const temporarySwitcher = store.getTemporarySwitcher(pageId);

  return (
    <div ref={slideShellRef} className="slide-page-shell">
      <div ref={slideSurfaceRef} className="slide-page-surface" style={styleVars}>
        <div
          className="slide-page-layer"
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return;
            store.setSlideSurfaceSelected();
            onPageSurfaceClick?.();
          }}
          onPaste={(event) => {
            if (isReadOnly) return;
            if (event.target !== event.currentTarget) return;
            const imageItem = Array.from(event.clipboardData?.items ?? []).find((item: any) => {
              return item?.type?.startsWith('image/');
            });
            if (imageItem) {
              const file = imageItem.getAsFile?.();
              if (!file) return;
              event.preventDefault();
              event.stopPropagation();
              requestCreateImageCompByPaste(file).catch(() => {});
              return;
            }
            const pastedText = event.clipboardData?.getData('text/plain') ?? '';
            if (!pastedText.trim()) return;
            event.preventDefault();
            event.stopPropagation();
            requestCreateTextCompByPaste(pastedText);
          }}
          onContextMenu={openContextMenu}
          onDoubleClick={requestCreateSwitcherCompByPoint}
        >
          {isEdgeNavVisible ? (
            <PageEdgeNavControls
              isPrevEnabled={isPrevEnabled}
              isNextEnabled={isNextEnabled}
              onGoPrev={onGoPrev}
              onGoNext={onGoNext}
              onCreateNextPage={onCreateNextPage}
            />
          ) : null}
          {isFullWindowButtonVisible ? (
            <PageFullWindowButton
              isFullWindow={isFullWindow}
              onToggleFullWindow={onToggleFullWindow}
            />
          ) : null}
          {isPageResizeEnabled && store.isSlideSurfaceSelected && !isFullWindow && !isReadOnly
            ? PAGE_HANDLE_DIRS.map((dir) => (
                <button
                  key={dir}
                  className={`slide-page-resize-handle handle-${dir}`}
                  type="button"
                  onPointerDown={(event) => requestSlideResizeByPointer(event, dir)}
                />
              ))
            : null}
          {containers.map((containerData) => (
            <CompContainer
              key={containerData.id}
              containerId={containerData.id}
              getComp={getComp}
            />
          ))}
          {temporarySwitcher ? (
            <div
              className="slide-temp-switcher-wrap"
              style={{
                left: `${temporarySwitcher.anchorPoint.x * 100}%`,
                top: `${temporarySwitcher.anchorPoint.y * 100}%`,
              }}
            >
              <CompSwitcher
                textValue={temporarySwitcher.text ?? ''}
                availableCompNames={store.getAvailableCompNames()}
                availableCompScripts={store.getAvailableCompScripts()}
                isReadOnly={isReadOnly}
                onChangeText={(nextText) => {
                  store.updateTemporarySwitcherText(pageId, nextText);
                }}
                onCancel={() => {
                  store.closeTemporarySwitcher(pageId);
                }}
                onConfirm={(payload) => {
                  store.confirmTemporarySwitcher(pageId, payload);
                }}
              />
            </div>
          ) : null}
          {menuState?.position && !isReadOnly ? (
            <Menu
              items={menuItems}
              position={menuState.position}
              onClose={() => setMenuState(null)}
              onContextMenu={openContextMenu}
              onItemClick={(item) => {
                if (item?.data?.action === 'new-comp') {
                  store.requestCreateContainerWithComp(item.data.compName, menuState.anchorPoint);
                }
                if (item?.data?.action === 'paste-container') {
                  store.requestPasteCopiedContainerToPage(pageId, menuState.anchorPoint);
                }
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
});

export default Page;
