import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { SlideStoreProvider } from '../store/slidesStore';
import Page from '../page/Page';
import Header from '../layout/Header';
import '../page/Page.css';

const Slides = observer(({
  store,
  backendStore,
  getComp,
  requestedSlideId = '',
  onCurrentSlideIdChange,
  onRequestOpenGroupView,
  onEndpointSwitchStart,
}: any) => {
  const currentPage = store.getCurrentPageData() ?? store.getFirstPageData();
  const currentPageId = currentPage?.id ?? '';
  const isSlidesInitializing = store.isSlidesInitializing;
  const slideItems = store.slideItems ?? [];
  const slideCurrentId = store.slideCurrentId ?? '';
  const [isFullWindow, setIsFullWindow] = useState(false);
  const [ownerGroupIdBySlideId, setOwnerGroupIdBySlideId] = useState({});
  const requestedSlideIdNormalized = `${requestedSlideId ?? ''}`.trim();
  const isRequestedSlideIdMissing = Boolean(requestedSlideIdNormalized)
    && !isSlidesInitializing
    && (slideItems ?? []).length > 0
    && !(slideItems ?? []).some((item: any) => `${item?.id ?? ''}`.trim() === requestedSlideIdNormalized);

  useEffect(() => {
    store.requestInitializeSlides();
  }, [store]);

  useEffect(() => {
    let isCancelled = false;
    const loadOwnerMap = async () => {
      const persistStore = store?.slidesPersistStore;
      if (!persistStore?.getSlideGroupOwnerMap) return;
      const result = await persistStore.getSlideGroupOwnerMap();
      if (!result?.ok || isCancelled) return;
      setOwnerGroupIdBySlideId(result.ownerGroupIdBySlideId ?? {});
    };
    loadOwnerMap();
    return () => {
      isCancelled = true;
    };
  }, [store, slideItems.length, slideCurrentId]);

  useEffect(() => {
    if (!backendStore) return;
    backendStore.requestLoadDatabases();
  }, [backendStore]);

  useEffect(() => {
    const nextSlideId = requestedSlideIdNormalized;
    if (!nextSlideId) return;
    const hasRequestedSlide = (slideItems ?? []).some((item: any) => {
      return `${item?.id ?? ''}`.trim() === nextSlideId;
    });
    if (!hasRequestedSlide) return;
    if (`${slideCurrentId ?? ''}`.trim() === nextSlideId) return;
    store.requestSwitchSlide(nextSlideId);
  }, [requestedSlideId, slideItems, store]);

  useEffect(() => {
    if (!onCurrentSlideIdChange) return;
    const nextSlideId = `${slideCurrentId ?? ''}`.trim();
    if (!nextSlideId) return;
    const requestedId = `${requestedSlideId ?? ''}`.trim();
    if (requestedId && requestedId !== nextSlideId && !isRequestedSlideIdMissing) return;
    onCurrentSlideIdChange(nextSlideId);
  }, [slideCurrentId, onCurrentSlideIdChange, requestedSlideId, isRequestedSlideIdMissing]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
      if (!isSaveShortcut) return;
      event.preventDefault();
      event.stopPropagation();
      store.requestPersistDirtyPages();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [store]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.slide-page-surface')) return;
      store.clearEditingComp();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [store]);

  useEffect(() => {
    if (!isFullWindow) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsFullWindow(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isFullWindow]);

  useEffect(() => {
    store.setIsFullWindowMode(isFullWindow);
  }, [store, isFullWindow]);

  const prevPage = store.getPrevPageData(currentPageId);
  const nextPage = store.getNextPageData(currentPageId);
  const currentGroupId = `${ownerGroupIdBySlideId?.[slideCurrentId] ?? ''}`.trim();

  return (
    <SlideStoreProvider store={store}>
      <div className={`slide-system-root ${isFullWindow ? 'is-full-window' : ''}`}>
        <Header
          slidesStore={store}
          backendStore={backendStore ?? null}
          onEndpointSwitchStart={onEndpointSwitchStart}
          config={{
            isHidden: isFullWindow,
            isViewInsideGroupButtonVisible: Boolean(currentGroupId),
          }}
          onEvent={async (event) => {
            if (event.type !== 'viewInsideGroup') return false;
            if (!currentGroupId || !slideCurrentId) return true;
            onRequestOpenGroupView?.(currentGroupId, slideCurrentId);
            return true;
          }}
        />
        <div className="slide-system-canvas-wrap">
          {isRequestedSlideIdMissing ? (
            <div className="slide-system-empty">
              Slide not found: {requestedSlideIdNormalized}
              <button
                className="slide-toolbar-btn"
                type="button"
                disabled={store.isSlidesInitializing}
                onClick={() => {
                  store.requestInitializeSlides(true);
                }}
              >
                Refresh Slides
              </button>
            </div>
          ) : currentPage ? (
            <Page
              {...({
                pageId: currentPage.id,
                getComp,
                isPrevEnabled: Boolean(prevPage),
                isNextEnabled: Boolean(nextPage),
                onGoPrev: () => {
                  if (!prevPage) return;
                  store.setCurrentPage(prevPage.id);
                  store.clearSelectedContainer();
                },
                onGoNext: () => {
                  if (!nextPage) return;
                  store.setCurrentPage(nextPage.id);
                  store.clearSelectedContainer();
                },
                onCreateNextPage: () => {
                  store.requestCreatePageAfterCurrent();
                },
                isFullWindow,
                onToggleFullWindow: () => {
                  setIsFullWindow((isPrevFullWindow) => {
                    const isNextFullWindow = !isPrevFullWindow;
                    if (isNextFullWindow) {
                      store.setPlayMode(true);
                    }
                    return isNextFullWindow;
                  });
                },
              } as any)}
            />
          ) : (
            <div className="slide-system-empty">
              No page data
              <button
                className="slide-toolbar-btn"
                type="button"
                disabled={store.isSlidesInitializing}
                onClick={() => {
                  store.requestInitializeSlides(true);
                }}
              >
                Refresh Slides
              </button>
            </div>
          )}
        </div>
      </div>
    </SlideStoreProvider>
  );
});

export default Slides;
