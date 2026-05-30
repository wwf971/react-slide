import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Menu, SpinningCircle, TreeView } from '@wwf971/react-comp-misc';
import './SlideSingleTreeView.css';

const KIND_LABEL_BY_KIND = {
  slide: 'slide',
  page: 'page',
  container: 'container',
  comp: 'comp',
  resource: 'resource',
};

const PAGE_RENAME_TIMEOUT_MS = 12000;

const requestWithTimeout = async (request: Promise<any>, timeoutMs: number) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      request,
      new Promise((resolve) => {
        timeoutId = setTimeout(() => {
          resolve({ ok: false, isTimedOut: true, message: 'Rename timed out' });
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const SlideSingleTreeItem = ({
  itemData,
  editingPageId,
  renameDraftText,
  renameErrorMessage,
  isRenameSubmitting,
  onRenameDraftTextChange,
  onRenameCommit,
  onRenameCancel,
}: any) => {
  const editorRef = useRef<any>(null);
  const isSkippingBlurCommitRef = useRef(false);
  const isComposingRef = useRef(false);
  const kindText = KIND_LABEL_BY_KIND[itemData?.kind] ?? `${itemData?.kind ?? ''}`;
  const isCurrentPage = itemData?.isCurrentPage === true;
  const isPageItem = `${itemData?.kind ?? ''}` === 'page';
  const pageId = `${itemData?.pageId ?? ''}`.trim();
  const isPageRenaming = isPageItem && editingPageId === pageId;
  const pageIndex = Number(itemData?.pageIndex ?? 0);
  const pagePrefixText = pageIndex > 0 ? `Page ${pageIndex}` : 'Page';

  useEffect(() => {
    if (!isPageRenaming) return;
    const element = editorRef.current;
    if (!element) return;
    element.textContent = renameDraftText;
    element.focus();
    const selection = window.getSelection?.();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [isPageRenaming, pageId]);

  const requestCommit = () => {
    if (!isPageRenaming || isRenameSubmitting) return;
    if (isComposingRef.current) return;
    onRenameCommit?.();
  };

  return (
    <div className={`slide-tree-item-content ${isCurrentPage ? 'is-current-page' : ''} ${isRenameSubmitting ? 'is-rename-submitting' : ''}`}>
      <span className={`slide-tree-item-kind is-${itemData?.kind ?? 'unknown'}`}>{kindText}</span>
      {isPageRenaming ? (
        <span className="slide-tree-page-rename-wrap">
          <span className="slide-tree-page-prefix">{pagePrefixText}</span>
          <span className="slide-tree-page-name-open">(</span>
          <span
            ref={editorRef}
            className="slide-tree-page-name-editor"
            contentEditable={!isRenameSubmitting}
            role="textbox"
            aria-label="Page name"
            suppressContentEditableWarning
            onClick={(event) => {
              event.stopPropagation();
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
            }}
            onInput={(event) => {
              const nextText = `${event.currentTarget.textContent ?? ''}`.replace(/[\r\n]+/g, ' ');
              onRenameDraftTextChange?.(nextText);
            }}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={(event) => {
              isComposingRef.current = false;
              const nextText = `${event.currentTarget.textContent ?? ''}`.replace(/[\r\n]+/g, ' ');
              onRenameDraftTextChange?.(nextText);
            }}
            onKeyDown={(event) => {
              const isComposing = isComposingRef.current || event.nativeEvent?.isComposing === true;
              if (isComposing) return;
              if (event.key === 'Enter') {
                event.preventDefault();
                requestCommit();
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                isSkippingBlurCommitRef.current = true;
                onRenameCancel?.();
              }
            }}
            onBlur={() => {
              if (isComposingRef.current) return;
              if (isSkippingBlurCommitRef.current) {
                isSkippingBlurCommitRef.current = false;
                return;
              }
              requestCommit();
            }}
          />
          <span className="slide-tree-page-name-close">)</span>
        </span>
      ) : (
        <span className="slide-tree-item-text">{itemData?.text ?? itemData?.id ?? ''}</span>
      )}
      {isRenameSubmitting ? (
        <span className="slide-tree-rename-spinner">
          <SpinningCircle width={12} height={12} color="#4f6685" />
        </span>
      ) : null}
      {renameErrorMessage ? (
        <span className="slide-tree-rename-error">{renameErrorMessage}</span>
      ) : null}
    </div>
  );
};

const SlideSingleTreeView = observer(({ store }: any) => {
  const slideId = `${store?.slideCurrentId ?? ''}`.trim();
  const treeData = store.getSlideTreeData(slideId);
  const [pageMenuState, setPageMenuState] = useState<any>(null);
  const [editingPageId, setEditingPageId] = useState('');
  const [renameDraftText, setRenameDraftText] = useState('');
  const [submittingPageId, setSubmittingPageId] = useState('');
  const [renameErrorState, setRenameErrorState] = useState<any>(null);

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

  const requestStartRename = (pageId: string) => {
    const pageData = store.getPageData(pageId);
    if (!pageData) return;
    setEditingPageId(pageId);
    setRenameDraftText(`${pageData?.name ?? ''}`.trim());
    setRenameErrorState(null);
  };

  const requestCancelRename = () => {
    if (submittingPageId) return;
    setEditingPageId('');
    setRenameDraftText('');
    setRenameErrorState(null);
  };

  const requestCommitRename = async () => {
    const pageId = `${editingPageId ?? ''}`.trim();
    if (!pageId || submittingPageId) return;
    setSubmittingPageId(pageId);
    setRenameErrorState(null);
    const result = await requestWithTimeout(
      Promise.resolve(store.requestRenamePage(pageId, renameDraftText)),
      PAGE_RENAME_TIMEOUT_MS,
    );
    setSubmittingPageId('');
    if (!result?.ok) {
      setRenameErrorState({
        pageId,
        message: result?.isTimedOut ? 'Rename timed out' : (result?.message ?? 'Rename failed'),
      });
      return;
    }
    setEditingPageId('');
    setRenameDraftText('');
    setRenameErrorState(null);
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
          getItemComp={() => (props: any) => (
            <SlideSingleTreeItem
              {...props}
              editingPageId={editingPageId}
              renameDraftText={renameDraftText}
              renameErrorMessage={
                renameErrorState?.pageId === `${props?.itemData?.pageId ?? ''}`.trim()
                  ? renameErrorState.message
                  : ''
              }
              isRenameSubmitting={Boolean(submittingPageId)
                && submittingPageId === `${props?.itemData?.pageId ?? ''}`.trim()}
              onRenameDraftTextChange={setRenameDraftText}
              onRenameCommit={requestCommitRename}
              onRenameCancel={requestCancelRename}
            />
          )}
          getItemRowClassName={(itemData: any) => {
            const pageId = `${itemData?.pageId ?? ''}`.trim();
            const classNames = [];
            if (itemData?.isCurrentPage === true) classNames.push('is-current-page');
            if (editingPageId && editingPageId === pageId) classNames.push('is-page-renaming');
            if (submittingPageId && submittingPageId === pageId) classNames.push('is-page-rename-submitting');
            return classNames.join(' ');
          }}
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
          onItemContextMenu={async (_itemId: string, itemData: any, event: any) => {
            if (`${itemData?.kind ?? ''}` !== 'page') return;
            const pageId = `${itemData?.pageId ?? ''}`.trim();
            if (!pageId) return;
            setPageMenuState({
              pageId,
              x: event.clientX,
              y: event.clientY,
            });
          }}
        />
        {pageMenuState ? (
          <Menu
            data={{
              items: [
                {
                  id: 'rename-page',
                  label: 'Rename',
                  data: {
                    action: 'rename-page',
                    pageId: pageMenuState.pageId,
                  },
                },
              ],
              position: {
                x: pageMenuState.x,
                y: pageMenuState.y,
              },
            }}
            onEvent={(eventType: string, eventData: any) => {
              if (eventType === 'close' || eventType === 'backdropContextMenu') {
                setPageMenuState(null);
                return;
              }
              if (eventType !== 'itemClick') return;
              const action = `${eventData?.item?.data?.action ?? ''}`;
              const pageId = `${eventData?.item?.data?.pageId ?? ''}`.trim();
              setPageMenuState(null);
              if (action === 'rename-page' && pageId) {
                requestStartRename(pageId);
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
});

export default SlideSingleTreeView;
