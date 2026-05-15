import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { FolderView, Menu, PanelPopup } from '@wwf971/react-comp-misc';
import { useNavigate } from 'react-router-dom';
import './OverviewPage.css';

const OverviewPage = observer(({ slidesGroupStore }) => {
  const navigate = useNavigate();
  const [isCreatePopupVisible, setIsCreatePopupVisible] = useState(false);
  const [isDeletePopupVisible, setIsDeletePopupVisible] = useState(false);
  const [orphanMenuState, setOrphanMenuState] = useState(null);

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

  const selectedGroupId = `${slidesGroupStore.selectedOverviewGroupId ?? ''}`.trim();

  return (
    <div className="overview-page-root">
      <div className="overview-page-main">
        <div className="overview-page-block">
          <div className="overview-page-title-line">Orphan Slides</div>
          <FolderView
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
                const isMissing = orphanMissingSlideIdMap[`${rowId ?? ''}`.trim()] === true;
                return (
                  <div className="overview-page-orphan-name-cell">
                    <span>{`${data ?? ''}`}</span>
                    {isMissing ? (
                      <span className="overview-page-orphan-missing-mark" title="slide not found">!</span>
                    ) : null}
                  </div>
                );
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
              navigate(`/slide/${slideId}`);
            }}
          />
        </div>

        <div className="overview-page-block">
          <div className="overview-page-title-line">Slide Groups</div>
          <div className="overview-page-button-line">
            <button
              className="overview-page-btn"
              type="button"
              disabled={slidesGroupStore.isSubmitting}
              onClick={() => {
                setIsCreatePopupVisible(true);
              }}
            >
              Create Group
            </button>
            <button
              className="overview-page-btn"
              type="button"
              disabled={!selectedGroupId || slidesGroupStore.isSubmitting}
              onClick={() => {
                setIsDeletePopupVisible(true);
              }}
            >
              Delete Group
            </button>
            <button
              className="overview-page-btn"
              type="button"
              disabled={slidesGroupStore.isOverviewLoading}
              onClick={() => {
                slidesGroupStore.requestLoadOverview();
              }}
            >
              Refresh
            </button>
          </div>
          <FolderView
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
            onRowDoubleClick={(groupId) => {
              if (!groupId) return;
              navigate(`/group/${groupId}`);
            }}
          />
        </div>

        {slidesGroupStore.errorText ? (
          <div className="overview-page-error-line">{slidesGroupStore.errorText}</div>
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
          items={[
            { type: 'item', name: 'Delete', data: { action: 'delete-orphan-slide' } },
          ]}
          position={{ x: orphanMenuState.x, y: orphanMenuState.y }}
          onClose={() => setOrphanMenuState(null)}
          onItemClick={async (item) => {
            if (item?.data?.action !== 'delete-orphan-slide') return;
            const slideId = `${orphanMenuState?.slideId ?? ''}`.trim();
            setOrphanMenuState(null);
            if (!slideId) return;
            await slidesGroupStore.requestDeleteSlide(slideId);
          }}
        />
      ) : null}
    </div>
  );
});

export default OverviewPage;
