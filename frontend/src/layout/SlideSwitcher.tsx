import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DownIcon } from '@wwf971/react-comp-misc/Icon';

const renderIcon = (IconComp: any, width: number, height: number) => {
  return React.createElement(IconComp, { width, height });
};

const SlideSwitcher = ({
  slideItems,
  slideCurrentId,
  slideCurrentName,
  isSettingBusy,
  onSwitchSlide,
  onRenameSlide,
}: any) => {
  const [isRenameEditing, setIsRenameEditing] = useState(false);
  const renameRef = useRef<any>(null);
  const [isSlideDropdownOpen, setIsSlideDropdownOpen] = useState(false);
  const dropdownRef = useRef<any>(null);
  const [slideSearchText, setSlideSearchText] = useState('');
  const slideSearchInputRef = useRef<any>(null);

  const filteredSlideItems = useMemo(() => {
    const keyword = `${slideSearchText ?? ''}`.trim().toLowerCase();
    if (!keyword) return slideItems;
    return slideItems.filter((item: any) => {
      const name = `${item?.name ?? ''}`.toLowerCase();
      const id = `${item?.id ?? ''}`.toLowerCase();
      return name.includes(keyword) || id.includes(keyword);
    });
  }, [slideItems, slideSearchText]);

  useEffect(() => {
    setIsRenameEditing(false);
    setIsSlideDropdownOpen(false);
    setSlideSearchText('');
    const element = renameRef.current;
    if (!element) return;
    element.textContent = slideCurrentName ?? '';
  }, [slideCurrentId, slideCurrentName]);

  useEffect(() => {
    if (!isSlideDropdownOpen) return undefined;
    const onPointerDown = (event: any) => {
      const rootElement = dropdownRef.current;
      if (!rootElement) return;
      if (rootElement.contains(event.target)) return;
      setIsSlideDropdownOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isSlideDropdownOpen]);

  useEffect(() => {
    if (!isSlideDropdownOpen) return;
    requestAnimationFrame(() => {
      const inputElement = slideSearchInputRef.current;
      if (!inputElement) return;
      inputElement.focus();
      inputElement.select();
    });
  }, [isSlideDropdownOpen]);

  const requestCommitRename = () => {
    const element = renameRef.current;
    if (!element) return;
    const nextName = `${element.textContent ?? ''}`.trim();
    const safeCurrentName = `${slideCurrentName ?? ''}`.trim();
    if (!nextName) {
      element.textContent = safeCurrentName;
      setIsRenameEditing(false);
      return;
    }
    if (nextName !== safeCurrentName) {
      onRenameSlide?.(nextName);
    }
    setIsRenameEditing(false);
  };

  return (
    <div
      ref={dropdownRef}
      className={`slide-rename-root ${isRenameEditing ? 'is-editing' : ''}`}
    >
      <div
        ref={renameRef}
        className="slide-rename-contenteditable"
        contentEditable={isRenameEditing && !isSettingBusy}
        suppressContentEditableWarning
        onClick={() => {
          if (isSettingBusy || !slideCurrentId) return;
          if (isRenameEditing) return;
          setIsRenameEditing(true);
          requestAnimationFrame(() => {
            const element = renameRef.current;
            if (!element) return;
            element.focus();
            const selection = window.getSelection();
            if (!selection) return;
            const range = document.createRange();
            range.selectNodeContents(element);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          });
        }}
        onBlur={() => {
          if (!isRenameEditing) return;
          requestCommitRename();
        }}
        onKeyDown={(event) => {
          if (!isRenameEditing) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            requestCommitRename();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            if (renameRef.current) {
              renameRef.current.textContent = slideCurrentName ?? '';
            }
            setIsRenameEditing(false);
          }
        }}
      >
        {slideCurrentName ?? ''}
      </div>
      <button
        className="slide-rename-dropdown-btn"
        type="button"
        disabled={isSettingBusy}
        onClick={() => {
          if (isSettingBusy) return;
          setIsSlideDropdownOpen((isOpen) => {
            const isNextOpen = !isOpen;
            if (isNextOpen) setSlideSearchText('');
            return isNextOpen;
          });
        }}
      >
        {renderIcon(DownIcon, 10, 10)}
      </button>
      {isSlideDropdownOpen ? (
        <div className="slide-rename-dropdown-list">
          <div className="slide-rename-dropdown-search-wrap">
            <input
              ref={slideSearchInputRef}
              className="slide-rename-dropdown-search-input"
              value={slideSearchText}
              onChange={(event) => {
                setSlideSearchText(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setIsSlideDropdownOpen(false);
                  return;
                }
                if (event.key === 'Enter' && filteredSlideItems.length > 0) {
                  event.preventDefault();
                  onSwitchSlide?.(filteredSlideItems[0].id);
                  setIsSlideDropdownOpen(false);
                }
              }}
              placeholder="Search slide..."
            />
          </div>
          <div className="slide-rename-dropdown-items">
            {filteredSlideItems.length > 0 ? (
              filteredSlideItems.map((item: any) => (
                <button
                  key={item.id}
                  className={`slide-rename-dropdown-item ${item.id === slideCurrentId ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => {
                    onSwitchSlide?.(item.id);
                    setIsSlideDropdownOpen(false);
                  }}
                >
                  <span className="slide-rename-dropdown-item-name">{item.name}</span>
                </button>
              ))
            ) : (
              <div className="slide-rename-dropdown-empty">No matching slide</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default SlideSwitcher;
