import React from 'react';
import { observer } from 'mobx-react-lite';
import { ButtonWithDropDown, LeftIcon, RightIcon } from '@wwf971/react-comp-misc';
import SlideSwitcher from './SlideSwitcher';
import DbSwitcher from '../backend/DbSwitcher';

export type HeaderEvent =
  | { type: 'switchSlide'; slideId: string }
  | { type: 'renameSlide'; name: string }
  | { type: 'createSlide' }
  | { type: 'deleteSlide' }
  | { type: 'viewOverview' }
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
  isStackMode?: boolean;
  isSlideNavigationButtonVisible?: boolean;
  isViewInsideGroupButtonVisible?: boolean;
};

const renderIcon = (IconComp: any, width: number, height: number) => {
  return React.createElement(IconComp, { width, height });
};

const handleHorizontalWheelScroll = (
  event: React.WheelEvent<HTMLDivElement>,
) => {
  const host = event.currentTarget;
  const maxScrollLeft = host.scrollWidth - host.clientWidth;
  if (maxScrollLeft <= 0) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ? event.deltaX
    : event.deltaY;
  if (Math.abs(delta) < 0.01) return;
  event.preventDefault();
  host.scrollLeft += delta;
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
    | 'isSlideNavigationButtonVisible'
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
  isSlideNavigationButtonVisible: false,
  isViewInsideGroupButtonVisible: false,
};

const Header = observer(
  ({
    slidesStore,
    backendStore = null,
    data = {},
    config = {},
    onEndpointSwitchStart,
    onEvent,
  }: {
    slidesStore: any;
    backendStore?: any;
    data?: HeaderData;
    config?: HeaderConfig;
    onEndpointSwitchStart?: () => void;
    onEvent?: (event: HeaderEvent) => boolean | void | Promise<boolean | void>;
  }) => {
    const switchRequestTokenRef = React.useRef(0);
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
      const switchRequestToken = switchRequestTokenRef.current + 1;
      switchRequestTokenRef.current = switchRequestToken;
      const isLatestSwitchRequest = () => switchRequestTokenRef.current === switchRequestToken;
      if (onEndpointSwitchStart) {
        onEndpointSwitchStart();
      } else {
        slidesStore.resetStateForDatabaseSwitch?.();
      }
      await backendStore.requestSwitchDatabase(presetKey);
      if (!isLatestSwitchRequest()) return;
      await backendStore.requestLoadDatabases?.(true);
      if (!isLatestSwitchRequest()) return;
      const endpointKeyCurrent = `${backendStore.endpointKeyCurrent ?? ''}`.trim();
      const currentDatabaseItem = (backendStore.databaseItems ?? []).find((item: any) => {
        return `${item?.key ?? ''}`.trim() === endpointKeyCurrent;
      });
      const isCurrentDatabaseReadable = currentDatabaseItem?.isConnected === true && currentDatabaseItem?.isInError !== true;
      if (!isCurrentDatabaseReadable) return;
      await slidesStore.requestInitializeSlides?.(true);
      if (!isLatestSwitchRequest()) return;
      if (slidesStore.isSlideInitFailed !== true) {
        slidesStore.persistFailureMessage = '';
      }
    };

    const slideNavigationItems = [
      ...(mergedConfig.isViewInsideGroupButtonVisible
        ? [{ id: 'openGroupView', label: 'Open Group View', isDisabled: isSettingBusy || isPersisting || !slideCurrentId }]
        : []),
      { id: 'openOverview', label: 'Open Overview', isDisabled: isSettingBusy || isPersisting },
    ];

    const slideActionItems = [
      { id: 'createSlide', label: 'New', isDisabled: isSettingBusy },
      {
        id: 'deleteSlide',
        label: 'Delete Current',
        isDisabled: isSettingBusy || isPersisting || isSlideDeleting || !slideCurrentId,
      },
    ];

    const databaseActionItems = [
      { id: 'reinitDatabase', label: 'Reinit DB', isDisabled: isSettingBusy },
      { id: 'dumpDatabase', label: 'Dump DB', isDisabled: isSettingBusy },
    ];

    return (
      <div className={`slide-system-toolbar ${mergedConfig.isHidden ? 'is-hidden' : ''}`}>
        {(mergedConfig.isDatabaseSwitcherVisible && backendStore) || mergedConfig.isSlideSwitcherVisible ? (
          <div className="slide-toolbar-selectors">
            {mergedConfig.isDatabaseSwitcherVisible && backendStore ? (
              <DbSwitcher
                data={{
                  items: backendStore.databaseItems ?? [],
                  currentId: backendStore.endpointKeyCurrent ?? '',
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
          </div>
        ) : null}
        {mergedConfig.isSlideNavigationButtonVisible ? (
          <ButtonWithDropDown
            data={{
              label: 'Navigate',
              items: slideNavigationItems,
            }}
            config={{
              isDisabled: isSettingBusy || isPersisting,
            }}
            onEvent={(eventType: string, eventData: any) => {
              if (eventType !== 'itemClick') return;
              if (eventData.itemId === 'openGroupView') {
                void runEvent({ type: 'viewInsideGroup' }, async () => {});
                return;
              }
              if (eventData.itemId === 'openOverview') {
                void runEvent({ type: 'viewOverview' }, async () => {});
              }
            }}
          />
        ) : null}
        {(mergedConfig.isSlideActionButtonsVisible || mergedConfig.isDatabaseActionButtonsVisible) ? (
          <div
            className="slide-toolbar-settings slide-toolbar-scrollable-group"
            onWheel={handleHorizontalWheelScroll}
          >
            {mergedConfig.isSlideActionButtonsVisible ? (
              <ButtonWithDropDown
                data={{
                  label: 'Slide',
                  items: slideActionItems,
                }}
                config={{
                  isDisabled: isSettingBusy,
                }}
                onEvent={(eventType: string, eventData: any) => {
                  if (eventType !== 'itemClick') return;
                  if (eventData.itemId === 'createSlide') {
                    void runEvent({ type: 'createSlide' }, async () => {
                      await slidesStore.requestCreateSlide('Untitled');
                    });
                    return;
                  }
                  if (eventData.itemId === 'deleteSlide') {
                    void runEvent({ type: 'deleteSlide' }, async () => {
                      await slidesStore.requestDeleteCurrentSlide();
                    });
                  }
                }}
              />
            ) : null}
            {mergedConfig.isDatabaseActionButtonsVisible ? (
              <ButtonWithDropDown
                data={{
                  label: 'DB',
                  items: databaseActionItems,
                }}
                config={{
                  isDisabled: isSettingBusy,
                }}
                onEvent={(eventType: string, eventData: any) => {
                  if (eventType !== 'itemClick') return;
                  if (eventData.itemId === 'reinitDatabase') {
                    slidesStore.requestReinitDatabase?.();
                    return;
                  }
                  if (eventData.itemId === 'dumpDatabase') {
                    slidesStore.requestDumpDatabaseSnapshot?.();
                  }
                }}
              />
            ) : null}
          </div>
        ) : null}
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
        <div
          className="slide-toolbar-page-nav slide-toolbar-scrollable-group"
          onWheel={handleHorizontalWheelScroll}
        >
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
