import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { TreeView } from '@wwf971/react-comp-misc';
import './SlideSingleTreeView.css';

const KIND_LABEL_BY_KIND = {
  slide: 'slide',
  page: 'page',
  container: 'container',
  comp: 'comp',
  resource: 'resource',
};

const SlideSingleTreeItem = ({ itemData }: any) => {
  const kindText = KIND_LABEL_BY_KIND[itemData?.kind] ?? `${itemData?.kind ?? ''}`;
  const isCurrentPage = itemData?.isCurrentPage === true;
  return (
    <div className={`slide-tree-item-content ${isCurrentPage ? 'is-current-page' : ''}`}>
      <span className={`slide-tree-item-kind is-${itemData?.kind ?? 'unknown'}`}>{kindText}</span>
      <span className="slide-tree-item-text">{itemData?.text ?? itemData?.id ?? ''}</span>
    </div>
  );
};

const SlideSingleTreeView = observer(({ store }: any) => {
  const slideId = `${store?.slideCurrentId ?? ''}`.trim();
  const treeData = store.getSlideTreeData(slideId);

  useEffect(() => {
    if (!store?.selectedContainerId) return;
    store.expandSlideTreePathToContainer(store.selectedContainerId);
  }, [store, store?.selectedContainerId, slideId]);

  const requestSelectItem = (itemData: any) => {
    const kind = `${itemData?.kind ?? ''}`;
    const pageId = `${itemData?.pageId ?? ''}`.trim();
    const containerId = `${itemData?.containerId ?? ''}`.trim();
    if (kind === 'page') {
      return;
    }
    if (kind === 'container' || kind === 'comp' || kind === 'resource') {
      if (pageId) store.setCurrentPage(pageId);
      if (containerId) store.setSelectedContainer(containerId);
    }
  };

  return (
    <div className="slide-tree-root">
      <div className="slide-tree-title">Slide Resources</div>
      <div className="slide-tree-body">
        <TreeView
          className="slide-tree-view"
          rootItemIds={treeData.rootItemIds}
          getItemDataById={(itemId: string) => treeData.itemDataById[itemId] ?? null}
          selectedItemId={treeData.selectedItemId}
          getItemComp={() => SlideSingleTreeItem}
          indentPx={8}
          onDataChangeRequest={async (type: string, params: any) => {
            const itemId = `${params?.itemId ?? ''}`.trim();
            if (!itemId) return { code: -1 };
            if (type === 'toggle-expand') {
              store.setSlideTreeItemExpanded(slideId, itemId, params?.nextIsExpanded === true);
              return { code: 0 };
            }
            return { code: 0 };
          }}
          onItemClick={async (_itemId: string, itemData: any) => {
            requestSelectItem(itemData);
          }}
          onItemDoubleClick={async (_itemId: string, itemData: any) => {
            if (`${itemData?.kind ?? ''}` !== 'page') return;
            const pageId = `${itemData?.pageId ?? ''}`.trim();
            if (!pageId) return;
            store.setCurrentPage(pageId);
            store.clearSelectedContainer();
          }}
        />
      </div>
    </div>
  );
});

export default SlideSingleTreeView;
