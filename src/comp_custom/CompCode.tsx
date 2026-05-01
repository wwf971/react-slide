import { useEffect, useMemo, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import 'highlight.js/styles/atom-one-dark.css';
import { useSlidesStore } from '../store/slidesStore';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('html', xml);

const escapeHtml = (value: string) => {
  return value
    .split('&')
    .join('&amp;')
    .split('<')
    .join('&lt;')
    .split('>')
    .join('&gt;')
    .split('"')
    .join('&quot;')
    .split("'")
    .join('&#39;');
};

const CompCode = observer(({
  data,
  containerId,
  compId,
  requestContainerMoveByPoint,
  isReadOnly,
}: any) => {
  const store = useSlidesStore();
  const containerRef = useRef<any>(null);
  const dragStateRef = useRef<any>(null);
  const languageName = `${data?.language ?? 'javascript'}`;
  const codeText = `${data?.codeText ?? ''}`;
  const backgroundColor = `${data?.backgroundColor ?? '#111827'}`;
  const fontScaleValueRaw = Number(data?.fontScale);
  const fontScale = Number.isFinite(fontScaleValueRaw) ? fontScaleValueRaw : 1;
  const isEditing = store.isCompEditing(compId);
  const isSelected = store.selectedContainerId === containerId;
  const containerSize = store.getContainerSize(containerId);
  const containerData = store.getContainerData(containerId);
  const containerRatioWidth = Number(containerData?.size?.x ?? 0);
  const pagePixelWidth =
    containerRatioWidth > 0 ? containerSize.pixelX / Math.max(containerRatioWidth, 0.0001) : 0;
  const safePagePixelWidth = pagePixelWidth > 0 ? pagePixelWidth : 900;
  const fontPixelSize = Math.min(
    42,
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
    const element = containerRef.current;
    if (!element) return;
    element.style.setProperty('--slide-code-bg', backgroundColor);
    element.style.setProperty('--slide-code-font-size', `${fontPixelSize}px`);
  }, [backgroundColor, fontPixelSize]);

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

  const highlightedCodeHtml = useMemo(() => {
    const safeCodeText = codeText || '';
    if (!safeCodeText) return '';
    const normalizedLanguage = languageName.trim().toLowerCase();
    try {
      if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
        return hljs.highlight(safeCodeText, {
          language: normalizedLanguage,
          ignoreIllegals: true,
        }).value;
      }
      return hljs.highlightAuto(safeCodeText).value;
    } catch {
      return escapeHtml(safeCodeText);
    }
  }, [codeText, languageName]);

  const requestStartDragByPointer = (startX, startY) => {
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
  };

  return (
    <div ref={containerRef} className="slide-code-root">
      <div
        className="slide-code-toolbar"
        onPointerDown={(event) => {
          if (isReadOnly) return;
          if (event.button !== 0) return;
          const targetElement = event.target as HTMLElement;
          if (targetElement?.closest('input,button,select,textarea')) return;
          requestStartDragByPointer(event.clientX, event.clientY);
        }}
      >
        <input
          className="slide-code-language-input"
          value={languageName}
          readOnly={isReadOnly}
          onChange={(event) => {
            if (isReadOnly) return;
            store.requestContainerCompDataUpdate(containerId, {
              language: event.target.value,
            });
          }}
        />
        <input
          className="slide-code-bg-input"
          type="color"
          value={backgroundColor}
          disabled={isReadOnly}
          onChange={(event) => {
            if (isReadOnly) return;
            store.requestContainerCompDataUpdate(containerId, {
              backgroundColor: event.target.value,
            });
          }}
        />
      </div>
      {isEditing ? (
        <textarea
          className="slide-code-editor"
          value={codeText}
          readOnly={isReadOnly}
          onBlur={() => {
            if (isReadOnly) return;
            store.clearEditingComp();
          }}
          onChange={(event) => {
            if (isReadOnly) return;
            store.requestContainerCompDataUpdate(containerId, {
              codeText: event.target.value,
            });
          }}
        />
      ) : (
        <pre
          className="slide-code-output hljs"
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
          <code dangerouslySetInnerHTML={{ __html: highlightedCodeHtml || '&nbsp;' }} />
        </pre>
      )}
    </div>
  );
});

export default CompCode;
