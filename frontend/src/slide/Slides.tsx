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
}: any) => {
  const currentPage = store.getCurrentPageData() ?? store.getFirstPageData();
  const currentPageId = currentPage?.id ?? '';
  const totalPage = store.getTotalPageIndex();
  const currentPageIndex = store.getCurrentPageIndex(currentPageId);
  const isCurrentPageDirty = store.isPageDirty(currentPageId);
  const isPersisting = store.isPersisting;
  const isSlidesInitializing = store.isSlidesInitializing;
  const isSlideSwitching = store.isSlideSwitching;
  const isSlideDeleting = store.isSlideDeleting;
  const isPageDeleting = store.isPageDeleting;
  const slideItems = store.slideItems ?? [];
  const currentSlideId = store.currentSlideId ?? '';
  const currentSlide = slideItems.find((item: any) => item.id === currentSlideId) ?? null;
  const persistFailureMessage = store.persistFailureMessage ?? '';
  const isSettingBusy =
    isSlidesInitializing || isSlideSwitching || isSlideDeleting || isPageDeleting || isPersisting;
  const [isFullWindow, setIsFullWindow] = useState(false);
  const [ownerGroupIdBySlideId, setOwnerGroupIdBySlideId] = useState({});

  useEffect(() => {
    if ((store.slideItems ?? []).length > 0) return;
    store.requestInitializeSlides();
  }, [store, store.slideItems?.length]);

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
  }, [store, slideItems.length, currentSlideId]);

  useEffect(() => {
    if (!backendStore) return;
    backendStore.requestLoadDatabases();
  }, [backendStore]);

  useEffect(() => {
    const nextSlideId = `${requestedSlideId ?? ''}`.trim();
    if (!nextSlideId) return;
    const hasRequestedSlide = (slideItems ?? []).some((item: any) => {
      return `${item?.id ?? ''}`.trim() === nextSlideId;
    });
    if (!hasRequestedSlide) return;
    if (`${currentSlideId ?? ''}`.trim() === nextSlideId) return;
    store.requestSwitchSlide(nextSlideId);
  }, [requestedSlideId, slideItems, store]);

  useEffect(() => {
    const nextSlideId = `${requestedSlideId ?? ''}`.trim();
    if (!nextSlideId) return;
    if (isSlidesInitializing || isSlideSwitching || isSlideDeleting || isPageDeleting || isPersisting) return;
    const hasRequestedSlide = (slideItems ?? []).some((item: any) => {
      return `${item?.id ?? ''}`.trim() === nextSlideId;
    });
    if (hasRequestedSlide) return;
    store.requestInitializeSlides();
  }, [
    requestedSlideId,
    slideItems,
    isSlidesInitializing,
    isSlideSwitching,
    isSlideDeleting,
    isPageDeleting,
    isPersisting,
    store,
  ]);

  useEffect(() => {
    if (!onCurrentSlideIdChange) return;
    const nextSlideId = `${currentSlideId ?? ''}`.trim();
    if (!nextSlideId) return;
    const requestedId = `${requestedSlideId ?? ''}`.trim();
    if (requestedId && requestedId !== nextSlideId) return;
    onCurrentSlideIdChange(nextSlideId);
  }, [currentSlideId, onCurrentSlideIdChange, requestedSlideId]);

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
  const currentGroupId = `${ownerGroupIdBySlideId?.[currentSlideId] ?? ''}`.trim();

  return (
    <SlideStoreProvider store={store}>
      <div className={`slide-system-root ${isFullWindow ? 'is-full-window' : ''}`}>
        <Header
          isHidden={isFullWindow}
          slideItems={slideItems}
          currentSlideId={currentSlideId}
          currentSlideName={currentSlide?.name ?? ''}
          isSettingBusy={isSettingBusy}
          isPersisting={isPersisting}
          isSlideDeleting={isSlideDeleting}
          currentPageIndex={currentPageIndex}
          totalPage={totalPage}
          isCurrentPageDirty={isCurrentPageDirty}
          persistFailureMessage={persistFailureMessage}
          hasPrevPage={Boolean(prevPage)}
          hasNextPage={Boolean(nextPage)}
          hasDeletePage={totalPage > 1 && currentPageIndex > 0}
          hasMovePrevPage={currentPageIndex > 1}
          hasMoveNextPage={currentPageIndex > 0 && currentPageIndex < totalPage}
          onSwitchSlide={(slideId) => {
            store.requestSwitchSlide(slideId);
          }}
          onRenameSlide={(nextName) => {
            store.requestRenameCurrentSlide(nextName);
          }}
          onCreateSlide={() => {
            store.requestCreateSlide('Untitled');
          }}
          onDeleteSlide={() => {
            store.requestDeleteCurrentSlide();
          }}
          onReinitDatabase={() => {
            store.requestReinitDatabase();
          }}
          onDumpDatabase={() => {
            store.requestDumpDatabaseSnapshot();
          }}
          databaseItems={backendStore?.databaseItems ?? []}
          currentDatabaseKey={backendStore?.currentDatabaseKey ?? ''}
          isDatabaseLoading={backendStore?.isDatabaseLoading ?? false}
          isDatabaseSwitching={backendStore?.isDatabaseSwitching ?? false}
          isDatabaseTesting={backendStore?.isDatabaseTesting ?? false}
          testingDatabaseKey={backendStore?.testingDatabaseKey ?? ''}
          loadFailureMessage={backendStore?.loadFailureMessage ?? ''}
          onRefreshDatabases={() => {
            backendStore?.requestLoadDatabases();
          }}
          onTestDatabase={(presetKey) => {
            backendStore?.requestTestDatabase(presetKey);
          }}
          onSwitchDatabase={async (presetKey) => {
            const result = await backendStore?.requestSwitchDatabase(presetKey);
            if (!result?.ok) return;
            await store.requestReloadAfterDatabaseSwitch();
          }}
          onCreatePageBefore={() => {
            store.requestCreatePageBeforeCurrent();
          }}
          onCreatePageAfter={() => {
            store.requestCreatePageAfterCurrent();
          }}
          onDeletePage={() => {
            store.requestDeleteCurrentPage();
          }}
          onGoPrevPage={() => {
            if (!prevPage) return;
            store.setCurrentPage(prevPage.id);
            store.clearSelectedContainer();
          }}
          onGoNextPage={() => {
            if (!nextPage) return;
            store.setCurrentPage(nextPage.id);
            store.clearSelectedContainer();
          }}
          onMovePrevPage={() => {
            store.requestMoveCurrentPageByOffset(-1);
          }}
          onMoveNextPage={() => {
            store.requestMoveCurrentPageByOffset(1);
          }}
          isViewInsideGroupButtonVisible={Boolean(currentGroupId)}
          onViewInsideGroup={() => {
            if (!currentGroupId || !currentSlideId) return;
            onRequestOpenGroupView?.(currentGroupId, currentSlideId);
          }}
        />
        <div className="slide-system-canvas-wrap">
          {currentPage ? (
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
            <div className="slide-system-empty">No page data</div>
          )}
        </div>
      </div>
    </SlideStoreProvider>
  );
});

export default Slides;
