import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { EditableValueComp, PanelPopup } from '@wwf971/react-comp-misc';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SlideStoreProvider } from '../store/slidesStore';
import Header from '../layout/Header';
import Page from '../page/Page';
import GroupViewObjectTree from './GroupViewObjectTree';
import { normalizeFolderPath } from './groupViewTreeUtils';
import './GroupViewPage.css';

const getFolderPathText = (pathRaw = '') => {
  const normalizedPath = normalizeFolderPath(pathRaw);
  if (!normalizedPath) return '/';
  return `/${normalizedPath}/`;
};

const GroupViewPage = observer(({ slidesGroupStore, slidesStore, getComp }) => {
  const navigate = useNavigate();
  const { groupId: groupIdRaw } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const groupId = `${groupIdRaw ?? ''}`.trim();
  const [selectedSlideId, setSelectedSlideId] = useState('');
  const [pathChangeState, setPathChangeState] = useState(null);
  const [isStackMode, setIsStackMode] = useState(false);
  const rightPanelRef = useRef(null);
  const requestedSlideIdFromQuery = `${searchParams.get('selectedSlide') ?? ''}`.trim();

  useEffect(() => {
    if ((slidesStore.slideItems ?? []).length > 0) return;
    slidesStore.requestInitializeSlides();
  }, [slidesStore, slidesStore.slideItems?.length]);

  useEffect(() => {
    if (!groupId) return;
    slidesGroupStore.requestLoadGroup(groupId);
    slidesGroupStore.requestLoadOverview();
  }, [groupId, slidesGroupStore]);

  const groupData = slidesGroupStore.currentGroup;
  const groupSlides = useMemo(() => {
    return Array.isArray(groupData?.slides) ? groupData.slides : [];
  }, [groupData?.slides]);
  const slideNameById = slidesGroupStore.slideNameById ?? {};
  const missingSlideIdMap = useMemo(() => {
    const output = {};
    groupSlides.forEach((slideItem) => {
      const slideId = `${slideItem?.slideId ?? ''}`.trim();
      if (!slideId) return;
      if (Object.prototype.hasOwnProperty.call(slideNameById, slideId)) return;
      output[slideId] = true;
    });
    const selectedSlideIdText = `${selectedSlideId ?? ''}`.trim();
    const hasSelectedSlideSwitchFailure = Boolean(
      selectedSlideIdText
      && !slidesStore.isSlideSwitching
      && slidesStore.slideCurrentId !== selectedSlideIdText
      && `${slidesStore.persistFailureMessage ?? ''}`.trim(),
    );
    if (hasSelectedSlideSwitchFailure) {
      output[selectedSlideIdText] = true;
    }
    return output;
  }, [
    groupSlides,
    selectedSlideId,
    slideNameById,
    slidesStore.slideCurrentId,
    slidesStore.isSlideSwitching,
    slidesStore.persistFailureMessage,
  ]);
  const getIsSlideKnown = (slideIdRaw = '') => {
    const slideId = `${slideIdRaw ?? ''}`.trim();
    if (!slideId) return false;
    return Object.prototype.hasOwnProperty.call(slideNameById, slideId);
  };

  useEffect(() => {
    if (groupSlides.length <= 0) {
      setSelectedSlideId('');
      if (requestedSlideIdFromQuery) {
        setSearchParams((prevParams) => {
          const nextParams = new URLSearchParams(prevParams);
          nextParams.delete('selectedSlide');
          return nextParams;
        }, { replace: true });
      }
      return;
    }
    const hasSelectedSlide = groupSlides.some((slideItem) => `${slideItem?.slideId ?? ''}`.trim() === selectedSlideId);
    if (hasSelectedSlide) {
      const isRequestedSlideValid = requestedSlideIdFromQuery
        ? groupSlides.some((slideItem) => `${slideItem?.slideId ?? ''}`.trim() === requestedSlideIdFromQuery)
        : true;
      if (!isRequestedSlideValid && requestedSlideIdFromQuery) {
        setSearchParams((prevParams) => {
          const nextParams = new URLSearchParams(prevParams);
          nextParams.delete('selectedSlide');
          return nextParams;
        }, { replace: true });
      }
      return;
    }
    const isRequestedSlideValid = requestedSlideIdFromQuery
      ? groupSlides.some((slideItem) => `${slideItem?.slideId ?? ''}`.trim() === requestedSlideIdFromQuery)
      : false;
    if (isRequestedSlideValid) {
      setSelectedSlideId(requestedSlideIdFromQuery);
      return;
    }
    if (requestedSlideIdFromQuery) {
      setSearchParams((prevParams) => {
        const nextParams = new URLSearchParams(prevParams);
        nextParams.delete('selectedSlide');
        return nextParams;
      }, { replace: true });
    }
    setSelectedSlideId(`${groupSlides[0]?.slideId ?? ''}`.trim());
  }, [groupSlides, selectedSlideId, requestedSlideIdFromQuery, setSearchParams]);

  useEffect(() => {
    const nextSlideId = `${selectedSlideId ?? ''}`.trim();
    if (!nextSlideId) return;
    if (!getIsSlideKnown(nextSlideId)) return;
    slidesStore.requestSwitchSlide(nextSlideId);
  }, [selectedSlideId, slidesStore, slideNameById]);

  useEffect(() => {
    setSearchParams((prevParams) => {
      const nextParams = new URLSearchParams(prevParams);
      const currentParamSlideId = `${nextParams.get('selectedSlide') ?? ''}`.trim();
      const nextSlideId = `${selectedSlideId ?? ''}`.trim();
      if (!nextSlideId) {
        if (!currentParamSlideId) return prevParams;
        nextParams.delete('selectedSlide');
        return nextParams;
      }
      if (currentParamSlideId === nextSlideId) return prevParams;
      nextParams.set('selectedSlide', nextSlideId);
      return nextParams;
    }, { replace: true });
  }, [selectedSlideId, setSearchParams]);

  useEffect(() => {
    const onWindowKeyDown = (event) => {
      const isSaveHotkey = (event.ctrlKey || event.metaKey) && `${event.key ?? ''}`.toLowerCase() === 's';
      if (!isSaveHotkey) return;
      event.preventDefault();
      event.stopPropagation();
      slidesStore.requestPersistDirtyPages();
    };
    document.addEventListener('keydown', onWindowKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onWindowKeyDown, true);
    };
  }, [slidesStore]);

  const selectedSlide = groupSlides.find((slideItem) => `${slideItem?.slideId ?? ''}`.trim() === selectedSlideId) ?? null;
  const selectedSlideName = `${slidesGroupStore.slideNameById?.[selectedSlideId] ?? ''}`.trim() || selectedSlideId;
  const selectedFolderPathText = getFolderPathText(selectedSlide?.path ?? '');
  const isSelectedSlideInGroup = Boolean(selectedSlide);
  const isSelectedSlideKnown = getIsSlideKnown(selectedSlideId);
  const isSelectedSlideSwitchFailed = Boolean(
    selectedSlideId
    && !slidesStore.isSlideSwitching
    && slidesStore.slideCurrentId !== selectedSlideId
    && `${slidesStore.persistFailureMessage ?? ''}`.trim(),
  );
  const isSelectedSlideUnavailable = isSelectedSlideInGroup && (!isSelectedSlideKnown || isSelectedSlideSwitchFailed);
  const selectedSlideUnavailableMessage = !isSelectedSlideInGroup
    ? ''
    : (!isSelectedSlideKnown
      ? `Slide does not exist or cannot be found: ${selectedSlideId}`
      : `${slidesStore.persistFailureMessage ?? ''}`.trim() || `Failed to load slide: ${selectedSlideId}`);

  const currentPage = slidesStore.getCurrentPageData() ?? slidesStore.getFirstPageData();
  const pageIdsForStack = (slidesStore.metadata?.pageIds ?? []).filter(Boolean);
  const groupSlideItems = groupSlides.map((slideItem) => {
    const slideId = `${slideItem?.slideId ?? ''}`.trim();
    return {
      id: slideId,
      name: `${slidesGroupStore.slideNameById?.[slideId] ?? ''}`.trim() || slideId,
    };
  });

  const requestCreateSlideUnderFolder = async (folderPathRaw = '') => {
    const createResult = await slidesStore.requestCreateSlide('Untitled');
    if (!createResult?.ok) return;
    const createdSlideId = `${slidesStore.slideCurrentId ?? ''}`.trim();
    if (!createdSlideId) return;
    const nextSlides = [...groupSlides, { slideId: createdSlideId, path: normalizeFolderPath(folderPathRaw) }];
    const result = await slidesGroupStore.requestUpdateGroupSlides(groupId, nextSlides);
    if (result?.ok) setSelectedSlideId(createdSlideId);
  };

  const requestDeleteSlideFromGroup = async (slideIdRaw = '') => {
    const slideId = `${slideIdRaw ?? ''}`.trim();
    if (!slideId) return;
    const nextSlides = groupSlides.filter((slideItem) => `${slideItem?.slideId ?? ''}`.trim() !== slideId);
    const updateResult = await slidesGroupStore.requestUpdateGroupSlides(groupId, nextSlides);
    if (!updateResult?.ok) return;
    if (!getIsSlideKnown(slideId)) {
      const nextSelectedSlideId = `${nextSlides[0]?.slideId ?? ''}`.trim();
      setSelectedSlideId(nextSelectedSlideId);
      return;
    }
    await slidesStore.requestSwitchSlide(slideId);
    if (`${slidesStore.slideCurrentId ?? ''}`.trim() !== slideId) {
      const nextSelectedSlideId = `${nextSlides[0]?.slideId ?? ''}`.trim();
      setSelectedSlideId(nextSelectedSlideId);
      return;
    }
    const deleteResult = await slidesStore.requestDeleteCurrentSlide();
    if (!deleteResult?.ok) {
      await slidesGroupStore.requestLoadGroup(groupId);
      await slidesGroupStore.requestLoadOverview();
      return;
    }
    const nextSelectedSlideId = `${nextSlides[0]?.slideId ?? ''}`.trim();
    setSelectedSlideId(nextSelectedSlideId);
  };

  const requestExcludeSlideFromGroup = async (slideIdRaw = '') => {
    const slideId = `${slideIdRaw ?? ''}`.trim();
    if (!slideId) return;
    const nextSlides = groupSlides.filter((slideItem) => `${slideItem?.slideId ?? ''}`.trim() !== slideId);
    const result = await slidesGroupStore.requestUpdateGroupSlides(groupId, nextSlides);
    if (!result?.ok) return;
    const nextSelectedSlideId = `${nextSlides[0]?.slideId ?? ''}`.trim();
    setSelectedSlideId(nextSelectedSlideId);
  };

  const groupFolderPaths = Array.isArray(groupData?.folderPaths) ? groupData.folderPaths : [];

  return (
    <SlideStoreProvider store={slidesStore}>
      <div className="group-view-root">
        <div className="group-view-top-header">
          <div className="group-view-top-header-left">
            <button className="group-view-btn" type="button" onClick={() => navigate('/overview')}>
              Back
            </button>
          </div>
          <div className="group-view-top-header-title">
            <div className="group-view-top-header-title-text">
              <EditableValueComp
                data={{
                  text: `${groupData?.name ?? ''}`.trim() || 'Untitled Group',
                  style: {
                    fontSize: '18px',
                    fontWeight: 700,
                  },
                }}
                index={0}
                rowId={groupId}
                field="name"
                category="slide-group"
                configKey={`group-name-${groupId}`}
                onUpdate={async (_configKey, value) => {
                  const result = await slidesGroupStore.requestRenameGroup(groupId, `${value ?? ''}`);
                  return {
                    code: result?.ok ? 0 : -1,
                    message: `${slidesGroupStore.errorText ?? ''}`.trim() || 'failed to rename group',
                  };
                }}
              />
            </div>
          </div>
          <div className="group-view-top-header-right" />
        </div>

        <div className="group-view-main">
          <GroupViewObjectTree
            groupData={groupData}
            slideNameById={slidesGroupStore.slideNameById}
            missingSlideIdMap={missingSlideIdMap}
            selectedSlideId={selectedSlideId}
            onSelectSlide={(slideId) => setSelectedSlideId(`${slideId ?? ''}`.trim())}
            onRequestCreateSlideUnderFolder={(folderPathRaw) => requestCreateSlideUnderFolder(folderPathRaw)}
            onRequestDeleteSlide={(slideId) => requestDeleteSlideFromGroup(slideId)}
            onRequestExcludeSlideFromGroup={(slideId) => requestExcludeSlideFromGroup(slideId)}
            onRequestChangeSlidePath={(slideId, path) => {
              setPathChangeState({
                slideId: `${slideId ?? ''}`.trim(),
                path: `${path ?? ''}`.trim(),
              });
            }}
            onRequestSetFolderPersisting={async (folderPathRaw) => {
              const folderPath = normalizeFolderPath(folderPathRaw);
              if (!folderPath) return;
              const normalizedFolderPath = `${folderPath}/`;
              const nextFolderPaths = groupFolderPaths.includes(normalizedFolderPath)
                ? groupFolderPaths
                : [...groupFolderPaths, normalizedFolderPath];
              await slidesGroupStore.requestUpdateGroupSlides(groupId, groupSlides, nextFolderPaths);
            }}
            onRequestCancelFolderPersisting={async (folderPathRaw) => {
              const folderPath = normalizeFolderPath(folderPathRaw);
              if (!folderPath) return;
              const nextFolderPaths = groupFolderPaths.filter((folderPathItem) => {
                return normalizeFolderPath(folderPathItem) !== folderPath;
              });
              await slidesGroupStore.requestUpdateGroupSlides(groupId, groupSlides, nextFolderPaths);
            }}
          />

          <div ref={rightPanelRef} className="group-view-right">
            <div className="group-view-rename-line">
              <EditableValueComp
                data={selectedSlideName || ''}
                index={0}
                rowId={selectedSlideId}
                field="name"
                category="slide"
                configKey={`slide-name-${selectedSlideId}`}
                onUpdate={async (_configKey, value) => {
                  const result = await slidesGroupStore.requestRenameSlide(selectedSlideId, `${value ?? ''}`);
                  return {
                    code: result?.ok ? 0 : -1,
                    message: `${slidesGroupStore.errorText ?? ''}`.trim() || 'failed to rename slide',
                  };
                }}
              />
              <button
                className="group-view-open-slide-btn"
                type="button"
                disabled={!selectedSlideId}
                onClick={() => {
                  if (!selectedSlideId) return;
                  navigate(`/slide/${encodeURIComponent(selectedSlideId)}`);
                }}
              >
                Open Slide
              </button>
            </div>

            <Header
              slidesStore={slidesStore}
              data={{
                slideItems: groupSlideItems,
                slideCurrentId: selectedSlideId,
                slideCurrentName: selectedSlideName || '',
                statusMessage: slidesGroupStore.errorText || slidesStore.persistFailureMessage || '',
              }}
              config={{
                isSettingBusy:
                  slidesGroupStore.isSubmitting || slidesStore.isPersisting || !isSelectedSlideInGroup,
                isSlideDeleting: false,
                isDatabaseSwitcherVisible: false,
                isSlideSwitcherVisible: false,
                isDatabaseActionButtonsVisible: false,
                isSlideActionButtonsVisible: false,
                isPageArrowButtonsVisible: !isStackMode,
                isSaveButtonVisible: true,
                isStackModeToggleVisible: true,
                isStackMode,
              }}
              onEvent={async (event) => {
                switch (event.type) {
                  case 'switchSlide':
                    setSelectedSlideId(`${event.slideId ?? ''}`.trim());
                    return true;
                  case 'renameSlide':
                    await slidesGroupStore.requestRenameSlide(selectedSlideId, `${event.name ?? ''}`);
                    return true;
                  case 'createSlide': {
                    const createResult = await slidesStore.requestCreateSlide('Untitled');
                    if (!createResult?.ok) return true;
                    const createdSlideId = `${slidesStore.slideCurrentId ?? ''}`.trim();
                    if (!createdSlideId) return true;
                    const nextSlides = [...groupSlides, { slideId: createdSlideId, path: '' }];
                    const result = await slidesGroupStore.requestUpdateGroupSlides(groupId, nextSlides);
                    if (result?.ok) setSelectedSlideId(createdSlideId);
                    return true;
                  }
                  case 'deleteSlide':
                    return true;
                  case 'toggleStackMode':
                    setIsStackMode((prevValue) => !prevValue);
                    return true;
                  default:
                    return false;
                }
              }}
            />

            <div className="group-view-slide-head-line">
              <div className="group-view-slide-title">
                {selectedSlideName ? `slide: ${selectedSlideName}` : 'slide: -'}
              </div>
              <div className="group-view-slide-path">{selectedFolderPathText}</div>
            </div>

            <div className="group-view-slide-body">
              {!isSelectedSlideInGroup ? (
                <div className="group-view-empty">No slide in current group</div>
              ) : isSelectedSlideUnavailable ? (
                <div className="group-view-missing-slide-panel">
                  <div className="group-view-missing-slide-title">Slide not available</div>
                  <div className="group-view-missing-slide-message">
                    {selectedSlideUnavailableMessage}
                  </div>
                  <button
                    className="group-view-missing-slide-btn"
                    type="button"
                    disabled={slidesGroupStore.isSubmitting}
                    onClick={() => requestExcludeSlideFromGroup(selectedSlideId)}
                  >
                    Exclude from Group
                  </button>
                </div>
              ) : isStackMode ? (
                <div className="group-view-stack-wrap">
                  {pageIdsForStack.map((pageId) => {
                    const isCurrentPage = pageId === slidesStore.metadata?.currentPageId;
                    return (
                      <div
                        key={pageId}
                        className={`group-view-stack-page ${isCurrentPage ? 'is-current' : ''}`}
                        onClick={() => {
                          slidesStore.setCurrentPage(pageId);
                          slidesStore.clearSelectedContainer();
                        }}
                      >
                        <Page
                          pageId={pageId}
                          getComp={getComp}
                          isPrevEnabled={false}
                          isNextEnabled={false}
                          onGoPrev={() => {}}
                          onGoNext={() => {}}
                          onCreateNextPage={() => {}}
                          isFullWindow={false}
                          onToggleFullWindow={() => {}}
                          isEdgeNavVisible={false}
                          isFullWindowButtonVisible={false}
                          isPageResizeEnabled={false}
                          onPageSurfaceClick={() => {
                            slidesStore.setCurrentPage(pageId);
                            slidesStore.clearSelectedContainer();
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : currentPage ? (
                <Page
                  pageId={currentPage.id}
                  getComp={getComp}
                  isPrevEnabled={Boolean(slidesStore.getPrevPageData(currentPage.id))}
                  isNextEnabled={Boolean(slidesStore.getNextPageData(currentPage.id))}
                  onGoPrev={() => {
                    const prevValue = slidesStore.getPrevPageData(currentPage.id);
                    if (!prevValue) return;
                    slidesStore.setCurrentPage(prevValue.id);
                    slidesStore.clearSelectedContainer();
                  }}
                  onGoNext={() => {
                    const nextValue = slidesStore.getNextPageData(currentPage.id);
                    if (!nextValue) return;
                    slidesStore.setCurrentPage(nextValue.id);
                    slidesStore.clearSelectedContainer();
                  }}
                  onCreateNextPage={() => slidesStore.requestCreatePageAfterCurrent()}
                  isFullWindow={false}
                  onToggleFullWindow={() => {}}
                  isEdgeNavVisible={true}
                  isFullWindowButtonVisible={true}
                  isPageResizeEnabled={true}
                />
              ) : (
                <div className="group-view-empty">No page data</div>
              )}
            </div>

            {slidesGroupStore.errorText ? (
              <div className="group-view-error-line">{slidesGroupStore.errorText}</div>
            ) : null}
          </div>
        </div>

        {pathChangeState ? (
          <PanelPopup
            type="input"
            title="Change Folder Path"
            message="input folder path for selected slide"
            confirmText="Save"
            cancelText="Cancel"
            inputProps={{
              placeholder: '/aa/bb/',
              defaultValue: getFolderPathText(pathChangeState.path ?? ''),
              required: false,
            }}
            onCancel={() => setPathChangeState(null)}
            onConfirm={async (inputValue) => {
              const folderPath = normalizeFolderPath(`${inputValue ?? ''}`);
              const nextSlides = groupSlides.map((slideItem) => {
                const slideId = `${slideItem?.slideId ?? ''}`.trim();
                if (slideId !== `${pathChangeState.slideId ?? ''}`.trim()) return slideItem;
                return {
                  ...slideItem,
                  path: folderPath,
                };
              });
              const result = await slidesGroupStore.requestUpdateGroupSlides(groupId, nextSlides);
              if (result?.ok) {
                setPathChangeState(null);
                setSelectedSlideId(`${pathChangeState.slideId ?? ''}`.trim());
              }
            }}
            isLoading={slidesGroupStore.isSubmitting}
          />
        ) : null}
      </div>
    </SlideStoreProvider>
  );
});

export default GroupViewPage;
