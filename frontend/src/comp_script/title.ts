const TITLE_SCRIPT_COMMAND = 'title';

const resolveTitleCompScript = (scriptInput) => {
  const safeInput = `${scriptInput ?? ''}`.trim();
  if (!safeInput.startsWith('/')) return null;
  const bodyText = safeInput.slice(1);
  const firstSpaceIndex = bodyText.search(/\s/);
  const commandText =
    firstSpaceIndex < 0 ? bodyText.toLowerCase() : bodyText.slice(0, firstSpaceIndex).toLowerCase();
  if (commandText !== TITLE_SCRIPT_COMMAND) return null;
  const titleText =
    firstSpaceIndex < 0 ? '' : bodyText.slice(firstSpaceIndex + 1).trim();
  return {
    command: TITLE_SCRIPT_COMMAND,
    compName: 'CompTextSingleline',
    compData: {
      text: titleText || 'Title',
      initialPixelSize: { pixelX: 600, pixelY: 72 },
      fontScale: 5,
      fontScaleUnit: '1/100 slide width',
      textHorizontalAlign: 'left',
      textVerticalAlign: 'top',
    },
    options: {
      placement: 'top-left',
      rectRatio: {
        left: 0.07,
        top: 0.05,
        width: 0.86,
        height: 0.14,
      },
    },
  };
};

const getTitleCompScript = () => {
  return {
    command: TITLE_SCRIPT_COMMAND,
    label: '/title',
    description: 'singleline title at top area',
  };
};

export { TITLE_SCRIPT_COMMAND, resolveTitleCompScript, getTitleCompScript };
