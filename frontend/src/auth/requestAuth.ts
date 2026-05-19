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

const normalizeApiBody = (rawBody: any, responseText: string) => {
  const fallbackMessage = toText(responseText).slice(0, 200);
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    const output: any = { code: -1 };
    if (fallbackMessage) output.message = fallbackMessage;
    return output;
  }
  if (Object.prototype.hasOwnProperty.call(rawBody, 'code')) {
    const codeValue = Number(rawBody.code);
    const normalizedCode = Number.isFinite(codeValue) ? codeValue : -1;
    const output: any = {
      code: normalizedCode,
    };
    if (Object.prototype.hasOwnProperty.call(rawBody, 'data')) {
      output.data = rawBody.data;
    }
    const messageText = toText(rawBody.message) || (normalizedCode === 0 ? '' : fallbackMessage);
    if (messageText) {
      output.message = messageText;
    }
    return output;
  }
  const output: any = { code: -1 };
  if (Object.keys(rawBody).length > 0) {
    output.data = rawBody;
  }
  const messageText = toText(rawBody.message) || fallbackMessage;
  if (messageText) {
    output.message = messageText;
  }
  return output;
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
    const rawBody = (() => {
      try {
        return responseText ? JSON.parse(responseText) : {};
      } catch {
        return {};
      }
    })();
    const normalizedBody = normalizeApiBody(rawBody, responseText);
    if (response.status === 401) {
      onUnauthorized();
    }
    return {
      status: response.status,
      body: normalizedBody,
    };
  } catch (_error) {
    return {
      status: 0,
      body: {
        code: -1,
        message: 'network request failed',
      },
    };
  }
};

export {
  configureAuthRequest,
  requestJsonWithAuth,
};
