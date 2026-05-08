import { useMemo, useState } from 'react';
import { FolderIcon, InfoIconWithTooltip, Menu, TreeView } from '@wwf971/react-comp-misc';
import { normalizeFolderPath, normalizePermanentFolderPath } from './groupViewTreeUtils';

const toTreeData = (groupData, slideNameById, expandedFolderById) => {
  const itemById = {};
  const childrenById = {};
  const rootIds = [];
  const persistentFolderPathSet = {};
  const folderPathListRaw = Array.isArray(groupData?.folderPaths) ? groupData.folderPaths : [];

  const ensureFolder = (folderPath, isPersistingSelf = false) => {
    const normalizedFolderPath = normalizeFolderPath(folderPath);
    if (!normalizedFolderPath) return '';
    const folderId = `folder:${normalizedFolderPath}`;
    const pathSegmentList = normalizedFolderPath.split('/').filter(Boolean);
    const folderName = pathSegmentList[pathSegmentList.length - 1] ?? normalizedFolderPath;
    if (!itemById[folderId]) {
      itemById[folderId] = {
        id: folderId,
        text: folderName,
        path: normalizedFolderPath,
        nodeType: 'folder',
        isLeaf: false,
        childrenIds: [],
        isExpanded: expandedFolderById[folderId] !== false,
        isPersistingSelf: false,
        isStableByDescendant: false,
        isSlideDescendant: false,
      };
      childrenById[folderId] = [];
    }
    if (isPersistingSelf) {
      itemById[folderId].isPersistingSelf = true;
    }
    return folderId;
  };

  const ensureFolderChain = (folderPath, isTargetPersisting = false) => {
    const normalizedFolderPath = normalizeFolderPath(folderPath);
    if (!normalizedFolderPath) return '';
    const segmentList = normalizedFolderPath.split('/').filter(Boolean);
    let parentFolderId = '';
    segmentList.forEach((segment, index) => {
      const subPath = segmentList.slice(0, index + 1).join('/');
      const folderId = ensureFolder(subPath, isTargetPersisting && index === segmentList.length - 1);
      if (parentFolderId) {
        if (!childrenById[parentFolderId]) childrenById[parentFolderId] = [];
        if (!childrenById[parentFolderId].includes(folderId)) childrenById[parentFolderId].push(folderId);
      } else if (!rootIds.includes(folderId)) {
        rootIds.push(folderId);
      }
      parentFolderId = folderId;
    });
    return parentFolderId;
  };

  folderPathListRaw.forEach((folderPathRaw) => {
    const permanentFolderPath = normalizePermanentFolderPath(folderPathRaw);
    if (!permanentFolderPath) return;
    persistentFolderPathSet[permanentFolderPath] = true;
    ensureFolderChain(permanentFolderPath, true);
  });

  (groupData?.slides ?? []).forEach((slideItem) => {
    const slideId = `${slideItem?.slideId ?? ''}`.trim();
    if (!slideId) return;
    const folderPath = normalizeFolderPath(slideItem?.path ?? '');
    const folderNodeId = folderPath ? ensureFolderChain(folderPath, false) : '';
    const slideNodeId = `slide:${slideId}`;
    itemById[slideNodeId] = {
      id: slideNodeId,
      text: `${slideNameById?.[slideId] ?? ''}`.trim() || slideId,
      nodeType: 'slide',
      slideId,
      path: folderPath,
      isLeaf: true,
      childrenIds: [],
      isExpanded: false,
    };
    if (folderNodeId) {
      if (!childrenById[folderNodeId]) childrenById[folderNodeId] = [];
      childrenById[folderNodeId].push(slideNodeId);
    } else if (!rootIds.includes(slideNodeId)) {
      rootIds.push(slideNodeId);
    }
  });

  const sortedChildIdsById = {};
  Object.keys(childrenById).forEach((nodeId) => {
    sortedChildIdsById[nodeId] = [...childrenById[nodeId]].sort((childAId, childBId) => {
      const childA = itemById[childAId];
      const childB = itemById[childBId];
      const typeScoreA = childA?.nodeType === 'folder' ? 0 : 1;
      const typeScoreB = childB?.nodeType === 'folder' ? 0 : 1;
      if (typeScoreA !== typeScoreB) return typeScoreA - typeScoreB;
      return `${childA?.text ?? ''}`.localeCompare(`${childB?.text ?? ''}`);
    });
  });

  const folderStateById = {};
  const resolveFolderState = (folderId) => {
    if (folderStateById[folderId]) return folderStateById[folderId];
    const folderNode = itemById[folderId];
    const childIds = sortedChildIdsById[folderId] ?? [];
    let isStableByDescendant = false;
    let isSlideDescendant = false;
    childIds.forEach((childId) => {
      const childNode = itemById[childId];
      if (!childNode) return;
      if (childNode.nodeType === 'slide') {
        isSlideDescendant = true;
        return;
      }
      if (childNode.nodeType === 'folder') {
        const childState = resolveFolderState(childId);
        if (childState.isStable) isStableByDescendant = true;
        if (childState.isSlideDescendant) isSlideDescendant = true;
      }
    });
    const isStable = Boolean(folderNode?.isPersistingSelf) || isStableByDescendant;
    const state = { isStable, isStableByDescendant, isSlideDescendant };
    folderStateById[folderId] = state;
    return state;
  };

  Object.keys(itemById).forEach((itemId) => {
    const itemData = itemById[itemId];
    if (itemData.nodeType !== 'folder') return;
    const folderState = resolveFolderState(itemId);
    itemById[itemId] = {
      ...itemData,
      childrenIds: sortedChildIdsById[itemId] ?? [],
      isStableByDescendant: folderState.isStableByDescendant,
      isSlideDescendant: folderState.isSlideDescendant,
      isStable: folderState.isStable,
    };
  });

  return {
    rootItemIds: rootIds.sort((itemAId, itemBId) => {
      const itemA = itemById[itemAId];
      const itemB = itemById[itemBId];
      const typeScoreA = itemA?.nodeType === 'folder' ? 0 : 1;
      const typeScoreB = itemB?.nodeType === 'folder' ? 0 : 1;
      if (typeScoreA !== typeScoreB) return typeScoreA - typeScoreB;
      return `${itemA?.text ?? ''}`.localeCompare(`${itemB?.text ?? ''}`);
    }),
    itemById,
    persistentFolderPathSet,
  };
};

const GroupViewObjectTree = ({
  groupData,
  slideNameById,
  selectedSlideId,
  onSelectSlide,
  onRequestCreateSlideUnderFolder,
  onRequestDeleteSlide,
  onRequestChangeSlidePath,
  onRequestSetFolderPersisting,
  onRequestCancelFolderPersisting,
}) => {
  const [expandedFolderById, setExpandedFolderById] = useState({});
  const [menuState, setMenuState] = useState(null);
  const selectedTreeItemId = selectedSlideId ? `slide:${selectedSlideId}` : '';

  const treeData = useMemo(() => {
    return toTreeData(groupData, slideNameById, expandedFolderById);
  }, [groupData, slideNameById, expandedFolderById]);

  const openContextMenuAt = (x, y, nextMenuState) => {
    setMenuState(null);
    requestAnimationFrame(() => {
      setMenuState({
        x,
        y,
        ...nextMenuState,
      });
    });
  };

  return (
    <div
      className="group-view-left"
      data-group-view-left="true"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openContextMenuAt(event.clientX, event.clientY, {
          menuType: 'empty-tree',
        });
      }}
    >
      <div className="group-view-tree-wrap" data-group-view-tree-wrap="true">
        <TreeView
          rootItemIds={treeData.rootItemIds}
          getItemDataById={(itemId) => treeData.itemById[itemId]}
          selectedItemId={selectedTreeItemId}
          isToggleExpandOnItemClick={true}
          onDataChangeRequest={async (type, params) => {
            if (type !== 'toggle-expand') return { code: 0 };
            const itemId = `${params?.itemId ?? ''}`.trim();
            const nextIsExpanded = params?.nextIsExpanded === true;
            setExpandedFolderById((prevValue) => ({
              ...prevValue,
              [itemId]: nextIsExpanded,
            }));
            return { code: 0 };
          }}
          onItemClick={async (_itemId, itemData) => {
            if (itemData?.nodeType !== 'slide') return;
            const slideId = `${itemData?.slideId ?? ''}`.trim();
            if (!slideId) return;
            onSelectSlide(slideId);
          }}
          getItemComp={(itemData) => {
            if (itemData?.nodeType === 'slide') {
              return ({ itemData: nodeData }) => (
                <div
                  className="group-view-tree-item-slide"
                  data-tree-node-type="slide"
                  data-slide-id={`${nodeData?.slideId ?? ''}`.trim()}
                  data-path={`${nodeData?.path ?? ''}`.trim()}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const slideId = `${nodeData?.slideId ?? ''}`.trim();
                    if (slideId) onSelectSlide(slideId);
                    openContextMenuAt(event.clientX, event.clientY, {
                      slideId,
                      path: `${nodeData?.path ?? ''}`.trim(),
                      menuType: 'slide',
                    });
                  }}
                >
                  {`${nodeData?.text ?? ''}`.trim()}
                </div>
              );
            }
            return ({ itemData: nodeData }) => (
              <div
                className="group-view-tree-item-folder"
                data-tree-node-type="folder"
                data-path={`${nodeData?.path ?? ''}`.trim()}
                data-is-persisting-self={nodeData?.isPersistingSelf ? '1' : '0'}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openContextMenuAt(event.clientX, event.clientY, {
                    path: `${nodeData?.path ?? ''}`.trim(),
                    menuType: 'folder',
                    isPersistingSelf: nodeData?.isPersistingSelf === true,
                  });
                }}
              >
                <span className="group-view-tree-item-folder-icon">
                  <FolderIcon width={14} height={14} />
                </span>
                <span>{`${nodeData?.text ?? ''}`.trim()}</span>
              </div>
            );
          }}
        />
      </div>

      {menuState ? (
        <Menu
          items={(() => {
            if (menuState.menuType === 'empty-tree') {
              return [{ type: 'item', name: 'New Slide At Root', data: { action: 'create-empty-slide' } }];
            }
            if (menuState.menuType === 'folder') {
              const persistActionItem = menuState.isPersistingSelf
                ? { type: 'item', name: 'Cancel Persisting', data: { action: 'cancel-persisting-folder' } }
                : {
                  type: 'item',
                  name: (
                    <span className="group-view-tree-menu-info">
                      <span>Set Persisting</span>
                      <InfoIconWithTooltip
                        tooltipText="Persisting folder remains in tree even when no slides exist under this path."
                        width={12}
                        height={12}
                      />
                    </span>
                  ),
                  data: { action: 'set-persisting-folder' },
                };
              return [
                { type: 'item', name: 'New Slide', data: { action: 'create-under-folder' } },
                persistActionItem,
              ];
            }
            return [
              { type: 'item', name: 'Delete Slide', data: { action: 'delete-slide' } },
              { type: 'item', name: 'Change Path', data: { action: 'change-path' } },
            ];
          })()}
          position={{ x: menuState.x, y: menuState.y }}
          onClose={() => setMenuState(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const backdropElement = event.currentTarget;
            backdropElement.style.pointerEvents = 'none';
            const clickedElement = document.elementFromPoint(event.clientX, event.clientY);
            backdropElement.style.pointerEvents = '';

            const slideElement = clickedElement?.closest?.('[data-tree-node-type="slide"]');
            if (slideElement) {
              const slideId = `${slideElement.getAttribute('data-slide-id') ?? ''}`.trim();
              const path = `${slideElement.getAttribute('data-path') ?? ''}`.trim();
              if (slideId) onSelectSlide(slideId);
              openContextMenuAt(event.clientX, event.clientY, {
                slideId,
                path,
                menuType: 'slide',
              });
              return;
            }

            const folderElement = clickedElement?.closest?.('[data-tree-node-type="folder"]');
            if (folderElement) {
              const path = `${folderElement.getAttribute('data-path') ?? ''}`.trim();
              const isPersistingSelf = `${folderElement.getAttribute('data-is-persisting-self') ?? ''}` === '1';
              openContextMenuAt(event.clientX, event.clientY, {
                path,
                menuType: 'folder',
                isPersistingSelf,
              });
              return;
            }

            const inLeftTreePanel = Boolean(clickedElement?.closest?.('[data-group-view-left="true"]'));
            if (inLeftTreePanel) {
              openContextMenuAt(event.clientX, event.clientY, {
                menuType: 'empty-tree',
              });
              return;
            }
            setMenuState(null);
          }}
          onItemClick={(item) => {
            if (item?.data?.action === 'create-empty-slide') {
              onRequestCreateSlideUnderFolder('');
              setMenuState(null);
              return;
            }
            if (item?.data?.action === 'create-under-folder') {
              onRequestCreateSlideUnderFolder(`${menuState?.path ?? ''}`);
              setMenuState(null);
              return;
            }
            if (item?.data?.action === 'set-persisting-folder') {
              onRequestSetFolderPersisting(normalizeFolderPath(`${menuState?.path ?? ''}`));
              setMenuState(null);
              return;
            }
            if (item?.data?.action === 'cancel-persisting-folder') {
              onRequestCancelFolderPersisting(normalizeFolderPath(`${menuState?.path ?? ''}`));
              setMenuState(null);
              return;
            }
            if (item?.data?.action === 'delete-slide') {
              onRequestDeleteSlide(`${menuState?.slideId ?? ''}`);
              setMenuState(null);
              return;
            }
            if (item?.data?.action === 'change-path') {
              onRequestChangeSlidePath(`${menuState?.slideId ?? ''}`, `${menuState?.path ?? ''}`);
              setMenuState(null);
            }
          }}
        />
      ) : null}
    </div>
  );
};

export default GroupViewObjectTree;
