import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

const parseSlashInput = (textValue) => {
  const safeTextValue = `${textValue ?? ''}`;
  const trimmedStartText = safeTextValue.trimStart();
  if (!trimmedStartText.startsWith('/')) {
    return {
      isSlashMode: false,
      keyword: '',
      command: '',
    };
  }
  const slashBody = trimmedStartText.slice(1);
  const firstSpaceIndex = slashBody.search(/\s/);
  const command =
    firstSpaceIndex < 0 ? slashBody.toLowerCase() : slashBody.slice(0, firstSpaceIndex).toLowerCase();
  return {
    isSlashMode: true,
    keyword: command,
    command,
  };
};

const CompSwitcher = observer(({
  textValue,
  availableCompNames,
  availableCompScripts,
  isReadOnly,
  onChangeText,
  onCancel,
  onConfirm,
}: any) => {
  const inputRef = useRef<any>(null);
  const isOptionConfirmingRef = useRef(false);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(-1);
  const prevOptionCountRef = useRef<number>(0);
  const safeTextValue = `${textValue ?? ''}`;

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.focus();
    const textLength = `${element.value ?? ''}`.length;
    element.setSelectionRange?.(textLength, textLength);
  }, []);

  const queryInfo = useMemo(() => parseSlashInput(safeTextValue), [safeTextValue]);

  const options = useMemo(() => {
    if (!queryInfo.isSlashMode) return [];
    const compOptions = availableCompNames.map((compName) => {
        const optionName = compName.replace(/^Comp/, '');
        const optionNameLower = optionName.toLowerCase();
        const matchStart = queryInfo.keyword ? optionNameLower.indexOf(queryInfo.keyword) : -1;
        const matchLength = queryInfo.keyword ? queryInfo.keyword.length : 0;
        return {
          optionType: 'comp',
          compName,
          optionName,
          optionNameLower,
          matchStart,
          matchLength,
        };
      });
    const compScriptOptions = (availableCompScripts ?? []).map((compScript) => {
      const command = `${compScript?.command ?? ''}`.toLowerCase();
      const optionName = `/${command}`;
      const optionNameLower = optionName.toLowerCase();
      const keywordWithSlash = queryInfo.keyword ? `/${queryInfo.keyword}` : '';
      const matchStart = keywordWithSlash ? optionNameLower.indexOf(keywordWithSlash) : -1;
      const matchLength = keywordWithSlash ? keywordWithSlash.length : 0;
      return {
        optionType: 'script',
        scriptCommand: command,
        optionName,
        optionNameLower,
        description: `${compScript?.description ?? ''}`,
        matchStart,
        matchLength,
      };
    });
    return [...compScriptOptions, ...compOptions].filter((option) => {
        if (!queryInfo.keyword) return true;
        return option.matchStart >= 0;
      });
  }, [availableCompNames, availableCompScripts, queryInfo.isSlashMode, queryInfo.keyword]);

  useEffect(() => {
    const optionCount = options.length;
    const prevOptionCount = prevOptionCountRef.current;
    prevOptionCountRef.current = optionCount;
    if (optionCount === 1) {
      setSelectedOptionIndex(0);
      return;
    }
    if (prevOptionCount === 1 && optionCount > 1) {
      setSelectedOptionIndex(-1);
      return;
    }
    if (optionCount === 0) {
      setSelectedOptionIndex(-1);
      return;
    }
    if (selectedOptionIndex >= optionCount) {
      setSelectedOptionIndex(optionCount - 1);
    }
  }, [options.length, selectedOptionIndex]);

  const requestConfirmTextSingleline = () => {
    const nextTextValue = safeTextValue.startsWith('/') ? safeTextValue.slice(1) : safeTextValue;
    onConfirm?.({
      compName: 'CompTextSingleline',
      compData: {
        text: nextTextValue,
        initialPixelSize: { pixelX: 200, pixelY: 24 },
        fontScale: 1,
        fontScaleUnit: '1/100 slide width',
      },
    });
  };

  const requestConfirmCompScript = () => {
    onConfirm?.({
      compScriptInput: safeTextValue,
    });
  };

  const requestBecomeSelectedOption = () => {
    const selectedOption = options[selectedOptionIndex];
    if (!selectedOption) {
      const hasMatchingScript = (availableCompScripts ?? []).some((compScript) => {
        return `${compScript?.command ?? ''}`.toLowerCase() === queryInfo.command;
      });
      if (queryInfo.isSlashMode && hasMatchingScript) {
        requestConfirmCompScript();
        return;
      }
      requestConfirmTextSingleline();
      return;
    }
    if (selectedOption.optionType === 'script') {
      requestConfirmCompScript();
      return;
    }
    onConfirm?.({
      compName: selectedOption.compName,
    });
  };

  const renderOptionLabel = (option: any) => {
    if (!queryInfo.keyword || option.matchStart < 0 || option.matchLength <= 0) {
      return option.optionName;
    }
    const start = option.matchStart;
    const end = start + option.matchLength;
    return (
      <>
        {option.optionName.slice(0, start)}
        <span className="slide-switcher-option-mark">{option.optionName.slice(start, end)}</span>
        {option.optionName.slice(end)}
      </>
    );
  };

  return (
    <div className="slide-switcher-root">
      <div className="slide-switcher-tag">CompGenerator</div>
      <input
        ref={inputRef}
        className="slide-switcher-input"
        readOnly={isReadOnly}
        value={safeTextValue}
        onChange={(event) => {
          if (isReadOnly) return;
          onChangeText?.(event.target.value);
        }}
        onBlur={() => {
          if (isReadOnly) return;
          if (isOptionConfirmingRef.current) return;
          if (!safeTextValue.trim()) {
            onCancel?.();
            return;
          }
          const hasMatchingScript = (availableCompScripts ?? []).some((compScript) => {
            return `${compScript?.command ?? ''}`.toLowerCase() === queryInfo.command;
          });
          if (queryInfo.isSlashMode && hasMatchingScript) {
            requestConfirmCompScript();
            return;
          }
          requestConfirmTextSingleline();
        }}
        onKeyDown={(event) => {
          if (!queryInfo.isSlashMode) {
            if (event.key === 'Enter') {
              event.preventDefault();
              requestConfirmTextSingleline();
            }
            return;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (options.length === 0) return;
            if (selectedOptionIndex < 0) {
              setSelectedOptionIndex(0);
              return;
            }
            setSelectedOptionIndex((selectedOptionIndex + 1) % options.length);
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (options.length === 0) return;
            if (selectedOptionIndex < 0) {
              setSelectedOptionIndex(options.length - 1);
              return;
            }
            setSelectedOptionIndex((selectedOptionIndex - 1 + options.length) % options.length);
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            requestBecomeSelectedOption();
          }
        }}
      />
      {queryInfo.isSlashMode ? (
        <div className="slide-switcher-options">
          {options.length > 0 ? (
            options.map((option, optionIndex) => (
              <button
                key={option.optionType === 'script' ? option.scriptCommand : option.compName}
                className={`slide-switcher-option ${optionIndex === selectedOptionIndex ? 'is-selected' : ''}`}
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  isOptionConfirmingRef.current = true;
                  setSelectedOptionIndex(optionIndex);
                  if (option.optionType === 'script') {
                    requestConfirmCompScript();
                    return;
                  }
                  onConfirm?.({ compName: option.compName });
                }}
              >
                <div className="slide-switcher-option-name">{renderOptionLabel(option)}</div>
                {option.optionType === 'script' && option.description ? (
                  <div className="slide-switcher-option-desc">{option.description}</div>
                ) : null}
              </button>
            ))
          ) : (
            <div className="slide-switcher-empty">no available options</div>
          )}
        </div>
      ) : null}
    </div>
  );
});

export default CompSwitcher;
