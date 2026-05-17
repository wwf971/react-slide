import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const rootRef = useRef<any>(null);
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

  useEffect(() => {
    if (!isDropdownOpen) return undefined;
    const onPointerDown = (event: any) => {
      const rootElement = rootRef.current;
      if (!rootElement) return;
      if (rootElement.contains(event.target)) return;
      setIsDropdownOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
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
      {isDropdownOpen ? (
        <div className="db-switch-dropdown">
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
      ) : null}
    </div>
  );
};

export default DbSwitcher;
