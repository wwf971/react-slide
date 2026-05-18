import { resolveBackendBaseUrl } from '../../publicPath.js';

const BACKEND_BASE_URL = resolveBackendBaseUrl();

const toText = (value: unknown) => {
  return `${value ?? ''}`.trim();
};

const withBackendBaseUrl = (inputUrl: string) => {
  if (/^https?:\/\//i.test(inputUrl)) return inputUrl;
  if (!BACKEND_BASE_URL) return inputUrl;
  if (inputUrl.startsWith('/')) {
    return `${BACKEND_BASE_URL}${inputUrl}`;
  }
  return `${BACKEND_BASE_URL}/${inputUrl}`;
};

let getAuthToken = () => '';
let onUnauthorized = () => {};

const configureAuthRequest = ({
  getToken,
  onRequestUnauthorized,
}: {
  getToken?: () => string;
  onRequestUnauthorized?: () => void;
} = {}) => {
  if (typeof getToken === 'function') {
    getAuthToken = getToken;
  }
  if (typeof onRequestUnauthorized === 'function') {
    onUnauthorized = onRequestUnauthorized;
  }
};

const buildAuthHeaders = (extraHeaders: HeadersInit = {}) => {
  const token = toText(getAuthToken());
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(token ? { 'X-Auth-Token': token } : {}),
    ...extraHeaders,
  };
};

const requestJsonWithAuth = async (inputUrl: string, options: RequestInit = {}) => {
  const url = withBackendBaseUrl(inputUrl);
  try {
    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers: buildAuthHeaders(options.headers ?? {}),
    });
    const responseText = await response.text();
    const responseBody = (() => {
      try {
        return responseText ? JSON.parse(responseText) : {};
      } catch {
        return {};
      }
    })();
    if (response.status === 401) {
      onUnauthorized();
    }
    return {
      isOk: response.ok,
      status: response.status,
      body: {
        ...(responseBody ?? {}),
        message: toText((responseBody as any)?.message)
          || toText(responseText).slice(0, 200),
      },
    };
  } catch (_error) {
    return {
      isOk: false,
      status: 0,
      body: {},
    };
  }
};

export {
  configureAuthRequest,
  requestJsonWithAuth,
};
