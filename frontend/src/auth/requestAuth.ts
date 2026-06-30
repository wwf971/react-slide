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
let getServiceAuthToken = async () => '';
let onUnauthorized = () => {};

const configureAuthRequest = ({
  getToken,
  getServiceToken,
  onRequestUnauthorized,
}: {
  getToken?: () => string;
  getServiceToken?: () => Promise<string>;
  onRequestUnauthorized?: () => void;
} = {}) => {
  if (typeof getToken === 'function') {
    getAuthToken = getToken;
  }
  if (typeof onRequestUnauthorized === 'function') {
    onUnauthorized = onRequestUnauthorized;
  }
  if (typeof getServiceToken === 'function') {
    getServiceAuthToken = getServiceToken;
  }
};

const isLoginRequest = (inputUrl: string) => {
  return inputUrl === '/api/login' || inputUrl.startsWith('/api/login/');
};

const parseJsonBody = (body: BodyInit | null | undefined) => {
  if (!body) return {};
  if (typeof body !== 'string') return {};
  try {
    const parsedBody = JSON.parse(body);
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) return {};
    return parsedBody;
  } catch {
    return {};
  }
};

const buildOptionsWithAuthBody = async (inputUrl: string, options: RequestInit = {}) => {
  const method = toText(options.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return options;
  const headers = new Headers(options.headers ?? {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = toText(isLoginRequest(inputUrl) ? getAuthToken() : await getServiceAuthToken());
  if (!token) {
    if (!isLoginRequest(inputUrl)) {
      throw new Error('temporary service token is unavailable. Check /api/login/temporary-token response.');
    }
    return {
      ...options,
      headers,
    };
  }
  const body = {
    ...parseJsonBody(options.body),
    authToken: token,
  };
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return {
    ...options,
    headers,
    body: JSON.stringify(body),
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
    const optionsWithAuthBody = await buildOptionsWithAuthBody(inputUrl, options);
    const response = await fetch(url, {
      credentials: 'include',
      ...optionsWithAuthBody,
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
    if (response.status === 401 && !isLoginRequest(inputUrl)) {
      onUnauthorized();
    }
    return {
      status: response.status,
      body: normalizedBody,
    };
  } catch (error) {
    return {
      status: 0,
      body: {
        code: -1,
        message: error instanceof Error ? error.message : 'network request failed',
      },
    };
  }
};

export {
  configureAuthRequest,
  requestJsonWithAuth,
};
