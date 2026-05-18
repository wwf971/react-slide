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
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return {
      ok: false,
      message: toText(responseText).slice(0, 200),
    };
  }
  if (Object.prototype.hasOwnProperty.call(rawBody, 'code')) {
    const codeValue = Number(rawBody.code);
    const isSuccess = Number.isFinite(codeValue) && codeValue === 0;
    const safeMessage = toText(rawBody.message)
      || (isSuccess ? '' : toText(responseText).slice(0, 200));
    const responseData = rawBody.data;
    if (responseData && typeof responseData === 'object' && !Array.isArray(responseData)) {
      return {
        ...responseData,
        ok: isSuccess,
        ...(safeMessage ? { message: safeMessage } : {}),
      };
    }
    return {
      ok: isSuccess,
      ...(responseData !== undefined ? { data: responseData } : {}),
      ...(safeMessage ? { message: safeMessage } : {}),
    };
  }
  if (!Object.prototype.hasOwnProperty.call(rawBody, 'ok')) {
    return {
      ...rawBody,
      ok: false,
      ...(toText(rawBody.message) ? {} : { message: toText(responseText).slice(0, 200) }),
    };
  }
  return {
    ...rawBody,
    ...(toText(rawBody.message) ? {} : { message: toText(responseText).slice(0, 200) }),
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
      isOk: response.ok && normalizedBody.ok === true,
      status: response.status,
      body: normalizedBody,
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
