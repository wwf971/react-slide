import React from 'react';
import { LeftIcon, RightIcon } from '@wwf971/react-comp-misc/Icon';
import SlideSwitcher from './SlideSwitcher';
import DbSwitcher from '../backend/DbSwitcher';

const renderIcon = (IconComp: any, width: number, height: number) => {
  return React.createElement(IconComp, { width, height });
};

const Header = ({
  isHidden,
  slideItems,
  currentSlideId,
  currentSlideName,
  isSettingBusy,
  isPersisting,
  isSlideDeleting,
  currentPageIndex,
  totalPage,
  isCurrentPageDirty,
  persistFailureMessage,
  hasPrevPage,
  hasNextPage,
  hasDeletePage,
  hasMovePrevPage,
  hasMoveNextPage,
  onSwitchSlide,
  onRenameSlide,
  onCreateSlide,
  onDeleteSlide,
  onReinitDatabase,
  onDumpDatabase,
  databaseItems,
  currentDatabaseKey,
  isDatabaseLoading,
  isDatabaseSwitching,
  isDatabaseTesting,
  testingDatabaseKey,
  loadFailureMessage,
  onRefreshDatabases,
  onSwitchDatabase,
  onTestDatabase,
  onCreatePageBefore,
  onCreatePageAfter,
  onDeletePage,
  onGoPrevPage,
  onGoNextPage,
  onMovePrevPage,
  onMoveNextPage,
  onSaveCurrentPage,
  isDatabaseSwitcherVisible = true,
  isSlideSwitcherVisible = true,
  isSlideActionButtonsVisible = true,
  isDatabaseActionButtonsVisible = true,
  isPageActionButtonsVisible = true,
  isPageArrowButtonsVisible = true,
  isSaveButtonVisible = false,
  isStackModeToggleVisible = false,
  isStackMode = false,
  onToggleStackMode,
  isViewInsideGroupButtonVisible = false,
  onViewInsideGroup,
}: any) => {
  return (
    <div className={`slide-system-toolbar ${isHidden ? 'is-hidden' : ''}`}>
      <div className="slide-toolbar-settings">
        {isDatabaseSwitcherVisible ? (
          <DbSwitcher
            databaseItems={databaseItems}
            currentDatabaseKey={currentDatabaseKey}
            isSettingBusy={isSettingBusy}
            isDatabaseLoading={isDatabaseLoading}
            isDatabaseSwitching={isDatabaseSwitching}
            isDatabaseTesting={isDatabaseTesting}
            testingDatabaseKey={testingDatabaseKey}
            loadFailureMessage={loadFailureMessage}
            onRefreshDatabases={onRefreshDatabases}
            onSwitchDatabase={onSwitchDatabase}
            onTestDatabase={onTestDatabase}
          />
        ) : null}
        {isSlideSwitcherVisible ? (
          <SlideSwitcher
            slideItems={slideItems}
            currentSlideId={currentSlideId}
            currentSlideName={currentSlideName}
            isSettingBusy={isSettingBusy}
            onSwitchSlide={onSwitchSlide}
            onRenameSlide={onRenameSlide}
          />
        ) : null}
        {isSlideActionButtonsVisible ? (
          <>
            {isViewInsideGroupButtonVisible ? (
              <button
                className="slide-toolbar-btn"
                type="button"
                disabled={isSettingBusy || isPersisting || !currentSlideId}
                onClick={() => {
                  onViewInsideGroup?.();
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
                onCreateSlide?.();
              }}
            >
              New
            </button>
            <button
              className="slide-toolbar-btn"
              type="button"
              disabled={isSettingBusy || isPersisting || isSlideDeleting || !currentSlideId}
              onClick={() => {
                onDeleteSlide?.();
              }}
            >
              Delete Slide
            </button>
          </>
        ) : null}
        {isDatabaseActionButtonsVisible ? (
          <>
            <button
              className="slide-toolbar-btn"
              type="button"
              disabled={isSettingBusy}
              onClick={() => {
                onReinitDatabase?.();
              }}
            >
              Reinit DB
            </button>
            <button
              className="slide-toolbar-btn"
              type="button"
              disabled={isSettingBusy}
              onClick={() => {
                onDumpDatabase?.();
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
      <div className={`slide-toolbar-status ${persistFailureMessage ? 'is-visible' : ''}`}>
        {persistFailureMessage}
      </div>
      <div className="slide-toolbar-page-nav">
        {isPageActionButtonsVisible ? (
          <>
            {isSaveButtonVisible ? (
              <button
                className="slide-toolbar-btn"
                type="button"
                disabled={isSettingBusy || isPersisting}
                onClick={() => onSaveCurrentPage?.()}
              >
                Save
              </button>
            ) : null}
            <button
              className="slide-toolbar-btn"
              type="button"
              disabled={isSettingBusy || isPersisting}
              onClick={() => onCreatePageBefore?.()}
            >
              Create Before
            </button>
            <button
              className="slide-toolbar-btn"
              type="button"
              disabled={isSettingBusy || isPersisting}
              onClick={() => onCreatePageAfter?.()}
            >
              Create After
            </button>
            <button
              className="slide-toolbar-btn"
              type="button"
              disabled={isSettingBusy || isPersisting || !hasDeletePage}
              onClick={() => onDeletePage?.()}
            >
              Delete Page
            </button>
            <button
              className="slide-toolbar-btn"
              type="button"
              disabled={isSettingBusy || isPersisting || !hasMovePrevPage}
              onClick={() => onMovePrevPage?.()}
            >
              Move Prev
            </button>
            <button
              className="slide-toolbar-btn"
              type="button"
              disabled={isSettingBusy || isPersisting || !hasMoveNextPage}
              onClick={() => onMoveNextPage?.()}
            >
              Move Next
            </button>
            {isStackModeToggleVisible ? (
              <button
                className="slide-toolbar-btn"
                type="button"
                disabled={isSettingBusy || isPersisting}
                onClick={() => onToggleStackMode?.()}
              >
                {isStackMode ? 'Single Slide' : 'Stack Slides'}
              </button>
            ) : null}
          </>
        ) : null}
        {isPageArrowButtonsVisible ? (
          <>
            <button
              className="slide-toolbar-icon-btn"
              type="button"
              disabled={!hasPrevPage}
              onClick={() => onGoPrevPage?.()}
            >
              {renderIcon(LeftIcon, 12, 12)}
            </button>
            <button
              className="slide-toolbar-icon-btn"
              type="button"
              disabled={!hasNextPage}
              onClick={() => onGoNextPage?.()}
            >
              {renderIcon(RightIcon, 12, 12)}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default Header;
