import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { useSlidesStore } from '../store/slidesStore';

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;
const ELEMENT_SAVE_DEBOUNCE_MS = 350;

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const isFinitePositive = (value: unknown): value is number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
};

const parseSceneText = (text: string, sceneVersion: number) => {
  let parsed: any = null;
  if (text && text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false as const };
    }
  }
  const scene = parsed && typeof parsed === 'object' ? parsed : {};
  const elements = Array.isArray(scene.elements) ? scene.elements : [];
  const files = scene.files && typeof scene.files === 'object' ? scene.files : {};
  const appStateRaw =
    scene.appState && typeof scene.appState === 'object' ? scene.appState : {};
  const viewBackgroundColor = appStateRaw.viewBackgroundColor ?? '#ffffff';
  const zoomValue = Number(appStateRaw?.zoom?.value);
  const scrollX = Number(appStateRaw?.scrollX);
  const scrollY = Number(appStateRaw?.scrollY);

  const legacyZoomBySlideWidth = Number(scene?.viewportNormalized?.zoomBySlideWidth);
  const legacyZoomValue = Number(appStateRaw?.zoom?.value);
  const legacyScrollX = Number(appStateRaw?.scrollX);
  const legacyScrollY = Number(appStateRaw?.scrollY);

  let legacyViewport: {
    zoomBySlideWidth: number | null;
    zoomValue: number | null;
    scrollX: number;
    scrollY: number;
  } | null = null;

  const hasLegacyZoom =
    isFinitePositive(legacyZoomBySlideWidth) || isFinitePositive(legacyZoomValue);
  const hasLegacyScroll = Number.isFinite(legacyScrollX) || Number.isFinite(legacyScrollY);
  if (hasLegacyZoom || hasLegacyScroll) {
    legacyViewport = {
      zoomBySlideWidth: isFinitePositive(legacyZoomBySlideWidth) ? legacyZoomBySlideWidth : null,
      zoomValue: isFinitePositive(legacyZoomValue) ? legacyZoomValue : null,
      scrollX: Number.isFinite(legacyScrollX) ? legacyScrollX : 0,
      scrollY: Number.isFinite(legacyScrollY) ? legacyScrollY : 0,
    };
  }

  return {
    ok: true as const,
    initialData: {
      elements,
      files,
      appState: {
        viewBackgroundColor,
        collaborators: new Map(),
        ...(isFinitePositive(zoomValue) ? { zoom: { value: zoomValue } } : {}),
        ...(Number.isFinite(scrollX) ? { scrollX } : {}),
        ...(Number.isFinite(scrollY) ? { scrollY } : {}),
      },
      sceneVersion,
    },
    legacyViewport,
  };
};

const buildElementsSnapshot = ({
  elements,
  files,
  viewBackgroundColor,
  sceneVersion,
}: any) => {
  return {
    elements,
    files,
    appState: {
      viewBackgroundColor: viewBackgroundColor ?? '#ffffff',
    },
    sceneVersion,
  };
};

const buildElementsSnapshotJson = ({
  elements,
  files,
  viewBackgroundColor,
  sceneVersion,
}: any) => {
  return JSON.stringify(
    buildElementsSnapshot({
      elements,
      files,
      viewBackgroundColor,
      sceneVersion,
    }),
  );
};

const isSameSceneViewport = (left: any, right: any) => {
  if (!left && !right) return true;
  if (!left || !right) return false;
  const leftZoom = Number(left.zoomBySlideWidth);
  const rightZoom = Number(right.zoomBySlideWidth);
  const leftScrollX = Number(left.scrollX ?? 0);
  const rightScrollX = Number(right.scrollX ?? 0);
  const leftScrollY = Number(left.scrollY ?? 0);
  const rightScrollY = Number(right.scrollY ?? 0);
  return (
    Math.abs(leftZoom - rightZoom) < 0.000001 &&
    Math.abs(leftScrollX - rightScrollX) < 0.1 &&
    Math.abs(leftScrollY - rightScrollY) < 0.1
  );
};

const computeAppliedViewport = (
  sceneViewport: any,
  slidePixelX: number,
): { zoomValue: number; scrollX: number; scrollY: number } => {
  const zoomBySlideWidth = Number(sceneViewport?.zoomBySlideWidth);
  const scrollX = Number(sceneViewport?.scrollX ?? 0);
  const scrollY = Number(sceneViewport?.scrollY ?? 0);
  let zoomValue = 1;
  if (isFinitePositive(zoomBySlideWidth) && isFinitePositive(slidePixelX)) {
    zoomValue = clamp(zoomBySlideWidth * slidePixelX, ZOOM_MIN, ZOOM_MAX);
  }
  return {
    zoomValue,
    scrollX: Number.isFinite(scrollX) ? scrollX : 0,
    scrollY: Number.isFinite(scrollY) ? scrollY : 0,
  };
};

const CompExcalidraw = observer(({ data, containerId, isReadOnly }: any) => {
  const store = useSlidesStore();
  const slidePagePixelSize = store.getSlidePagePixelSize();
  const isPlayMode = store.getIsPlayMode();
  const [initialDataForExcalidraw, setInitialDataForExcalidraw] = useState<any>(null);
  const [isApiReady, setIsApiReady] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [isEditEnabled, setIsEditEnabled] = useState(true);
  const [isPanEnabled, setIsPanEnabled] = useState(true);
  const [isZoomEnabled, setIsZoomEnabled] = useState(true);
  const [currentZoomValue, setCurrentZoomValue] = useState(1);

  const rootElementRef = useRef<HTMLDivElement | null>(null);
  const isZoomEnabledRef = useRef(isZoomEnabled);
  isZoomEnabledRef.current = isZoomEnabled;
  const excalidrawApiRef = useRef<any>(null);
  const saveTimerRef = useRef<any>(null);
  const lastElementsSnapshotJsonRef = useRef<string>('');
  const pendingElementsSnapshotJsonRef = useRef<string | null>(null);
  const sceneResourceIdRef = useRef<string>('');
  const isApplyingViewportRef = useRef(false);
  const isViewportPointerGestureActiveRef = useRef(false);
  const viewportDiscreteIntentCountRef = useRef(0);
  const prevAppliedViewportRef = useRef<{ zoomValue: number; scrollX: number; scrollY: number }>({
    zoomValue: 1,
    scrollX: 0,
    scrollY: 0,
  });
  const legacyViewportRef = useRef<any>(null);
  const hasAppliedInitialViewportRef = useRef(false);
  const isSceneHydratingRef = useRef(true);
  const prevIsPlayModeRef = useRef(false);
  const containerIdRef = useRef<string>(containerId);
  containerIdRef.current = containerId;

  const sceneResourceId = data?.sceneResourceId ?? '';
  const sceneVersion = data?.sceneVersion ?? 1;
  const sceneViewport = data?.sceneViewport ?? null;
  sceneResourceIdRef.current = sceneResourceId;

  useEffect(() => {
    let isCancelled = false;

    const applyParsed = (text: string) => {
      const parsed = parseSceneText(text, sceneVersion);
      if (!parsed.ok) {
        legacyViewportRef.current = null;
        const emptyInitialData = {
          elements: [],
          files: {},
          appState: {
            viewBackgroundColor: '#ffffff',
            collaborators: new Map(),
          },
          sceneVersion,
        };
        setInitialDataForExcalidraw(emptyInitialData);
        lastElementsSnapshotJsonRef.current = buildElementsSnapshotJson({
          elements: [],
          files: {},
          viewBackgroundColor: '#ffffff',
          sceneVersion,
        });
        isSceneHydratingRef.current = true;
        return false;
      }
      legacyViewportRef.current = parsed.legacyViewport ?? null;
      const initialData = parsed.initialData;
      setInitialDataForExcalidraw(initialData);
      lastElementsSnapshotJsonRef.current = buildElementsSnapshotJson({
        elements: initialData.elements ?? [],
        files: initialData.files ?? {},
        viewBackgroundColor: initialData.appState?.viewBackgroundColor ?? '#ffffff',
        sceneVersion,
      });
      isSceneHydratingRef.current = true;
      return true;
    };

    const run = async () => {
      let nextResourceId = sceneResourceId;
      if (!nextResourceId && !isReadOnly) {
        const createResult = await store.requestCreateTextResource();
        if (!createResult?.ok || !createResult.resourceId) {
          if (!isCancelled) setErrorText('Failed to allocate scene resource');
          return;
        }
        nextResourceId = createResult.resourceId;
        store.requestContainerCompDataUpdate(containerId, {
          sceneResourceId: nextResourceId,
          sceneVersion: 1,
        });
      }
      if (!nextResourceId) {
        if (isCancelled) return;
        applyParsed('');
        return;
      }
      const loadResult = await store.requestGetResourceText(nextResourceId);
      if (isCancelled) return;
      if (!loadResult?.ok) {
        applyParsed('');
        setErrorText('Failed to load scene resource');
        return;
      }
      const ok = applyParsed(`${loadResult.text ?? ''}`);
      setErrorText(ok ? '' : 'Scene data is invalid');
    };
    run();
    return () => {
      isCancelled = true;
    };
  }, [sceneResourceId, isReadOnly, store, containerId, sceneVersion]);

  useEffect(() => {
    prevAppliedViewportRef.current = { zoomValue: 1, scrollX: 0, scrollY: 0 };
    legacyViewportRef.current = null;
    hasAppliedInitialViewportRef.current = false;
    isSceneHydratingRef.current = true;
  }, [containerId, sceneResourceId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const pending = pendingElementsSnapshotJsonRef.current;
      const pendingResourceId = sceneResourceIdRef.current;
      pendingElementsSnapshotJsonRef.current = null;
      if (pending && pendingResourceId) {
        store.requestSetResourceText(pendingResourceId, pending);
      }
    };
  }, [store]);

  useEffect(() => {
    const rootElement = rootElementRef.current;
    if (!rootElement) return undefined;
    let pointerGestureReleaseRaf = 0;

    const markViewportDiscreteIntent = (count = 1) => {
      viewportDiscreteIntentCountRef.current = Math.min(
        64,
        viewportDiscreteIntentCountRef.current + Math.max(1, count),
      );
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        markViewportDiscreteIntent(6);
      }
      if (isZoomEnabledRef.current) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const handlePointerDownCapture = () => {
      isViewportPointerGestureActiveRef.current = true;
      markViewportDiscreteIntent(6);
    };
    const handleWindowPointerUpCapture = () => {
      if (pointerGestureReleaseRaf) {
        window.cancelAnimationFrame(pointerGestureReleaseRaf);
        pointerGestureReleaseRaf = 0;
      }
      pointerGestureReleaseRaf = window.requestAnimationFrame(() => {
        isViewportPointerGestureActiveRef.current = false;
        pointerGestureReleaseRaf = 0;
      });
    };
    rootElement.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    rootElement.addEventListener('pointerdown', handlePointerDownCapture, { capture: true });
    window.addEventListener('pointerup', handleWindowPointerUpCapture, true);
    return () => {
      rootElement.removeEventListener('wheel', handleWheel, { capture: true } as any);
      rootElement.removeEventListener('pointerdown', handlePointerDownCapture, {
        capture: true,
      } as any);
      window.removeEventListener('pointerup', handleWindowPointerUpCapture, true);
      if (pointerGestureReleaseRaf) {
        window.cancelAnimationFrame(pointerGestureReleaseRaf);
        pointerGestureReleaseRaf = 0;
      }
    };
  }, []);

  useEffect(() => {
    const isEntered = isPlayMode && !prevIsPlayModeRef.current;
    prevIsPlayModeRef.current = isPlayMode;
    if (!isEntered) return;
    setIsEditEnabled(false);
    setIsPanEnabled(false);
    setIsZoomEnabled(false);
  }, [isPlayMode]);

  useEffect(() => {
    if (!isApiReady) return;
    const api = excalidrawApiRef.current;
    if (!api) return;
    if (!initialDataForExcalidraw) return;
    const slidePixelX = Number(slidePagePixelSize?.pixelX);
    if (!isFinitePositive(slidePixelX)) return;

    let effectiveViewport = sceneViewport;
    const hasPersistedSceneViewport = isFinitePositive(Number(sceneViewport?.zoomBySlideWidth));
    if (legacyViewportRef.current && !hasPersistedSceneViewport) {
      const legacy = legacyViewportRef.current;
      let zoomBySlideWidth = Number(legacy.zoomBySlideWidth);
      if (!isFinitePositive(zoomBySlideWidth) && isFinitePositive(Number(legacy.zoomValue))) {
        zoomBySlideWidth = Number(legacy.zoomValue) / slidePixelX;
      }
      if (isFinitePositive(zoomBySlideWidth)) {
        effectiveViewport = {
          zoomBySlideWidth,
          scrollX: Number.isFinite(legacy.scrollX) ? Number(legacy.scrollX) : 0,
          scrollY: Number.isFinite(legacy.scrollY) ? Number(legacy.scrollY) : 0,
        };
        if (!isReadOnly && !isSameSceneViewport(sceneViewport, effectiveViewport)) {
          store.requestContainerCompDataUpdate(containerId, {
            sceneViewport: effectiveViewport,
          });
        }
        legacyViewportRef.current = null;
      }
    } else if (legacyViewportRef.current) {
      legacyViewportRef.current = null;
    }

    const { zoomValue, scrollX, scrollY } = computeAppliedViewport(effectiveViewport, slidePixelX);

    const current = prevAppliedViewportRef.current;
    const isSame =
      Math.abs(current.zoomValue - zoomValue) < 0.0001 &&
      Math.abs(current.scrollX - scrollX) < 0.5 &&
      Math.abs(current.scrollY - scrollY) < 0.5;

    if (!isSame) {
      isApplyingViewportRef.current = true;
      api.updateScene({
        appState: {
          zoom: { value: zoomValue },
          scrollX,
          scrollY,
        },
      });
      requestAnimationFrame(() => {
        isApplyingViewportRef.current = false;
      });
      prevAppliedViewportRef.current = { zoomValue, scrollX, scrollY };
      setCurrentZoomValue(zoomValue);
    }

    hasAppliedInitialViewportRef.current = true;
  }, [
    isApiReady,
    initialDataForExcalidraw,
    slidePagePixelSize.pixelX,
    sceneViewport,
    containerId,
    isReadOnly,
    store,
  ]);

  const saveViewportToCompData = (
    zoomValue: number,
    scrollX: number,
    scrollY: number,
    slidePixelX: number,
  ) => {
    if (isReadOnly) return;
    if (!isFinitePositive(slidePixelX)) return;
    if (!isFinitePositive(zoomValue)) return;
    const zoomBySlideWidth = zoomValue / slidePixelX;
    const nextSceneViewport = { zoomBySlideWidth, scrollX, scrollY };
    const persistedSceneViewport =
      store.getContainerCompData(containerId)?.compData?.sceneViewport ?? null;
    if (isSameSceneViewport(persistedSceneViewport, nextSceneViewport)) return;
    store.requestContainerCompDataUpdate(containerId, {
      sceneViewport: nextSceneViewport,
    });
  };

  const commitViewportFromApi = (api: any, slidePixelX: number) => {
    if (!api) return;
    const appState = api.getAppState();
    const zoomValue = Number(appState?.zoom?.value ?? 1);
    const scrollX = Number(appState?.scrollX ?? 0);
    const scrollY = Number(appState?.scrollY ?? 0);
    prevAppliedViewportRef.current = { zoomValue, scrollX, scrollY };
    setCurrentZoomValue(zoomValue);
    saveViewportToCompData(zoomValue, scrollX, scrollY, slidePixelX);
  };

  const handleFitToContent = () => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const elements = api.getSceneElements();
    if (!elements || elements.length === 0) return;
    const slidePixelX = Number(slidePagePixelSize?.pixelX ?? 0);
    if (!isFinitePositive(slidePixelX)) return;
    viewportDiscreteIntentCountRef.current = Math.min(
      24,
      viewportDiscreteIntentCountRef.current + 10,
    );

    isApplyingViewportRef.current = true;
    api.scrollToContent(elements, {
      fitToViewport: true,
      viewportZoomFactor: 0.9,
      animate: false,
    });
    commitViewportFromApi(api, slidePixelX);
    requestAnimationFrame(() => {
      const api2 = excalidrawApiRef.current;
      isApplyingViewportRef.current = false;
      commitViewportFromApi(api2, slidePixelX);
    });
  };

  const handleCustomZoomStep = (direction: 'in' | 'out') => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const slidePixelX = Number(slidePagePixelSize?.pixelX ?? 0);
    if (!isFinitePositive(slidePixelX)) return;
    const appState = api.getAppState();
    const currentZoom = Number(appState?.zoom?.value ?? 1);
    const scrollX = Number(appState?.scrollX ?? 0);
    const scrollY = Number(appState?.scrollY ?? 0);
    const factor = direction === 'in' ? 1.1 : 1 / 1.1;
    const nextZoom = clamp(currentZoom * factor, ZOOM_MIN, ZOOM_MAX);
    if (Math.abs(nextZoom - currentZoom) < 0.0001) return;
    viewportDiscreteIntentCountRef.current = Math.min(
      64,
      viewportDiscreteIntentCountRef.current + 12,
    );
    isApplyingViewportRef.current = true;
    api.updateScene({
      appState: {
        zoom: { value: nextZoom },
        scrollX,
        scrollY,
      },
    });
    requestAnimationFrame(() => {
      isApplyingViewportRef.current = false;
      commitViewportFromApi(api, slidePixelX);
    });
  };

  const queueSaveElements = (
    elements: any,
    files: any,
    viewBackgroundColor: string,
  ) => {
    if (!sceneResourceId) return;
    if (isReadOnly) return;
    const snapshot = buildElementsSnapshot({
      elements,
      files,
      viewBackgroundColor,
      sceneVersion,
    });
    const nextSnapshotJson = JSON.stringify(snapshot);
    if (isSceneHydratingRef.current) {
      lastElementsSnapshotJsonRef.current = nextSnapshotJson;
      isSceneHydratingRef.current = false;
      return;
    }
    if (nextSnapshotJson === lastElementsSnapshotJsonRef.current) return;
    lastElementsSnapshotJsonRef.current = nextSnapshotJson;
    pendingElementsSnapshotJsonRef.current = nextSnapshotJson;
    store.markCompDirtyByContainerId(containerId, 'updated');
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(async () => {
      saveTimerRef.current = null;
      const jsonToSave = pendingElementsSnapshotJsonRef.current;
      pendingElementsSnapshotJsonRef.current = null;
      if (!jsonToSave) return;
      const saveResult = await store.requestSetResourceText(
        sceneResourceId,
        jsonToSave,
      );
      if (!saveResult?.ok) {
        setErrorText('Failed to save scene resource');
        return;
      }
      setErrorText('');
    }, ELEMENT_SAVE_DEBOUNCE_MS);
  };

  if (!initialDataForExcalidraw) {
    return <div className="slide-excalidraw-loading">Loading whiteboard...</div>;
  }

  const slidePixelXForDebug = Number(slidePagePixelSize?.pixelX ?? 0);
  const zoomBySlideWidthForDebug = isFinitePositive(slidePixelXForDebug)
    ? currentZoomValue / slidePixelXForDebug
    : 0;
  const persistedZoomBySlideWidthDisplay = Number(sceneViewport?.zoomBySlideWidth);

  return (
    <div
      className="slide-excalidraw-root"
      ref={rootElementRef}
      onContextMenuCapture={(event) => {
        event.stopPropagation();
      }}
    >
      <Excalidraw
        initialData={initialDataForExcalidraw}
        viewModeEnabled={isReadOnly || (!isEditEnabled && !isPanEnabled && !isZoomEnabled)}
        excalidrawAPI={(api) => {
          excalidrawApiRef.current = api;
          setIsApiReady(true);
        }}
        onChange={(elements, appState, files) => {
          const nextZoomValue = Number(appState?.zoom?.value ?? 1);
          const nextScrollX = Number(appState?.scrollX ?? 0);
          const nextScrollY = Number(appState?.scrollY ?? 0);
          const nextBackgroundColor = appState?.viewBackgroundColor ?? '#ffffff';
          const slidePixelX = Number(slidePagePixelSize?.pixelX ?? 0);

          if (!isApplyingViewportRef.current && hasAppliedInitialViewportRef.current) {
            const prev = prevAppliedViewportRef.current;
            const zoomChanged = Math.abs(nextZoomValue - prev.zoomValue) > 0.0001;
            const scrollXChanged = Math.abs(nextScrollX - prev.scrollX) > 0.1;
            const scrollYChanged = Math.abs(nextScrollY - prev.scrollY) > 0.1;

            let finalZoom = nextZoomValue;
            let finalScrollX = nextScrollX;
            let finalScrollY = nextScrollY;
            let needsRevert = false;

            if (!isPanEnabled && !zoomChanged && (scrollXChanged || scrollYChanged)) {
              finalScrollX = prev.scrollX;
              finalScrollY = prev.scrollY;
              needsRevert = true;
            }

            if (needsRevert && excalidrawApiRef.current) {
              isApplyingViewportRef.current = true;
              excalidrawApiRef.current.updateScene({
                appState: {
                  zoom: { value: finalZoom },
                  scrollX: finalScrollX,
                  scrollY: finalScrollY,
                },
              });
              requestAnimationFrame(() => {
                isApplyingViewportRef.current = false;
              });
            }

            const finalZoomChanged = Math.abs(finalZoom - prev.zoomValue) > 0.0001;
            const finalScrollXChanged = Math.abs(finalScrollX - prev.scrollX) > 0.1;
            const finalScrollYChanged = Math.abs(finalScrollY - prev.scrollY) > 0.1;
            const viewportChanged = finalZoomChanged || finalScrollXChanged || finalScrollYChanged;
            if (viewportChanged) {
              const isFromPointerGesture = isViewportPointerGestureActiveRef.current;
              const isFromDiscreteIntent = viewportDiscreteIntentCountRef.current > 0;
              const isFromUserIntent = isFromPointerGesture || isFromDiscreteIntent;
              if (!isFromUserIntent && excalidrawApiRef.current) {
                isApplyingViewportRef.current = true;
                excalidrawApiRef.current.updateScene({
                  appState: {
                    zoom: { value: prev.zoomValue },
                    scrollX: prev.scrollX,
                    scrollY: prev.scrollY,
                  },
                });
                requestAnimationFrame(() => {
                  isApplyingViewportRef.current = false;
                });
                return;
              }
              if (!isFromPointerGesture && viewportDiscreteIntentCountRef.current > 0) {
                viewportDiscreteIntentCountRef.current -= 1;
              }
              prevAppliedViewportRef.current = {
                zoomValue: finalZoom,
                scrollX: finalScrollX,
                scrollY: finalScrollY,
              };
              if (Math.abs(finalZoom - currentZoomValue) > 0.0001) {
                setCurrentZoomValue(finalZoom);
              }
              saveViewportToCompData(finalZoom, finalScrollX, finalScrollY, slidePixelX);
            }
          }

          if (isReadOnly) return;
          queueSaveElements(
            elements,
            files,
            nextBackgroundColor,
          );
        }}
      />
      <div
        className="slide-excalidraw-lock-panel"
        onWheelCapture={(event) => {
          if (isZoomEnabled) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <button
          className="slide-excalidraw-mode-btn"
          type="button"
          disabled={isReadOnly}
          onClick={handleFitToContent}
        >
          Fit
        </button>
        <button
          className={`slide-excalidraw-mode-btn ${isEditEnabled ? 'is-play' : ''}`}
          type="button"
          disabled={isReadOnly}
          onClick={() => {
            setIsEditEnabled((isPrevEnabled) => !isPrevEnabled);
          }}
        >
          Edit
        </button>
        <button
          className={`slide-excalidraw-mode-btn ${isPanEnabled ? 'is-play' : ''}`}
          type="button"
          disabled={isReadOnly}
          onClick={() => {
            setIsPanEnabled((isPrevEnabled) => !isPrevEnabled);
          }}
        >
          Pan
        </button>
        <button
          className={`slide-excalidraw-mode-btn ${isZoomEnabled ? 'is-play' : ''}`}
          type="button"
          disabled={isReadOnly}
          onClick={() => {
            setIsZoomEnabled((isPrevEnabled) => !isPrevEnabled);
          }}
        >
          Zoom
        </button>
        <button
          className="slide-excalidraw-mode-btn"
          type="button"
          disabled={isReadOnly}
          onClick={() => {
            handleCustomZoomStep('out');
          }}
        >
          -
        </button>
        <button
          className="slide-excalidraw-mode-btn"
          type="button"
          disabled={isReadOnly}
          onClick={() => {
            handleCustomZoomStep('in');
          }}
        >
          +
        </button>
      </div>
      <div className="slide-excalidraw-debug-panel">
        <div className="slide-excalidraw-debug-row">
          zoomBySlideWidth: {zoomBySlideWidthForDebug.toFixed(6)}
        </div>
        <div className="slide-excalidraw-debug-row">
          zoom: {Math.round(currentZoomValue * 100)}%
        </div>
        <div className="slide-excalidraw-debug-row">
          slide width: {Math.round(slidePixelXForDebug)}px
        </div>
        <div className="slide-excalidraw-debug-row">
          persisted zoomBySlideWidth:{' '}
          {isFinitePositive(persistedZoomBySlideWidthDisplay)
            ? persistedZoomBySlideWidthDisplay.toFixed(6)
            : 'null'}
        </div>
      </div>
      {errorText ? <div className="slide-excalidraw-error">{errorText}</div> : null}
    </div>
  );
});

export default CompExcalidraw;
