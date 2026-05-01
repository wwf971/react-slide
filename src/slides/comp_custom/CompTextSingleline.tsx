import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useSlidesStore } from '../contentStore';

const CompTextSingleline = observer(
  ({ data, containerId, compId, requestContainerMoveByPoint, isReadOnly }: any) => {
    const store = useSlidesStore();
    const rootRef = useRef<any>(null);
    const inputRef = useRef<any>(null);
    const measureRef = useRef<any>(null);
    const dragStateRef = useRef<any>(null);
    const [surfacePixelWidth, setSurfacePixelWidth] = useState(0);
    const textValue = data?.text ?? '';
    const isSelected = store.selectedContainerId === containerId;
    const isEditing = store.isCompEditing(compId);
    const containerSize = store.getContainerSize(containerId);
    const containerData = store.getContainerData(containerId);
    const fontScaleValueRaw = Number(data?.fontScale);
    const fontScale = Number.isFinite(fontScaleValueRaw) ? fontScaleValueRaw : 1;
    const containerRatioWidth = Number(containerData?.size?.x ?? 0);
    const pagePixelWidthByContainer =
      containerRatioWidth > 0 ? containerSize.pixelX / Math.max(containerRatioWidth, 0.0001) : 0;
    const safePagePixelWidth =
      surfacePixelWidth > 0
        ? surfacePixelWidth
        : pagePixelWidthByContainer > 0
          ? pagePixelWidthByContainer
          : 900;
    const fontPixelSize = Math.max(10, (safePagePixelWidth * Math.max(fontScale, 0.4)) / 100);

    useEffect(() => {
      const rootElement = rootRef.current;
      if (!rootElement) return;
      rootElement.style.setProperty('--slide-comp-font-size', `${fontPixelSize}px`);
    }, [fontPixelSize]);

    useEffect(() => {
      const rootElement = rootRef.current;
      const surfaceElement = rootElement?.closest?.('.slide-page-surface');
      if (!surfaceElement) return undefined;
      const updateSurfaceWidth = () => {
        const nextWidth = Math.max(0, Math.round(surfaceElement.getBoundingClientRect().width));
        setSurfacePixelWidth(nextWidth);
      };
      updateSurfaceWidth();
      const resizeObserver = new ResizeObserver(() => {
        updateSurfaceWidth();
      });
      resizeObserver.observe(surfaceElement);
      return () => {
        resizeObserver.disconnect();
      };
    }, []);

    const requestFit = () => {
      const measureElement = measureRef.current;
      if (!measureElement) return;
      const measuredPixelX = Math.ceil(measureElement.offsetWidth) + 18;
      const measuredPixelY = Math.max(24, Math.ceil(measureElement.offsetHeight) + 8);
      const currentContainerSize = store.getContainerSize(containerId);
      const initialPixelX = data?.initialPixelSize?.pixelX ?? 0;
      const initialPixelY = data?.initialPixelSize?.pixelY ?? 0;
      const nextPixelX = Math.max(measuredPixelX, initialPixelX, currentContainerSize.pixelX);
      const nextPixelY = Math.max(measuredPixelY, initialPixelY, currentContainerSize.pixelY);
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
      containerSize.pixelX,
      containerSize.pixelY,
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
      const element = inputRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange?.(textValue.length, textValue.length);
    }, [isEditing, textValue]);

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
        <span ref={measureRef} className="slide-text-singleline-measure">
          {textValue || ' '}
        </span>
        {isEditing ? (
          <input
            ref={inputRef}
            className="slide-text-singleline-input"
            readOnly={isReadOnly}
            value={textValue}
            onBlur={() => {
              store.clearEditingComp();
            }}
            onChange={(event) => {
              if (isReadOnly) return;
              store.requestContainerCompDataUpdate(containerId, {
                text: event.target.value,
              });
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                store.clearEditingComp();
              }
            }}
          />
        ) : (
          <div
            className="slide-text-singleline-view"
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

export default CompTextSingleline;
