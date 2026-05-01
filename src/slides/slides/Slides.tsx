import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { SlideStoreProvider } from '../contentStore';
import Slide from '../slide/Slide';
import Header from '../layout/Header';
import '../slide/Slide.css';

const Slides = observer(({ store, getComp }: any) => {
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

  useEffect(() => {
    store.requestInitializeSlides();
  }, [store]);

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
        />
        <div className="slide-system-canvas-wrap">
          {currentPage ? (
            <Slide
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
