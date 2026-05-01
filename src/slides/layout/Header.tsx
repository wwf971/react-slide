import React from 'react';
import { LeftIcon, RightIcon } from '@wwf971/react-comp-misc/Icon';
import SlidesSwticher from './SlidesSwticher';

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
  onCreatePageBefore,
  onCreatePageAfter,
  onDeletePage,
  onGoPrevPage,
  onGoNextPage,
  onMovePrevPage,
  onMoveNextPage,
}: any) => {
  return (
    <div className={`slide-system-toolbar ${isHidden ? 'is-hidden' : ''}`}>
      <div className="slide-toolbar-settings">
        <SlidesSwticher
          slideItems={slideItems}
          currentSlideId={currentSlideId}
          currentSlideName={currentSlideName}
          isSettingBusy={isSettingBusy}
          onSwitchSlide={onSwitchSlide}
          onRenameSlide={onRenameSlide}
        />
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
      </div>
      <div className="slide-toolbar-page">
        <span className="slide-toolbar-page-value">{currentPageIndex}</span>
        <span className="slide-toolbar-page-value">{isCurrentPageDirty ? '*' : ''}</span>
        <span className="slide-toolbar-page-sep">/</span>
        <span className="slide-toolbar-page-value">{totalPage}</span>
        <span className={`slide-toolbar-saving ${isPersisting ? 'is-visible' : ''}`}>saving</span>
        <span className="slide-toolbar-save-fail">{persistFailureMessage}</span>
      </div>
      <div className="slide-toolbar-page-nav">
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
      </div>
    </div>
  );
};

export default Header;
