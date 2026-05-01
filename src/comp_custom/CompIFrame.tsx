import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useSlidesStore } from '../store/slidesStore';

const clamp = (value, min, max) => {
  return Math.min(max, Math.max(min, value));
};

const CompIFrame = observer(({
  data,
  containerId,
  compId,
  requestContainerMoveByPoint,
  isReadOnly,
}: any) => {
  const store = useSlidesStore();
  const rootRef = useRef<any>(null);
  const toolbarRef = useRef<any>(null);
  const inputRef = useRef<any>(null);
  const dragStateRef = useRef<any>(null);
  const urlValue = `${data?.url ?? ''}`.trim();
  const isEditing = store.isCompEditing(compId);
  const isSelected = store.selectedContainerId === containerId;
  const containerSize = store.getContainerSize(containerId);
  const containerData = store.getContainerData(containerId);
  const containerRatioWidth = Number(containerData?.size?.x ?? 0);
  const pagePixelWidth =
    containerRatioWidth > 0 ? containerSize.pixelX / Math.max(containerRatioWidth, 0.0001) : 0;
  const safePagePixelWidth = pagePixelWidth > 0 ? pagePixelWidth : 900;
  const fontScaleValueRaw = Number(data?.fontScale);
  const fontScale = Number.isFinite(fontScaleValueRaw) ? fontScaleValueRaw : 1;
  const fontPixelSize = Math.min(
    48,
    Math.max(10, (safePagePixelWidth * Math.max(fontScale, 0.4)) / 100),
  );
  const widthRatioRaw = Number(data?.iframeSizeRatioBySlideWidth?.width);
  const heightRatioRaw = Number(data?.iframeSizeRatioBySlideWidth?.height);
  const widthRatio = Number.isFinite(widthRatioRaw) ? widthRatioRaw : 0.7;
  const heightRatio = Number.isFinite(heightRatioRaw) ? heightRatioRaw : 0.42;
  const iframePixelWidth = Math.round(safePagePixelWidth * clamp(widthRatio, 0.2, 1.5));
  const iframePixelHeight = Math.round(safePagePixelWidth * clamp(heightRatio, 0.16, 1.2));
  const isIframeActive = data?.isIframeActive === true;

  useEffect(() => {
    if (!isSelected && isEditing) {
      store.clearEditingComp();
    }
  }, [isSelected, isEditing, store]);

  useEffect(() => {
    if (isReadOnly && isEditing) {
      store.clearEditingComp();
    }
  }, [isReadOnly, isEditing, store]);

  useEffect(() => {
    if (!isEditing) return;
    const element = inputRef.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange?.(urlValue.length, urlValue.length);
  }, [isEditing, urlValue]);

  useEffect(() => {
    return () => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      if (dragState.onPointerMove) {
        window.removeEventListener('pointermove', dragState.onPointerMove);
      }
      if (dragState.onPointerUp) {
        window.removeEventListener('pointerup', dragState.onPointerUp);
      }
    };
  }, []);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    element.style.setProperty('--slide-iframe-width', `${iframePixelWidth}px`);
    element.style.setProperty('--slide-iframe-height', `${iframePixelHeight}px`);
    element.style.setProperty('--slide-comp-font-size', `${fontPixelSize}px`);
  }, [iframePixelWidth, iframePixelHeight, fontPixelSize]);

  useEffect(() => {
    if (containerSize.pixelX <= 0) return;
    const rootElement = rootRef.current;
    const toolbarElement = toolbarRef.current;
    if (!rootElement || !toolbarElement) return;
    const rootStyle = window.getComputedStyle(rootElement);
    const paddingTop = Number.parseFloat(rootStyle.paddingTop || '0') || 0;
    const paddingBottom = Number.parseFloat(rootStyle.paddingBottom || '0') || 0;
    const toolbarPixelY = Math.max(toolbarElement.offsetHeight, toolbarElement.scrollHeight);
    const minPixelY = Math.ceil(toolbarPixelY + paddingTop + paddingBottom + 1);
    store.requestEnsureContainerMinPixelSize(containerId, {
      pixelX: containerSize.pixelX,
      pixelY: minPixelY,
    });
  }, [containerId, containerSize.pixelX, fontPixelSize, isEditing, store, urlValue]);

  useEffect(() => {
    if (isIframeActive) {
      store.setContainerOverflowVisible(containerId, true);
      return;
    }
    store.setContainerOverflowVisible(containerId, false);
  }, [containerId, isIframeActive, store]);

  useEffect(() => {
    return () => {
      store.setContainerOverflowVisible(containerId, false);
    };
  }, [containerId, store]);

  const requestStartDragByPointer = (startX, startY) => {
    const onPointerMove = (nextEvent) => {
      const deltaX = nextEvent.clientX - startX;
      const deltaY = nextEvent.clientY - startY;
      const isDragStart = Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3;
      if (!isDragStart) return;
      if (dragStateRef.current?.isStarted) return;
      dragStateRef.current.isStarted = true;
      requestContainerMoveByPoint?.({ x: startX, y: startY });
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dragStateRef.current = null;
    };
    dragStateRef.current = { isStarted: false, onPointerMove, onPointerUp };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <div ref={rootRef} className="slide-iframe-root">
      <div ref={toolbarRef} className="slide-iframe-toolbar">
        {isEditing ? (
          <input
            ref={inputRef}
            className="slide-iframe-url-input"
            readOnly={isReadOnly}
            value={urlValue}
            placeholder="https://example.com"
            onBlur={() => {
              if (isReadOnly) return;
              store.clearEditingComp();
            }}
            onChange={(event) => {
              if (isReadOnly) return;
              store.requestContainerCompDataUpdate(containerId, {
                url: event.target.value,
                isIframeActive: false,
              });
              store.setContainerOverflowVisible(containerId, false);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onPaste={(event) => {
              event.stopPropagation();
            }}
          />
        ) : (
          <div
            className="slide-iframe-url-view"
            onPointerDown={(event) => {
              if (isReadOnly) return;
              if (event.button !== 0) return;
              requestStartDragByPointer(event.clientX, event.clientY);
            }}
            onDoubleClick={() => {
              if (isReadOnly) return;
              store.setSelectedContainer(containerId);
              store.setEditingComp(compId);
            }}
          >
            {urlValue}
          </div>
        )}
        <button
          className="slide-iframe-load-btn"
          type="button"
          disabled={isReadOnly || !urlValue}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isReadOnly) return;
            store.requestContainerCompDataUpdate(containerId, {
              isIframeActive: true,
            });
            store.setContainerOverflowVisible(containerId, true);
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          Load
        </button>
      </div>
      {isIframeActive ? (
        <div
          className="slide-iframe-panel"
          onPointerDown={(event) => {
            if (isReadOnly) return;
            const targetElement = event.target as HTMLElement;
            if (targetElement?.closest('iframe')) return;
            if (event.button !== 0) return;
            requestStartDragByPointer(event.clientX, event.clientY);
          }}
        >
          <iframe className="slide-iframe-element" src={urlValue} title={`iframe-${containerId}`} />
        </div>
      ) : null}
    </div>
  );
});

export default CompIFrame;
