import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DownIcon } from '@wwf971/react-comp-misc/Icon';
import KeyValues from '@wwf971/react-comp-misc/KeyValues';
import './DbSwitcher.css';

const renderIcon = (IconComp: any, width: number, height: number) => {
  return React.createElement(IconComp, { width, height });
};

const DbSwitcher = ({
  databaseItems,
  currentDatabaseKey,
  isSettingBusy,
  isDatabaseLoading,
  isDatabaseSwitching,
  isDatabaseTesting,
  testingDatabaseKey,
  loadFailureMessage,
  onRefreshDatabases,
  onSwitchDatabase,
  onTestDatabase,
}: any) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const rootRef = useRef<any>(null);
  const searchInputRef = useRef<any>(null);

  const filteredDatabaseItems = useMemo(() => {
    const keyword = `${searchText ?? ''}`.trim().toLowerCase();
    if (!keyword) return databaseItems;
    return (databaseItems ?? []).filter((entry: any) => {
      const key = `${entry?.key ?? ''}`.toLowerCase();
      const label = `${entry?.label ?? ''}`.toLowerCase();
      const name = `${entry?.databaseName ?? ''}`.toLowerCase();
      return key.includes(keyword) || label.includes(keyword) || name.includes(keyword);
    });
  }, [databaseItems, searchText]);

  const currentDatabaseItem =
    (databaseItems ?? []).find((entry: any) => entry?.key === currentDatabaseKey) ?? null;

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

  return (
    <div ref={rootRef} className="db-switch-root">
      <button
        className="db-switch-current-btn"
        type="button"
        disabled={isSettingBusy || isDatabaseLoading || isDatabaseSwitching}
        onClick={() => {
          setIsDropdownOpen((isOpen) => {
            const isNextOpen = !isOpen;
            if (isNextOpen) setSearchText('');
            return isNextOpen;
          });
        }}
      >
        <span className="db-switch-current-name">
          {currentDatabaseItem?.label ?? currentDatabaseKey ?? 'DB'}
        </span>
        <span className={`db-switch-status-dot ${currentDatabaseItem?.isInError ? 'is-error' : ''}`} />
        <span className="db-switch-current-icon">{renderIcon(DownIcon, 10, 10)}</span>
      </button>
      {isDropdownOpen ? (
        <div className="db-switch-dropdown">
          <div className="db-switch-search-wrap">
            <input
              ref={searchInputRef}
              className="db-switch-search-input"
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
              }}
              placeholder="Search database..."
            />
            <button
              className="db-switch-refresh-btn"
              type="button"
              disabled={isDatabaseLoading || isDatabaseSwitching}
              onClick={() => {
                onRefreshDatabases?.();
              }}
            >
              Refresh
            </button>
          </div>
          {loadFailureMessage ? <div className="db-switch-error">{loadFailureMessage}</div> : null}
          <div className="db-switch-dropdown-items">
            {filteredDatabaseItems.length > 0 ? (
              filteredDatabaseItems.map((entry: any) => {
                const isCurrent = entry.key === currentDatabaseKey;
                const keyValues = [
                  { key: 'key', value: entry.key },
                  { key: 'host', value: entry.host },
                  { key: 'port', value: `${entry.port}` },
                  { key: 'database', value: entry.databaseName },
                  { key: 'status', value: entry.isInError ? 'error' : 'ok' },
                ];
                return (
                  <div
                    key={entry.key}
                    className={`db-switch-card ${isCurrent ? 'is-selected' : ''} ${entry.isInError ? 'is-error' : ''}`}
                  >
                    <div className="db-switch-card-header">
                      <div className="db-switch-card-title-wrap">
                        <span className="db-switch-card-title">{entry.label}</span>
                        {isCurrent ? <span className="db-switch-card-current">current</span> : null}
                      </div>
                      <div className="db-switch-card-actions">
                        <button
                          className="db-switch-card-action-btn"
                          type="button"
                          disabled={
                            isCurrent ||
                            isDatabaseLoading ||
                            isDatabaseSwitching ||
                            isDatabaseTesting
                          }
                          onClick={() => {
                            onSwitchDatabase?.(entry.key);
                            setIsDropdownOpen(false);
                          }}
                        >
                          Switch
                        </button>
                        <button
                          className="db-switch-card-action-btn"
                          type="button"
                          disabled={isDatabaseLoading || isDatabaseSwitching || isDatabaseTesting}
                          onClick={() => {
                            onTestDatabase?.(entry.key);
                          }}
                        >
                          {isDatabaseTesting && testingDatabaseKey === entry.key ? 'Testing' : 'Test'}
                        </button>
                      </div>
                    </div>
                    <div className="db-switch-card-kv-wrap">
                      <KeyValues
                        data={keyValues}
                        isEditable={false}
                        isKeyEditable={false}
                        isValueEditable={false}
                        alignColumn
                        keyColWidth="70px"
                      />
                    </div>
                    {entry.errorMessage ? (
                      <div className="db-switch-card-error">{entry.errorMessage}</div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="db-switch-empty">No matching database</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DbSwitcher;
