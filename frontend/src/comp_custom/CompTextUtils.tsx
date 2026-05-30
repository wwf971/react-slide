const TEXT_HORIZONTAL_ALIGNS = ['left', 'middle', 'right'];
const TEXT_VERTICAL_ALIGNS = ['top', 'middle', 'down'];

const normalizeHorizontalAlign = (value) => {
  const text = `${value ?? ''}`.trim();
  return TEXT_HORIZONTAL_ALIGNS.includes(text) ? text : 'left';
};

const normalizeVerticalAlign = (value) => {
  const text = `${value ?? ''}`.trim();
  return TEXT_VERTICAL_ALIGNS.includes(text) ? text : 'top';
};

const createAlignLabel = (label, isCurrent) => {
  return (
    <span className={`slide-text-align-menu-item ${isCurrent ? 'is-current' : ''}`}>
      <span className="slide-text-align-menu-name">{label}</span>
      {isCurrent ? (
        <svg className="slide-text-align-menu-current-icon" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 6.2L4.7 8.7L10 3.3" />
        </svg>
      ) : null}
    </span>
  );
};

const getTextAlignmentMenuItems = (data) => {
  const textHorizontalAlign = normalizeHorizontalAlign(data?.textHorizontalAlign);
  const textVerticalAlign = normalizeVerticalAlign(data?.textVerticalAlign);
  return [
    {
      id: 'horizontal-align',
      label: 'Horizontal Align',
      children: TEXT_HORIZONTAL_ALIGNS.map((alignValue) => ({
        id: `horizontal-align-${alignValue}`,
        label: createAlignLabel(alignValue, alignValue === textHorizontalAlign),
        data: {
          action: 'text-horizontal-align-set',
          textHorizontalAlign: alignValue,
        },
      })),
    },
    {
      id: 'vertical-align',
      label: 'Vertical Align',
      children: TEXT_VERTICAL_ALIGNS.map((alignValue) => ({
        id: `vertical-align-${alignValue}`,
        label: createAlignLabel(alignValue, alignValue === textVerticalAlign),
        data: {
          action: 'text-vertical-align-set',
          textVerticalAlign: alignValue,
        },
      })),
    },
  ];
};

const handleTextAlignmentMenuItem = ({ item, store, containerId }: any) => {
  if (item?.data?.action === 'text-horizontal-align-set') {
    const nextHorizontalAlign = normalizeHorizontalAlign(item?.data?.textHorizontalAlign);
    store.requestContainerCompDataUpdate(containerId, {
      textHorizontalAlign: nextHorizontalAlign,
    });
    return true;
  }
  if (item?.data?.action === 'text-vertical-align-set') {
    const nextVerticalAlign = normalizeVerticalAlign(item?.data?.textVerticalAlign);
    store.requestContainerCompDataUpdate(containerId, {
      textVerticalAlign: nextVerticalAlign,
    });
    return true;
  }
  return false;
};

const getMissingTextAlignmentData = (data) => {
  const nextCompData: any = {};
  if (!TEXT_HORIZONTAL_ALIGNS.includes(`${data?.textHorizontalAlign ?? ''}`.trim())) {
    nextCompData.textHorizontalAlign = 'left';
  }
  if (!TEXT_VERTICAL_ALIGNS.includes(`${data?.textVerticalAlign ?? ''}`.trim())) {
    nextCompData.textVerticalAlign = 'top';
  }
  return nextCompData;
};

export {
  TEXT_HORIZONTAL_ALIGNS,
  TEXT_VERTICAL_ALIGNS,
  normalizeHorizontalAlign,
  normalizeVerticalAlign,
  getTextAlignmentMenuItems,
  handleTextAlignmentMenuItem,
  getMissingTextAlignmentData,
};
