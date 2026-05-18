import React from 'react';
import { observer } from 'mobx-react-lite';
import { LeftIcon, RightIcon } from '@wwf971/react-comp-misc';
import SlideSwitcher from './SlideSwitcher';
import DbSwitcher from '../backend/DbSwitcher';

export type HeaderEvent =
  | { type: 'switchSlide'; slideId: string }
  | { type: 'renameSlide'; name: string }
  | { type: 'createSlide' }
  | { type: 'deleteSlide' }
  | { type: 'viewInsideGroup' }
  | { type: 'toggleStackMode' }
  | { type: 'saveCurrentPage' };

export type HeaderData = {
  slideItems?: { id: string; name: string }[];
  slideCurrentId?: string;
  slideCurrentName?: string;
  statusMessage?: string;
};

export type HeaderConfig = {
  isHidden?: boolean;
  isSettingBusy?: boolean;
  isSlideDeleting?: boolean;
  isDatabaseSwitcherVisible?: boolean;
  isSlideSwitcherVisible?: boolean;
  isSlideActionButtonsVisible?: boolean;
  isDatabaseActionButtonsVisible?: boolean;
  isPageActionButtonsVisible?: boolean;
  isPageArrowButtonsVisible?: boolean;
  isSaveButtonVisible?: boolean;
  isStackModeToggleVisible?: boolean;
  /** When stack toggle is visible, toggles the nav button label. */
  isStackMode?: boolean;
  isViewInsideGroupButtonVisible?: boolean;
};

const renderIcon = (IconComp: any, width: number, height: number) => {
  return React.createElement(IconComp, { width, height });
};

const defaultConfig: Required<
  Pick<
    HeaderConfig,
    | 'isHidden'
    | 'isDatabaseSwitcherVisible'
    | 'isSlideSwitcherVisible'
    | 'isSlideActionButtonsVisible'
    | 'isDatabaseActionButtonsVisible'
    | 'isPageActionButtonsVisible'
    | 'isPageArrowButtonsVisible'
    | 'isSaveButtonVisible'
    | 'isStackModeToggleVisible'
    | 'isStackMode'
    | 'isViewInsideGroupButtonVisible'
  >
> = {
  isHidden: false,
  isDatabaseSwitcherVisible: true,
  isSlideSwitcherVisible: true,
  isSlideActionButtonsVisible: true,
  isDatabaseActionButtonsVisible: true,
  isPageActionButtonsVisible: true,
  isPageArrowButtonsVisible: true,
  isSaveButtonVisible: false,
  isStackModeToggleVisible: false,
  isStackMode: false,
  isViewInsideGroupButtonVisible: false,
};

const Header = observer(
  ({
    slidesStore,
    backendStore = null,
    data = {},
    config = {},
    onEvent,
  }: {
    slidesStore: any;
    backendStore?: any;
    data?: HeaderData;
    config?: HeaderConfig;
    onEvent?: (event: HeaderEvent) => boolean | void | Promise<boolean | void>;
  }) => {
    const mergedConfig = { ...defaultConfig, ...config };
    const isPersisting = slidesStore.isPersisting ?? false;
    const isSlideDeleting =
      config.isSlideDeleting !== undefined ? config.isSlideDeleting : slidesStore.isSlideDeleting ?? false;
    const isSettingBusy =
      config.isSettingBusy !== undefined
        ? config.isSettingBusy
        : Boolean(
            slidesStore.isSlidesInitializing ||
              slidesStore.isSlideSwitching ||
              slidesStore.isSlideDeleting ||
              slidesStore.isPageDeleting ||
              isPersisting,
          );

    const currentPage = slidesStore.getCurrentPageData?.() ?? slidesStore.getFirstPageData?.();
    const currentPageId = currentPage?.id ?? '';
    const totalPage = slidesStore.getTotalPageIndex?.() ?? 0;
    const currentPageIndex = slidesStore.getCurrentPageIndex?.(currentPageId) ?? 0;
    const isCurrentPageDirty = slidesStore.isPageDirty?.(currentPageId) ?? false;
    const prevPage = slidesStore.getPrevPageData?.(currentPageId);
    const nextPage = slidesStore.getNextPageData?.(currentPageId);

    const slideItems = data.slideItems ?? slidesStore.slideItems ?? [];
    const slideCurrentId = data.slideCurrentId ?? slidesStore.slideCurrentId ?? '';
    const currentSlide =
      slideItems.find((item: { id: string }) => `${item?.id ?? ''}` === `${slideCurrentId}`) ?? null;
    const slideCurrentName =
      data.slideCurrentName !== undefined ? data.slideCurrentName : (currentSlide?.name ?? '');

    const persistFailureMessage =
      `${data.statusMessage ?? slidesStore.persistFailureMessage ?? ''}`.trim();

    const runEvent = async (event: HeaderEvent, fallback: () => void | Promise<void>) => {
      const handled = await onEvent?.(event);
      if (handled === true) return;
      await fallback();
    };

    const handleSwitchDatabase = async (presetKey: string) => {
      if (!backendStore?.requestSwitchDatabase) return;
      await backendStore.requestSwitchDatabase(presetKey);
      await backendStore.requestLoadDatabases?.();
      await slidesStore.requestReloadAfterDatabaseSwitch?.();
    };

    return (
      <div className={`slide-system-toolbar ${mergedConfig.isHidden ? 'is-hidden' : ''}`}>
        <div className="slide-toolbar-settings">
          {mergedConfig.isDatabaseSwitcherVisible && backendStore ? (
            <DbSwitcher
              data={{
                items: backendStore.databaseItems ?? [],
                currentId: backendStore.currentDatabaseKey ?? '',
                loadFailureMessage: backendStore.loadFailureMessage ?? '',
              }}
              config={{
                isSettingBusy,
                isLoading: backendStore.isDatabaseLoading ?? false,
                isSwitching: backendStore.isDatabaseSwitching ?? false,
                isTesting: backendStore.isDatabaseTesting ?? false,
                testingId: backendStore.testingDatabaseKey ?? '',
              }}
              onEvent={(eventType, eventData) => {
                if (eventType === 'refresh') {
                  backendStore.requestLoadDatabases?.();
                  return;
                }
                if (eventType === 'switch') {
                  void handleSwitchDatabase(`${eventData?.id ?? ''}`);
                  return;
                }
                if (eventType === 'test') {
                  backendStore.requestTestDatabase?.(`${eventData?.id ?? ''}`);
                }
              }}
            />
          ) : null}
          {mergedConfig.isSlideSwitcherVisible ? (
            <SlideSwitcher
              slideItems={slideItems}
              slideCurrentId={slideCurrentId}
              slideCurrentName={slideCurrentName}
              isSettingBusy={isSettingBusy}
              onSwitchSlide={(slideId: string) => {
                void runEvent({ type: 'switchSlide', slideId }, async () => {
                  await slidesStore.requestSwitchSlide(slideId);
                });
              }}
              onRenameSlide={(nextName: string) => {
                void runEvent({ type: 'renameSlide', name: nextName }, async () => {
                  await slidesStore.requestRenameCurrentSlide(nextName);
                });
              }}
            />
          ) : null}
          {mergedConfig.isSlideActionButtonsVisible ? (
            <>
              {mergedConfig.isViewInsideGroupButtonVisible ? (
                <button
                  className="slide-toolbar-btn"
                  type="button"
                  disabled={isSettingBusy || isPersisting || !slideCurrentId}
                  onClick={() => {
                    void runEvent({ type: 'viewInsideGroup' }, async () => {});
                  }}
                >
                  View inside Group
                </button>
              ) : null}
              <button
                className="slide-toolbar-btn"
                type="button"
                disabled={isSettingBusy}
                onClick={() => {
                  void runEvent({ type: 'createSlide' }, async () => {
                    await slidesStore.requestCreateSlide('Untitled');
                  });
                }}
              >
                New
              </button>
              <button
                className="slide-toolbar-btn"
                type="button"
                disabled={isSettingBusy || isPersisting || isSlideDeleting || !slideCurrentId}
                onClick={() => {
                  void runEvent({ type: 'deleteSlide' }, async () => {
                    await slidesStore.requestDeleteCurrentSlide();
                  });
                }}
              >
                Delete Slide
              </button>
            </>
          ) : null}
          {mergedConfig.isDatabaseActionButtonsVisible ? (
            <>
              <button
                className="slide-toolbar-btn"
                type="button"
                disabled={isSettingBusy}
                onClick={() => {
                  slidesStore.requestReinitDatabase?.();
                }}
              >
                Reinit DB
              </button>
              <button
                className="slide-toolbar-btn"
                type="button"
                disabled={isSettingBusy}
                onClick={() => {
                  slidesStore.requestDumpDatabaseSnapshot?.();
                }}
              >
                Dump DB
              </button>
            </>
          ) : null}
        </div>
        <div className="slide-toolbar-page">
          <span className="slide-toolbar-page-value">{currentPageIndex}</span>
          <span className="slide-toolbar-page-value">{isCurrentPageDirty ? '*' : ''}</span>
          <span className="slide-toolbar-page-sep">/</span>
          <span className="slide-toolbar-page-value">{totalPage}</span>
          <span className={`slide-toolbar-saving ${isPersisting ? 'is-visible' : ''}`}>saving</span>
        </div>
        <div
          className={`slide-toolbar-status ${persistFailureMessage ? 'is-visible' : ''}`}
          title={persistFailureMessage || ''}
        >
          {persistFailureMessage}
        </div>
        <div className="slide-toolbar-page-nav">
          {mergedConfig.isPageActionButtonsVisible ? (
            <>
              {mergedConfig.isSaveButtonVisible ? (
                <button
                  className="slide-toolbar-btn"
                  type="button"
                  disabled={isSettingBusy || isPersisting}
                  onClick={() => {
                    void runEvent({ type: 'saveCurrentPage' }, async () => {
                      await slidesStore.requestPersistDirtyPages();
                    });
                  }}
                >
                  Save
                </button>
              ) : null}
              <button
                className="slide-toolbar-btn"
                type="button"
                disabled={isSettingBusy || isPersisting}
                onClick={() => {
                  slidesStore.requestCreatePageBeforeCurrent?.();
                }}
              >
                Create Before
              </button>
              <button
                className="slide-toolbar-btn"
                type="button"
                disabled={isSettingBusy || isPersisting}
                onClick={() => {
                  slidesStore.requestCreatePageAfterCurrent?.();
                }}
              >
                Create After
              </button>
              <button
                className="slide-toolbar-btn"
                type="button"
                disabled={isSettingBusy || isPersisting || !(totalPage > 1 && currentPageIndex > 0)}
                onClick={() => {
                  slidesStore.requestDeleteCurrentPage?.();
                }}
              >
                Delete Page
              </button>
              <button
                className="slide-toolbar-btn"
                type="button"
                disabled={isSettingBusy || isPersisting || !(currentPageIndex > 1)}
                onClick={() => {
                  slidesStore.requestMoveCurrentPageByOffset?.(-1);
                }}
              >
                Move Prev
              </button>
              <button
                className="slide-toolbar-btn"
                type="button"
                disabled={
                  isSettingBusy ||
                  isPersisting ||
                  !(currentPageIndex > 0 && currentPageIndex < totalPage)
                }
                onClick={() => {
                  slidesStore.requestMoveCurrentPageByOffset?.(1);
                }}
              >
                Move Next
              </button>
              {mergedConfig.isStackModeToggleVisible ? (
                <button
                  className="slide-toolbar-btn"
                  type="button"
                  disabled={isSettingBusy || isPersisting}
                  onClick={() => {
                    void runEvent({ type: 'toggleStackMode' }, async () => {});
                  }}
                >
                  {mergedConfig.isStackMode ? 'Single Slide' : 'Stack Slides'}
                </button>
              ) : null}
            </>
          ) : null}
          {mergedConfig.isPageArrowButtonsVisible ? (
            <>
              <button
                className="slide-toolbar-icon-btn"
                type="button"
                disabled={!prevPage}
                onClick={() => {
                  if (!prevPage) return;
                  slidesStore.setCurrentPage(prevPage.id);
                  slidesStore.clearSelectedContainer?.();
                }}
              >
                {renderIcon(LeftIcon, 12, 12)}
              </button>
              <button
                className="slide-toolbar-icon-btn"
                type="button"
                disabled={!nextPage}
                onClick={() => {
                  if (!nextPage) return;
                  slidesStore.setCurrentPage(nextPage.id);
                  slidesStore.clearSelectedContainer?.();
                }}
              >
                {renderIcon(RightIcon, 12, 12)}
              </button>
            </>
          ) : null}
        </div>
      </div>
    );
  },
);

export default Header;
