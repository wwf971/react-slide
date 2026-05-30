import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useSlidesStore } from '../store/slidesStore';
import {
  getMissingTextAlignmentData,
  getTextAlignmentMenuItems,
  handleTextAlignmentMenuItem,
  normalizeHorizontalAlign,
  normalizeVerticalAlign,
} from './CompTextUtils';

const getTextOffsetFromPoint = (rootElement, point, fallbackOffset) => {
  if (!rootElement || !point) return fallbackOffset;
  const documentValue: any = rootElement.ownerDocument ?? document;
  let offsetNode: any = null;
  let offset = 0;
  if (documentValue.caretPositionFromPoint) {
    const position = documentValue.caretPositionFromPoint(point.x, point.y);
    offsetNode = position?.offsetNode ?? null;
    offset = Number(position?.offset ?? 0);
  } else if (documentValue.caretRangeFromPoint) {
    const range = documentValue.caretRangeFromPoint(point.x, point.y);
    offsetNode = range?.startContainer ?? null;
    offset = Number(range?.startOffset ?? 0);
  }
  if (!offsetNode || !rootElement.contains(offsetNode)) return fallbackOffset;
  try {
    const range = documentValue.createRange();
    range.selectNodeContents(rootElement);
    range.setEnd(offsetNode, offset);
    return Math.max(0, Math.min(range.toString().length, rootElement.textContent?.length ?? 0));
  } catch {
    return fallbackOffset;
  }
};

const CompTextMultline = observer(
  ({ data, containerId, compId, requestContainerMoveByPoint, isReadOnly }: any) => {
  const store = useSlidesStore();
  const rootRef = useRef<any>(null);
  const contentRef = useRef<any>(null);
  const dragStateRef = useRef<any>(null);
  const pendingCaretOffsetRef = useRef<number | null>(null);
  const textValue = data?.text ?? '';
  const textHorizontalAlign = normalizeHorizontalAlign(data?.textHorizontalAlign);
  const textVerticalAlign = normalizeVerticalAlign(data?.textVerticalAlign);
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

  useEffect(() => {
    if (isReadOnly) return;
    const nextCompData = getMissingTextAlignmentData(data);
    if (Object.keys(nextCompData).length === 0) return;
    store.requestContainerCompDataUpdate(containerId, nextCompData);
  }, [containerId, data?.textHorizontalAlign, data?.textVerticalAlign, isReadOnly, store]);

  const requestFit = () => {
    const element = contentRef.current;
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
    const targetPixelX = Math.max(initialPixelX, 0);
    const targetPixelY = Math.max(measuredPixelY, initialPixelY);
    store.setContainerMinPixelSize(containerId, {
      pixelX: targetPixelX,
      pixelY: targetPixelY,
    });
    const nextPixelX = Math.max(currentContainerSize.pixelX, targetPixelX);
    const nextPixelY = Math.max(currentContainerSize.pixelY, targetPixelY);
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
    const element = contentRef.current;
    if (!element) return;
    element.focus();
    const offset = pendingCaretOffsetRef.current;
    pendingCaretOffsetRef.current = null;
    const safeOffset = Math.max(0, Math.min(offset ?? textValue.length, textValue.length));
    element.setSelectionRange?.(safeOffset, safeOffset);
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
          ref={contentRef}
          className={`slide-textarea align-x-${textHorizontalAlign} align-y-${textVerticalAlign}`}
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
          ref={contentRef}
          className={`slide-text-view align-x-${textHorizontalAlign} align-y-${textVerticalAlign}`}
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
          onDoubleClick={(event) => {
            if (isReadOnly) return;
            pendingCaretOffsetRef.current = getTextOffsetFromPoint(
              event.currentTarget,
              { x: event.clientX, y: event.clientY },
              textValue.length,
            );
            store.setSelectedContainer(containerId);
            if (compId) {
              store.setEditingComp(compId);
            } else {
              store.clearEditingComp();
            }
          }}
        >
          <div className="slide-text-view-content">{textValue}</div>
        </div>
      )}
    </div>
  );
  },
);

(CompTextMultline as any).getMenuItems = ({ data }: any) => {
  return getTextAlignmentMenuItems(data);
};

(CompTextMultline as any).handleMenuItem = handleTextAlignmentMenuItem;

export default CompTextMultline;
