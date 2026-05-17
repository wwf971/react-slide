import { EditableValueComp } from '@wwf971/react-comp-misc';

const SlidesOverviewNameCell = ({
  name = '',
  rowId = '',
  configKey = '',
  isEditable = true,
  isMissing = false,
  onRename,
}) => {
  const safeName = `${name ?? ''}`.trim();
  const safeRowId = `${rowId ?? ''}`.trim();

  return (
    <div className="slides-overview-name-cell">
      <EditableValueComp
        data={safeName}
        index={0}
        rowId={safeRowId}
        field="name"
        configKey={configKey || `slides-overview-name-${safeRowId}`}
        isEditable={isEditable}
        onUpdate={async (_configKey, value) => {
          const result = await onRename?.(`${value ?? ''}`);
          return {
            code: result?.ok ? 0 : -1,
            message: `${result?.message ?? ''}`.trim() || 'rename failed',
          };
        }}
      />
      {isMissing ? (
        <span className="slides-overview-orphan-missing-mark" title="slide not found">!</span>
      ) : null}
    </div>
  );
};

export default SlidesOverviewNameCell;
