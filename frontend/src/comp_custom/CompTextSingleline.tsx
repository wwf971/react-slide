import { useEffect, useRef, useState } from 'react';
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

const setContentEditableCaretOffset = (element, offset) => {
  const documentValue = element.ownerDocument ?? document;
  const selection = documentValue.getSelection?.();
  if (!selection) return;
  const range = documentValue.createRange();
  const walker = documentValue.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const safeOffset = Math.max(0, Math.min(Number(offset ?? 0), element.textContent?.length ?? 0));
  let textOffset = 0;
  let node = walker.nextNode();
  while (node) {
    const nodeLength = node.textContent?.length ?? 0;
    if (textOffset + nodeLength >= safeOffset) {
      range.setStart(node, safeOffset - textOffset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    textOffset += nodeLength;
    node = walker.nextNode();
  }
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
};

const CompTextSingleline = observer(
  ({ data, containerId, compId, requestContainerMoveByPoint, isReadOnly }: any) => {
    const store = useSlidesStore();
    const rootRef = useRef<any>(null);
    const editorRef = useRef<any>(null);
    const dragStateRef = useRef<any>(null);
    const pendingCaretOffsetRef = useRef<number | null>(null);
    const [surfacePixelWidth, setSurfacePixelWidth] = useState(0);
    const isComposingRef = useRef(false);
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
      if (isReadOnly) return;
      const nextCompData = getMissingTextAlignmentData(data);
      if (Object.keys(nextCompData).length === 0) return;
      store.requestContainerCompDataUpdate(containerId, nextCompData);
    }, [containerId, data?.textHorizontalAlign, data?.textVerticalAlign, isReadOnly, store]);

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
      const currentContainerSize = store.getContainerSize(containerId);
      const initialPixelX = data?.initialPixelSize?.pixelX ?? 0;
      const initialPixelY = data?.initialPixelSize?.pixelY ?? 0;
      const targetPixelX = Math.max(24, initialPixelX);
      const targetPixelY = Math.max(20, initialPixelY);
      store.setContainerMinPixelSize(containerId, {
        pixelX: targetPixelX,
        pixelY: targetPixelY,
      });
      const nextPixelX = Math.max(targetPixelX, currentContainerSize.pixelX);
      const nextPixelY = Math.max(targetPixelY, currentContainerSize.pixelY);
      if (
        targetPixelX <= currentContainerSize.pixelX &&
        targetPixelY <= currentContainerSize.pixelY
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
      const element = editorRef.current;
      if (!element) return;
      element.textContent = textValue;
      element.focus();
      const offset = pendingCaretOffsetRef.current;
      pendingCaretOffsetRef.current = null;
      setContentEditableCaretOffset(element, offset ?? textValue.length);
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
          <div
            ref={editorRef}
            className={`slide-text-singleline-editor align-x-${textHorizontalAlign} align-y-${textVerticalAlign}`}
            contentEditable={!isReadOnly}
            role="textbox"
            aria-label="Single line text"
            suppressContentEditableWarning
            onBlur={() => {
              isComposingRef.current = false;
              store.clearEditingComp();
            }}
            onInput={(event) => {
              if (isReadOnly) return;
              const nextText = `${event.currentTarget.textContent ?? ''}`.replace(/[\r\n]+/g, ' ');
              store.requestContainerCompDataUpdate(containerId, {
                text: nextText,
              });
            }}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={(event) => {
              isComposingRef.current = false;
              if (isReadOnly) return;
              const nextText = `${event.currentTarget.textContent ?? ''}`.replace(/[\r\n]+/g, ' ');
              store.requestContainerCompDataUpdate(containerId, {
                text: nextText,
              });
            }}
            onKeyDown={(event) => {
              const isComposing = isComposingRef.current || event.nativeEvent?.isComposing === true;
              if (isComposing) return;
              if (event.key === 'Enter') {
                event.preventDefault();
                store.clearEditingComp();
              }
            }}
          />
        ) : (
          <div
            className={`slide-text-singleline-view align-x-${textHorizontalAlign} align-y-${textVerticalAlign}`}
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

(CompTextSingleline as any).getMenuItems = ({ data }: any) => {
  return getTextAlignmentMenuItems(data);
};

(CompTextSingleline as any).handleMenuItem = handleTextAlignmentMenuItem;

export default CompTextSingleline;
