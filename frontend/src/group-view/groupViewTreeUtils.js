const normalizeFolderPath = (pathRaw = '') => {
  const rawText = `${pathRaw ?? ''}`.trim();
  const noPrefix = rawText.replace(/^\/+/, '');
  const noSuffix = noPrefix.replace(/\/+$/, '');
  return noSuffix
    .split('/')
    .filter(Boolean)
    .join('/');
};

const normalizePermanentFolderPath = (pathRaw = '') => {
  const normalized = normalizeFolderPath(pathRaw);
  if (!normalized) return '';
  return `${normalized}/`;
};

export { normalizeFolderPath, normalizePermanentFolderPath };
