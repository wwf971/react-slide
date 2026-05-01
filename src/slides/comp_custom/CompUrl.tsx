import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useSlidesStore } from '../contentStore';

const CompUrl = observer(({
  data,
  containerId,
  compId,
  requestContainerMoveByPoint,
  isReadOnly,
}: any) => {
  const store = useSlidesStore();
  const rootRef = useRef<any>(null);
  const rowRef = useRef<any>(null);
  const inputRef = useRef<any>(null);
  const dragStateRef = useRef<any>(null);
  const prevIsEditingRef = useRef(false);
  const shouldCommitOnExitRef = useRef(true);
  const persistedUrl = `${data?.url ?? ''}`;
  const [draftUrl, setDraftUrl] = useState(persistedUrl);
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
    element.setSelectionRange?.(draftUrl.length, draftUrl.length);
    shouldCommitOnExitRef.current = true;
  }, [isEditing]);

  useEffect(() => {
    if (isEditing) return;
    setDraftUrl(persistedUrl);
  }, [isEditing, persistedUrl]);

  useEffect(() => {
    const isExitingEditMode = prevIsEditingRef.current && !isEditing;
    prevIsEditingRef.current = isEditing;
    if (!isExitingEditMode) return;
    if (!shouldCommitOnExitRef.current) {
      shouldCommitOnExitRef.current = true;
      return;
    }
    const nextUrl = `${draftUrl ?? ''}`;
    if (nextUrl === persistedUrl) return;
    store.requestContainerCompDataUpdate(containerId, {
      url: nextUrl,
    });
  }, [containerId, draftUrl, isEditing, persistedUrl, store]);

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
    element.style.setProperty('--slide-comp-font-size', `${fontPixelSize}px`);
  }, [fontPixelSize]);

  useEffect(() => {
    if (containerSize.pixelX <= 0) return;
    const rootElement = rootRef.current;
    const rowElement = rowRef.current;
    if (!rootElement || !rowElement) return;
    const rootStyle = window.getComputedStyle(rootElement);
    const paddingTop = Number.parseFloat(rootStyle.paddingTop || '0') || 0;
    const paddingBottom = Number.parseFloat(rootStyle.paddingBottom || '0') || 0;
    const rowPixelY = Math.max(rowElement.offsetHeight, rowElement.scrollHeight);
    const minPixelY = Math.ceil(rowPixelY + paddingTop + paddingBottom + 1);
    store.requestEnsureContainerMinPixelSize(containerId, {
      pixelX: containerSize.pixelX,
      pixelY: minPixelY,
    });
  }, [containerId, containerSize.pixelX, draftUrl, fontPixelSize, isEditing, store]);

  const requestCommitDraftUrl = () => {
    const nextUrl = `${draftUrl ?? ''}`;
    if (nextUrl === persistedUrl) return;
    store.requestContainerCompDataUpdate(containerId, {
      url: nextUrl,
    });
  };

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
    <div ref={rootRef} className="slide-url-root">
      <div ref={rowRef} className="slide-url-row">
        {isEditing ? (
          <input
            ref={inputRef}
            className="slide-url-input"
            readOnly={isReadOnly}
            value={draftUrl}
            placeholder="https://example.com"
            onBlur={() => {
              if (isReadOnly) return;
              store.clearEditingComp();
            }}
            onChange={(event) => {
              if (isReadOnly) return;
              setDraftUrl(event.target.value);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onPaste={(event) => {
              event.stopPropagation();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                if (!isReadOnly) {
                  requestCommitDraftUrl();
                  shouldCommitOnExitRef.current = false;
                  store.clearEditingComp();
                }
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setDraftUrl(persistedUrl);
                shouldCommitOnExitRef.current = false;
                if (!isReadOnly) {
                  store.clearEditingComp();
                }
              }
            }}
          />
        ) : (
          <div
            className="slide-url-link"
            draggable={false}
            onDragStart={(event) => {
              event.preventDefault();
            }}
            onPointerDown={(event) => {
              if (isReadOnly) return;
              if (event.button !== 0) return;
              event.preventDefault();
              requestStartDragByPointer(event.clientX, event.clientY);
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!persistedUrl.trim()) return;
              window.open(persistedUrl, '_blank', 'noopener,noreferrer');
            }}
          >
            {persistedUrl.trim() || 'https://example.com'}
          </div>
        )}
      </div>
    </div>
  );
});

export default CompUrl;
