import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useSlidesStore } from '../store/slidesStore';

const CompTextMultline = observer(
  ({ data, containerId, compId, requestContainerMoveByPoint, isReadOnly }: any) => {
  const store = useSlidesStore();
  const rootRef = useRef<any>(null);
  const textareaRef = useRef(null);
  const dragStateRef = useRef<any>(null);
  const textValue = data?.text ?? '';
  const isSelected = store.selectedContainerId === containerId;
  const isEditing = store.isCompEditing(compId);
  const containerSize = store.getContainerSize(containerId);
  const containerData = store.getContainerData(containerId);
  const fontScaleValueRaw = Number(data?.fontScale);
  const fontScale = Number.isFinite(fontScaleValueRaw) ? fontScaleValueRaw : 1;
  const containerRatioWidth = Number(containerData?.size?.x ?? 0);
  const pagePixelWidth =
    containerRatioWidth > 0 ? containerSize.pixelX / Math.max(containerRatioWidth, 0.0001) : 0;
  const safePagePixelWidth = pagePixelWidth > 0 ? pagePixelWidth : 900;
  const fontPixelSize = Math.min(
    48,
    Math.max(10, (safePagePixelWidth * Math.max(fontScale, 0.4)) / 100),
  );

  useEffect(() => {
    const rootElement = rootRef.current;
    if (!rootElement) return;
    rootElement.style.setProperty('--slide-comp-font-size', `${fontPixelSize}px`);
  }, [fontPixelSize]);

  const requestFit = () => {
    const element = textareaRef.current;
    if (!element) return;
    const prevHeight = element.style.height;
    const prevOverflowY = element.style.overflowY;
    element.style.height = '0px';
    element.style.overflowY = 'hidden';
    const measuredPixelY = Math.ceil(element.scrollHeight) + 2;
    element.style.height = prevHeight;
    element.style.overflowY = prevOverflowY;

    const currentContainerSize = store.getContainerSize(containerId);
    const initialPixelX = data?.initialPixelSize?.pixelX ?? 0;
    const initialPixelY = data?.initialPixelSize?.pixelY ?? 0;
    const nextPixelX = Math.max(currentContainerSize.pixelX, initialPixelX);
    const nextPixelY = Math.max(measuredPixelY, initialPixelY);
    if (
      nextPixelX === currentContainerSize.pixelX &&
      nextPixelY === currentContainerSize.pixelY
    ) {
      return;
    }
    store.requestContainerFitToPixelSize(containerId, {
      pixelX: nextPixelX,
      pixelY: nextPixelY,
    });
  };

  useEffect(() => {
    requestFit();
  }, [
    textValue,
    fontPixelSize,
    data?.initialPixelSize?.pixelX,
    data?.initialPixelSize?.pixelY,
  ]);

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
    const element = textareaRef.current;
    if (!element) return;
    element.focus();
  }, [isEditing]);

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

  return (
    <div ref={rootRef} className="slide-text-root">
      {isEditing ? (
        <textarea
          ref={textareaRef}
          className="slide-textarea"
          readOnly={isReadOnly}
          value={textValue}
          onChange={(event) => {
            if (isReadOnly) return;
            store.requestContainerCompDataUpdate(containerId, {
              text: event.target.value,
            });
          }}
        />
      ) : (
        <div
          className="slide-text-view"
          onPointerDown={(event) => {
            if (isReadOnly) return;
            if (event.button !== 0) return;
            const startX = event.clientX;
            const startY = event.clientY;
            const onPointerMove = (nextEvent) => {
              const deltaX = nextEvent.clientX - startX;
              const deltaY = nextEvent.clientY - startY;
              const isDragStart = Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3;
              if (!isDragStart) return;
              if (dragStateRef.current?.isStarted) return;
              dragStateRef.current.isStarted = true;
              if (!requestContainerMoveByPoint) return;
              requestContainerMoveByPoint({ x: startX, y: startY });
            };
            const onPointerUp = () => {
              window.removeEventListener('pointermove', onPointerMove);
              window.removeEventListener('pointerup', onPointerUp);
              dragStateRef.current = null;
            };
            dragStateRef.current = { isStarted: false, onPointerMove, onPointerUp };
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
          }}
          onDoubleClick={() => {
            if (isReadOnly) return;
            store.setSelectedContainer(containerId);
            if (compId) {
              store.setEditingComp(compId);
            } else {
              store.clearEditingComp();
            }
          }}
        >
          {textValue}
        </div>
      )}
    </div>
  );
  },
);

export default CompTextMultline;
