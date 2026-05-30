import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { FolderView, Menu, PanelPopup } from '@wwf971/react-comp-misc';
import { useNavigate } from 'react-router-dom';
import SlideOverallHeader from './SlideOverallHeader';
import SlideOverallNameCell from './SlideOverallNameCell';
import './SlideOverallView.css';

const SlideOverallView = observer(({
  slidesStore,
  slidesGroupStore,
  backendStore = null,
  onEndpointSwitchStart,
}) => {
  const navigate = useNavigate();
  const [isCreatePopupVisible, setIsCreatePopupVisible] = useState(false);
  const [isDeletePopupVisible, setIsDeletePopupVisible] = useState(false);
  const [orphanMenuState, setOrphanMenuState] = useState(null);
  const isEndpointSwitching = backendStore?.isDatabaseSwitching === true;

  useEffect(() => {
    slidesGroupStore.requestLoadOverview();
  }, [slidesGroupStore]);

  const orphanMissingSlideIdMap = useMemo(() => {
    const output = {};
    (slidesGroupStore.orphanSlideItems ?? []).forEach((slideItem) => {
      const slideId = `${slideItem?.id ?? ''}`.trim();
      if (!slideId) return;
      if (Object.prototype.hasOwnProperty.call(slidesGroupStore.slideNameById ?? {}, slideId)) return;
      output[slideId] = true;
    });
    return output;
  }, [slidesGroupStore.orphanSlideItems, slidesGroupStore.slideNameById]);

  const orphanRows = useMemo(() => {
    return (slidesGroupStore.orphanSlideItems ?? []).map((slideItem) => ({
      id: slideItem.id,
      data: {
        name: slideItem.name || slideItem.id,
        slideId: slideItem.id,
        isMissing: orphanMissingSlideIdMap[`${slideItem?.id ?? ''}`.trim()] === true,
      },
    }));
  }, [slidesGroupStore.orphanSlideItems, orphanMissingSlideIdMap]);

  const groupRows = useMemo(() => {
    return (slidesGroupStore.groupItems ?? []).map((groupItem) => ({
      id: groupItem.id,
      data: {
        name: groupItem.name || groupItem.id,
        slideNum: `${Number(groupItem.slideNum ?? 0)}`,
        groupId: groupItem.id,
      },
    }));
  }, [slidesGroupStore.groupItems]);

  const selectedGroupId = `${slidesGroupStore.overviewGroupIdSelected ?? ''}`.trim();
  const isNameEditable = !slidesGroupStore.isOverviewLoading
    && !slidesGroupStore.isSubmitting
    && !isEndpointSwitching;
  const isOrphanSlideCreating = slidesStore?.isPersisting
    || slidesStore?.isSlideSwitching
    || slidesGroupStore.isOverviewLoading
    || isEndpointSwitching;

  const renderNameCell = ({ data, rowId, isMissing = false, onRename }) => {
    return (
      <SlideOverallNameCell
        name={`${data ?? ''}`}
        rowId={`${rowId ?? ''}`.trim()}
        isEditable={isNameEditable}
        isMissing={isMissing}
        onRename={onRename}
      />
    );
  };

  return (
    <div className="slides-overview-root">
      <div className="slides-overview-main">
        <SlideOverallHeader
          slidesGroupStore={slidesGroupStore}
          backendStore={backendStore}
          onEndpointSwitchStart={onEndpointSwitchStart}
        />
        <div className="slides-overview-block">
          <div className="slides-overview-title-line">Orphan Slides</div>
          <div
            className="slides-overview-folder-wrap"
            onContextMenu={(event) => {
              event.preventDefault();
              setOrphanMenuState({
                x: event.clientX,
                y: event.clientY,
                slideId: '',
              });
            }}
          >
            <FolderView
              key={`orphan-${slidesGroupStore.overviewDataVersion}`}
              columns={{
                name: { data: 'name', align: 'left' },
                slideId: { data: 'slideId', align: 'left' },
              }}
              columnsOrder={['name', 'slideId']}
              columnsSizeInit={{
                name: { width: 300, minWidth: 140, resizable: true },
                slideId: { width: 220, minWidth: 120, resizable: true },
              }}
              rows={orphanRows}
              listOnly={true}
              bodyHeight={220}
              showStatusBar={false}
              loading={slidesGroupStore.isOverviewLoading}
              loadingMessage="loading orphan slides"
              getBodyComponent={(columnId) => {
                if (columnId !== 'name') return null;
                return ({ data, rowId }) => {
                  const slideId = `${rowId ?? ''}`.trim();
                  const isMissing = orphanMissingSlideIdMap[slideId] === true;
                  return renderNameCell({
                    data,
                    rowId: slideId,
                    isMissing,
                    onRename: async (nextName) => {
                      const result = await slidesGroupStore.requestRenameSlide(slideId, nextName);
                      return {
                        ok: result?.ok,
                        message: result?.ok ? '' : (`${slidesGroupStore.errorText ?? ''}`.trim() || 'rename failed'),
                      };
                    },
                  });
                };
              }}
              onRowContextMenu={(event, rowId) => {
                const slideId = `${rowId ?? ''}`.trim();
                if (!slideId) return;
                event.preventDefault();
                event.stopPropagation();
                setOrphanMenuState({
                  x: event.clientX,
                  y: event.clientY,
                  slideId,
                });
              }}
              onRowDoubleClick={(slideId) => {
                if (!slideId) return;
                navigate(`/slide?slideId=${encodeURIComponent(slideId)}`);
              }}
            />
          </div>
        </div>

        <div className="slides-overview-block">
          <div className="slides-overview-title-line">Slide Groups</div>
          <div className="slides-overview-button-line">
            <button
              className="slides-overview-btn"
              type="button"
              disabled={slidesGroupStore.isSubmitting || isEndpointSwitching}
              onClick={() => {
                setIsCreatePopupVisible(true);
              }}
            >
              Create Group
            </button>
            <button
              className="slides-overview-btn"
              type="button"
              disabled={!selectedGroupId || slidesGroupStore.isSubmitting || isEndpointSwitching}
              onClick={() => {
                setIsDeletePopupVisible(true);
              }}
            >
              Delete Group
            </button>
            <button
              className="slides-overview-btn"
              type="button"
              disabled={slidesGroupStore.isOverviewLoading || isEndpointSwitching}
              onClick={() => {
                slidesGroupStore.requestLoadOverview();
              }}
            >
              Refresh
            </button>
          </div>
          <FolderView
            key={`group-${slidesGroupStore.overviewDataVersion}`}
            columns={{
              name: { data: 'name', align: 'left' },
              slideNum: { data: 'slideNum', align: 'left' },
              groupId: { data: 'groupId', align: 'left' },
            }}
            columnsOrder={['name', 'slideNum', 'groupId']}
            columnsSizeInit={{
              name: { width: 300, minWidth: 150, resizable: true },
              slideNum: { width: 120, minWidth: 80, resizable: true },
              groupId: { width: 220, minWidth: 120, resizable: true },
            }}
            rows={groupRows}
            selectedRowIds={selectedGroupId ? [selectedGroupId] : []}
            onSelectedRowIdsChange={(nextGroupIds) => {
              slidesGroupStore.setSelectedOverviewGroup(nextGroupIds?.[0] ?? '');
            }}
            selectionMode="single"
            showStatusBar={false}
            bodyHeight={220}
            loading={slidesGroupStore.isOverviewLoading}
            loadingMessage="loading slide groups"
            getBodyComponent={(columnId) => {
              if (columnId !== 'name') return null;
              return ({ data, rowId }) => {
                const groupId = `${rowId ?? ''}`.trim();
                return renderNameCell({
                  data,
                  rowId: groupId,
                  onRename: async (nextName) => {
                    const result = await slidesGroupStore.requestRenameGroup(groupId, nextName);
                    return {
                      ok: result?.ok,
                      message: result?.ok ? '' : (`${slidesGroupStore.errorText ?? ''}`.trim() || 'rename failed'),
                    };
                  },
                });
              };
            }}
            onRowDoubleClick={(groupId) => {
              if (!groupId) return;
              navigate(`/group?groupId=${encodeURIComponent(groupId)}`);
            }}
          />
        </div>

        {slidesGroupStore.errorText ? (
          <div className="slides-overview-error-line">{slidesGroupStore.errorText}</div>
        ) : null}
      </div>

      {isCreatePopupVisible ? (
        <PanelPopup
          type="input"
          title="Create Group"
          message="input group name"
          confirmText="Create"
          cancelText="Cancel"
          inputProps={{
            placeholder: 'group name',
            defaultValue: '',
            required: true,
          }}
          onCancel={() => {
            setIsCreatePopupVisible(false);
          }}
          onConfirm={async (inputValue) => {
            const result = await slidesGroupStore.requestCreateGroup(`${inputValue ?? ''}`);
            if (result?.ok) {
              setIsCreatePopupVisible(false);
            }
          }}
          isLoading={slidesGroupStore.isSubmitting}
        />
      ) : null}

      {isDeletePopupVisible ? (
        <PanelPopup
          type="confirm"
          title="Delete Group"
          message="delete selected slide-group? slides will become orphan"
          confirmText="Delete"
          cancelText="Cancel"
          isDanger={true}
          onCancel={() => {
            setIsDeletePopupVisible(false);
          }}
          onConfirm={async () => {
            const result = await slidesGroupStore.requestDeleteGroup(selectedGroupId);
            if (result?.ok) {
              setIsDeletePopupVisible(false);
            }
          }}
          isLoading={slidesGroupStore.isSubmitting}
        />
      ) : null}

      {orphanMenuState ? (
        <Menu
          data={{
            items: [
              { id: 'create-orphan-slide', label: 'New Orphan Slide', data: { action: 'create-orphan-slide' } },
              ...(orphanMenuState.slideId
                ? [{ id: 'delete-orphan-slide', label: 'Delete', data: { action: 'delete-orphan-slide' } }]
                : []),
            ],
            position: { x: orphanMenuState.x, y: orphanMenuState.y },
          }}
          onEvent={async (eventType, eventData) => {
            if (eventType === 'close') {
              setOrphanMenuState(null);
              return;
            }
            if (eventType !== 'itemClick') return;
            const item = eventData.item;
            const action = item?.data?.action;
            const slideId = `${orphanMenuState?.slideId ?? ''}`.trim();
            setOrphanMenuState(null);
            if (action === 'create-orphan-slide') {
              if (isOrphanSlideCreating) return;
              const result = await slidesStore?.requestCreateSlide?.('Untitled');
              if (result?.ok) await slidesGroupStore.requestLoadOverview();
              return;
            }
            if (action === 'delete-orphan-slide' && slideId) {
              await slidesGroupStore.requestDeleteSlide(slideId);
            }
          }}
        />
      ) : null}
    </div>
  );
});

export default SlideOverallView;
