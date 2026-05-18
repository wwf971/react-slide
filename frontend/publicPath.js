export const getRouterBasename = () => {
  const base = import.meta.env.BASE_URL ?? '/';
  if (base === '/') {
    return '';
  }
  return base.replace(/\/$/, '');
};

export const resolveBackendBaseUrl = () => {
  const fromEnv = import.meta.env.VITE_SLIDE_BACKEND_BASE_URL;
  if (fromEnv != null && fromEnv !== '') {
    return fromEnv;
  }
  if (typeof window === 'undefined') {
    return '';
  }
  const basename = getRouterBasename();
  if (!basename) {
    return window.location.origin;
  }
  return `${window.location.origin}${basename}`;
};
