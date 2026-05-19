import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DownIcon, EndpointCard } from '@wwf971/react-comp-misc';
import './DbSwitcher.css';

const renderIcon = (IconComp: any, width: number, height: number) => {
  return React.createElement(IconComp, { width, height });
};

const DbSwitcher = ({
  data = {},
  config = {},
  onEvent,
}: {
  data?: any;
  config?: any;
  onEvent?: (eventType: string, eventData?: any) => void | Promise<void>;
}) => {
  const items = data?.items ?? [];
  const currentId = `${data?.currentId ?? ''}`.trim();
  const loadFailureMessage = `${data?.loadFailureMessage ?? ''}`.trim();
  const isSettingBusy = config?.isSettingBusy === true;
  const isLoading = config?.isLoading === true;
  const isSwitching = config?.isSwitching === true;
  const isTesting = config?.isTesting === true;
  const testingId = `${config?.testingId ?? ''}`.trim();
  const searchText = `${data?.searchText ?? ''}`.trim().toLowerCase();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [localSearchText, setLocalSearchText] = useState('');
  const [dropdownLayout, setDropdownLayout] = useState({
    left: 8,
    top: 8,
    width: 170,
    maxHeight: 240,
  });
  const rootRef = useRef<any>(null);
  const dropdownRef = useRef<any>(null);
  const searchInputRef = useRef<any>(null);

  const effectiveSearchText = searchText || localSearchText.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    if (!effectiveSearchText) return items;
    return (items ?? []).filter((entry: any) => {
      const key = `${entry?.key ?? ''}`.toLowerCase();
      const label = `${entry?.label ?? ''}`.toLowerCase();
      const name = `${entry?.databaseName ?? ''}`.toLowerCase();
      return key.includes(effectiveSearchText) || label.includes(effectiveSearchText) || name.includes(effectiveSearchText);
    });
  }, [items, effectiveSearchText]);

  const currentItem = (items ?? []).find((entry: any) => entry?.key === currentId) ?? null;

  const updateDropdownLayout = () => {
    const rootElement = rootRef.current;
    if (!rootElement) return;
    const triggerRect = rootElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const horizontalPadding = 8;
    const desiredWidth = Math.min(420, Math.max(170, viewportWidth - horizontalPadding * 2));
    const width = Math.max(triggerRect.width, desiredWidth);
    const maxLeft = Math.max(horizontalPadding, viewportWidth - width - horizontalPadding);
    const left = Math.min(Math.max(triggerRect.left, horizontalPadding), maxLeft);
    const top = Math.max(horizontalPadding, triggerRect.bottom + 2);
    const maxHeight = Math.max(120, viewportHeight - top - horizontalPadding);
    setDropdownLayout({
      left,
      top,
      width,
      maxHeight,
    });
  };

  useEffect(() => {
    if (!isDropdownOpen) return undefined;
    const onPointerDown = (event: any) => {
      const rootElement = rootRef.current;
      const dropdownElement = dropdownRef.current;
      if (rootElement?.contains(event.target)) return;
      if (dropdownElement?.contains(event.target)) return;
      setIsDropdownOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!isDropdownOpen) return;
    updateDropdownLayout();
    const handleViewportChange = () => {
      updateDropdownLayout();
    };
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!isDropdownOpen) return;
    requestAnimationFrame(() => {
      const element = searchInputRef.current;
      if (!element) return;
      element.focus();
      element.select();
    });
  }, [isDropdownOpen]);

  const emitEvent = (eventType: string, eventData: any = {}) => {
    onEvent?.(eventType, eventData);
  };

  return (
    <div ref={rootRef} className="db-switch-root">
      <button
        className="db-switch-current-btn"
        type="button"
        disabled={isSettingBusy || isLoading || isSwitching}
        onClick={() => {
          setIsDropdownOpen((isOpen) => {
            const isNextOpen = !isOpen;
            if (isNextOpen) {
              setLocalSearchText('');
              emitEvent('openDropdown', {});
            } else {
              emitEvent('closeDropdown', {});
            }
            return isNextOpen;
          });
        }}
      >
        <span className="db-switch-current-name">
          {currentItem?.label ?? currentId ?? 'endpoint'}
        </span>
        <span className={`db-switch-status-dot ${currentItem?.isInError ? 'is-error' : ''}`} />
        <span className="db-switch-current-icon">{renderIcon(DownIcon, 10, 10)}</span>
      </button>
      {isDropdownOpen ? createPortal((
        <div
          ref={dropdownRef}
          className="db-switch-dropdown"
          style={{
            left: `${dropdownLayout.left}px`,
            top: `${dropdownLayout.top}px`,
            width: `${dropdownLayout.width}px`,
            maxHeight: `${dropdownLayout.maxHeight}px`,
          }}
        >
          <div className="db-switch-search-wrap">
            <input
              ref={searchInputRef}
              className="db-switch-search-input"
              value={localSearchText}
              onChange={(event) => {
                const nextSearchText = event.target.value;
                setLocalSearchText(nextSearchText);
                emitEvent('searchChange', { searchText: nextSearchText });
              }}
              placeholder="Search endpoint..."
            />
            <button
              className="db-switch-refresh-btn"
              type="button"
              disabled={isLoading || isSwitching}
              onClick={() => {
                emitEvent('refresh', {});
              }}
            >
              Refresh
            </button>
          </div>
          {loadFailureMessage ? <div className="db-switch-error">{loadFailureMessage}</div> : null}
          <div className="db-switch-dropdown-items">
            {filteredItems.length > 0 ? (
              filteredItems.map((entry: any) => {
                const isCurrent = entry.key === currentId;
                return (
                  <div key={entry.key} className={`db-switch-card-wrap ${isCurrent ? 'is-selected' : ''} ${entry.isInError ? 'is-error' : ''}`}>
                    <EndpointCard
                      data={{
                        id: entry.key,
                        titleText: entry.label,
                        keyValues: [
                          { key: 'key', value: entry.key },
                          { key: 'host', value: entry.host },
                          { key: 'port', value: `${entry.port}` },
                          { key: 'space', value: entry.databaseName },
                          { key: 'status', value: entry.isInError ? 'error' : 'ok' },
                        ],
                        statusTagText: isCurrent ? 'current' : '',
                        errorMessage: entry.errorMessage ?? '',
                      }}
                      config={{
                        isSelected: isCurrent,
                        isLocked: isLoading || isSwitching || isTesting,
                        actionItems: [
                          {
                            id: 'switch',
                            labelText: isSwitching && !isCurrent ? 'Switching' : 'Switch',
                            isDisabled: isCurrent || isLoading || isSwitching || isTesting,
                          },
                          {
                            id: 'test',
                            labelText: isTesting && testingId === entry.key ? 'Testing' : 'Test',
                            isDisabled: isLoading || isSwitching || isTesting,
                          },
                        ],
                      }}
                      onEvent={(eventType, eventData) => {
                        if (eventType === 'action' && eventData?.actionId === 'switch') {
                          void Promise.resolve(emitEvent('switch', { id: entry.key })).then(() => {
                            setIsDropdownOpen(false);
                          });
                          return;
                        }
                        if (eventType === 'action' && eventData?.actionId === 'test') {
                          emitEvent('test', { id: entry.key });
                        }
                      }}
                    />
                  </div>
                );
              })
            ) : (
              <div className="db-switch-empty">No matching endpoint</div>
            )}
          </div>
        </div>
      ), document.body) : null}
    </div>
  );
};

export default DbSwitcher;
