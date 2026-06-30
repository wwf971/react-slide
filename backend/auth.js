import { createHash, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, decodeProtectedHeader, importJWK, jwtVerify } from 'jose';

const AUTH_COOKIE_NAME = 'slide_auth_token';
const AUTH_TOKEN_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;
const AUTH_TYPE_INTERNAL = 'internal';
const AUTH_TYPE_AUTH_JWT = '@wwf971/auth-jwt';

const toText = (value) => {
  return `${value ?? ''}`.trim();
};

const parseCookieHeader = (cookieHeader = '') => {
  const cookieMap = {};
  const cookieText = toText(cookieHeader);
  if (!cookieText) return cookieMap;
  cookieText.split(';').forEach((part) => {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex <= 0) return;
    const key = toText(part.slice(0, separatorIndex));
    const value = toText(part.slice(separatorIndex + 1));
    if (!key) return;
    cookieMap[key] = value;
  });
  return cookieMap;
};

const secureCompare = (sourceRaw, targetRaw) => {
  const sourceText = `${sourceRaw ?? ''}`;
  const targetText = `${targetRaw ?? ''}`;
  const sourceBuffer = Buffer.from(sourceText, 'utf8');
  const targetBuffer = Buffer.from(targetText, 'utf8');
  if (sourceBuffer.length !== targetBuffer.length) return false;
  return timingSafeEqual(sourceBuffer, targetBuffer);
};

const createStableToken = (username, password) => {
  const hash = createHash('sha256');
  hash.update(`${username}\n${password}`);
  return hash.digest('hex');
};

const normalizePermission = (value) => {
  const rawText = toText(value).toUpperCase();
  const permission = [...rawText].filter((char) => char === 'R' || char === 'W').join('');
  return permission || 'R';
};

const normalizeAuthProvider = (authConfig = {}) => {
  const authType = toText(authConfig.type) || AUTH_TYPE_INTERNAL;
  const ip = toText(authConfig.ip) || toText(authConfig.host) || '127.0.0.1';
  const port = Number(authConfig.port || 9531);
  const baseUrl = toText(authConfig.base_url ?? authConfig.baseUrl) || `http://${ip}:${port}`;
  return {
    type: authType,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    timeout: Math.max(1, Number(authConfig.timeout || 20)),
    serviceId: toText(authConfig.service_id ?? authConfig.serviceId),
    readPermissionCode: authConfig.read_permission_code ?? authConfig.readPermissionCode,
    writePermissionCode: authConfig.write_permission_code ?? authConfig.writePermissionCode,
    defaultPermission: normalizePermission(authConfig.default_permission ?? authConfig.defaultPermission ?? 'RW'),
  };
};

const normalizeAuthUser = (rawUser) => {
  if (!rawUser || typeof rawUser !== 'object' || Array.isArray(rawUser)) return null;
  const username = toText(rawUser.username);
  const password = `${rawUser.password ?? ''}`;
  if (!username || !password) return null;
  return {
    username,
    password,
    permission: normalizePermission(rawUser.permission ?? 'RW'),
  };
};

const normalizeAuthUsers = ({ authConfig = {}, username = '', password = '' }) => {
  const rawUsers = Array.isArray(authConfig.users) ? authConfig.users : [];
  const users = rawUsers.map(normalizeAuthUser).filter(Boolean);
  if (users.length > 0) return users;
  const fallbackUser = normalizeAuthUser({
    username,
    password,
    permission: authConfig.permission ?? 'RW',
  });
  return fallbackUser ? [fallbackUser] : [];
};

const createSlideAuth = ({
  username,
  password,
  authConfig,
} = {}) => {
  const provider = normalizeAuthProvider(authConfig);
  const authUsers = normalizeAuthUsers({ authConfig, username, password });
  const authUserByUsername = new Map(authUsers.map((user) => [user.username, user]));
  const usernameByToken = new Map();
  const usernameByTemporaryToken = new Map();
  const jwks = createRemoteJWKSet(new URL(`${provider.baseUrl}/.well-known/jwks.json`));

  authUsers.forEach((user) => {
    usernameByToken.set(createStableToken(user.username, user.password), user.username);
  });

  const getTokenFromRequest = (req) => {
    const authorizationHeader = toText(req?.headers?.authorization);
    if (authorizationHeader.toLowerCase().startsWith('bearer ')) {
      const bearerToken = toText(authorizationHeader.slice(7));
      if (bearerToken) return bearerToken;
    }
    const headerToken = toText(req?.headers?.['x-auth-token']);
    if (headerToken) return headerToken;
    const queryToken = toText(req?.query?.authToken);
    if (queryToken) return queryToken;
    const bodyToken = toText(req?.body?.authToken);
    if (bodyToken) return bodyToken;
    const cookieMap = parseCookieHeader(req?.headers?.cookie ?? '');
    const cookieToken = toText(cookieMap[AUTH_COOKIE_NAME]);
    if (cookieToken) return cookieToken;
    return '';
  };

  const isAuthJwtEnabled = () => {
    return provider.type === AUTH_TYPE_AUTH_JWT;
  };

  const authJwtPost = async (requestPath, body) => {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), provider.timeout * 1000);
    try {
      const response = await fetch(`${provider.baseUrl}${requestPath}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });
      const data = await response.json();
      if (!response.ok || Number(data?.code ?? -1) !== 0) {
        throw new Error(toText(data?.message) || `auth-jwt request failed: ${requestPath}`);
      }
      return data?.data ?? {};
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const authJwtLogin = (inputUsername, inputPassword) => {
    return authJwtPost('/api/token', { username: inputUsername, password: inputPassword });
  };

  const authJwtLogout = (token) => {
    return authJwtPost('/api/logout', { session_token: token });
  };

  const authJwtVerifyToken = async (tokenRaw) => {
    const token = toText(tokenRaw);
    if (!token) return null;
    try {
      const data = await authJwtPost('/api/verify_jwt_token', { session_token: token });
      if (data?.valid === false) return null;
      return {
        username: toText(data?.username) || 'external',
        permission: provider.defaultPermission,
      };
    } catch {
      return null;
    }
  };

  const authJwtIssueTemporaryToken = (token) => {
    return authJwtPost('/api/temporary-token', { token });
  };

  const authJwtVerifyTemporaryTokenValue = async (token) => {
    try {
      return await jwtVerify(token, jwks, { algorithms: ['RS256'] });
    } catch (error) {
      const header = decodeProtectedHeader(token);
      const keyId = toText(header?.kid);
      const response = await fetch(`${provider.baseUrl}/.well-known/jwks.json`);
      if (!response.ok) throw error;
      const keyItems = (await response.json())?.keys ?? [];
      let keyItem = null;
      if (keyId) {
        keyItem = keyItems.find((item) => toText(item?.kid) === keyId) ?? null;
      } else if (keyItems.length > 0) {
        keyItem = keyItems[0];
      }
      if (!keyItem) throw error;
      const key = await importJWK(keyItem, toText(keyItem?.alg) || 'RS256');
      return jwtVerify(token, key, { algorithms: [toText(keyItem?.alg) || 'RS256'] });
    }
  };

  const authJwtVerifyTemporaryToken = async (tokenRaw) => {
    const token = toText(tokenRaw);
    if (!token) return null;
    try {
      const result = await authJwtVerifyTemporaryTokenValue(token);
      if (result?.payload?.token_type !== 'temp') return null;
      return {
        username: usernameByTemporaryToken.get(token) || 'external',
        permission: provider.defaultPermission,
      };
    } catch (error) {
      const fallbackSession = await authJwtVerifyToken(token);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (fallbackSession) {
        console.warn(
          `[slide-auth] internal temporary-token verification failed, but external auth verification succeeded. Check JWKS/key synchronization. ${errorMessage}`,
        );
        return fallbackSession;
      }
      console.warn(
        `[slide-auth] internal temporary-token verification failed, and external auth verification also failed. ${errorMessage}`,
      );
      return null;
    }
  };

  const attachSession = (res, token, usernameText) => {
    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: AUTH_TOKEN_MAX_AGE_MS,
      path: '/',
    });
  };

  const clearSession = (res) => {
    res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
  };

  const getSession = async (tokenRaw) => {
    const token = toText(tokenRaw);
    if (!token) return null;
    if (isAuthJwtEnabled()) {
      return authJwtVerifyTemporaryToken(token);
    }
    const matchedUsername = usernameByToken.get(token);
    const user = authUserByUsername.get(matchedUsername);
    if (!user) return null;
    const expectedToken = createStableToken(user.username, user.password);
    const isMatched = secureCompare(token, expectedToken);
    if (!isMatched) return null;
    return {
      username: user.username,
      permission: user.permission,
      createdAt: 0,
      expiresAt: Number.MAX_SAFE_INTEGER,
    };
  };

  const getCurrentSession = async (req) => {
    const token = getTokenFromRequest(req);
    if (!token) {
      console.warn(`[slide-auth] protected request rejected: no auth token found for ${req?.method ?? ''} ${req?.path ?? ''}`);
      return null;
    }
    const session = await getSession(token);
    if (!session) {
      console.warn(`[slide-auth] protected request rejected: auth token verification failed for ${req?.method ?? ''} ${req?.path ?? ''}`);
      return null;
    }
    return {
      token,
      ...session,
    };
  };

  const toErrorCode = () => {
    return -1;
  };

  const sendSuccess = (res, data = undefined, message = '', statusCode = 200) => {
    const body = { code: 0 };
    if (data !== undefined) body.data = data;
    const messageText = `${message ?? ''}`.trim();
    if (messageText) body.message = messageText;
    res.status(statusCode).json(body);
  };

  const sendError = (res, statusCode = 500, message = '', data = undefined) => {
    const body = { code: toErrorCode(statusCode) };
    const messageText = `${message ?? ''}`.trim();
    if (messageText) body.message = messageText;
    if (data !== undefined) body.data = data;
    res.status(statusCode).json(body);
  };

  const sendUnauthorized = (res, message = 'login required') => {
    sendError(res, 401, message);
  };

  const registerAuthRoutes = (app) => {
    app.post('/api/login', async (req, res) => {
      if (!isAuthJwtEnabled() && authUsers.length <= 0) {
        sendError(res, 503, 'login is not configured');
        return;
      }
      const inputUsername = toText(req?.body?.username);
      const inputPassword = toText(req?.body?.password);
      if (isAuthJwtEnabled()) {
        try {
          const data = await authJwtLogin(inputUsername, inputPassword);
          const token = toText(data?.token);
          const responseUsername = toText(data?.username) || inputUsername;
          attachSession(res, token, responseUsername);
          sendSuccess(res, { token, username: responseUsername, permission: provider.defaultPermission });
        } catch (error) {
          sendUnauthorized(res, error instanceof Error ? error.message : 'invalid username or password');
        }
        return;
      }
      const user = authUserByUsername.get(inputUsername);
      const isPasswordMatched = user ? secureCompare(inputPassword, user.password) : false;
      if (!user || !isPasswordMatched) {
        sendUnauthorized(res, 'invalid username or password');
        return;
      }
      const token = createStableToken(user.username, user.password);
      attachSession(res, token, user.username);
      sendSuccess(res, { token, username: user.username, permission: user.permission });
    });

    app.post('/api/login/token', async (req, res) => {
      const token = toText(req?.body?.token);
      const session = isAuthJwtEnabled() ? await authJwtVerifyToken(token) : await getSession(token);
      if (!session) {
        sendUnauthorized(res, 'saved token is expired or invalid. Please login with username and password.');
        return;
      }
      attachSession(res, token, session.username);
      sendSuccess(res, { token, username: session.username, permission: session.permission });
    });

    app.post('/api/login/temporary-token', async (req, res) => {
      if (!isAuthJwtEnabled()) {
        sendSuccess(res, { token: toText(req?.body?.token) || getTokenFromRequest(req), expires_at: Number.MAX_SAFE_INTEGER });
        return;
      }
      const token = toText(req?.body?.token) || getTokenFromRequest(req);
      const session = await authJwtVerifyToken(token);
      if (!session) {
        console.warn('[slide-auth] temporary token request rejected: stored token could not be verified by external auth service.');
        sendUnauthorized(res, 'stored token could not be verified by external auth service');
        return;
      }
      try {
        const data = await authJwtIssueTemporaryToken(token);
        const temporaryToken = toText(data?.token);
        if (!temporaryToken) {
          console.warn('[slide-auth] temporary token request failed: external auth service did not issue a temporary token.');
          sendError(res, 502, 'temporary token was not issued');
          return;
        }
        usernameByTemporaryToken.set(temporaryToken, session.username);
        sendSuccess(res, { token: temporaryToken, expires_at: Number(data?.expires_at || 0) });
      } catch (error) {
        console.warn(
          `[slide-auth] temporary token request failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        sendError(res, 502, error instanceof Error ? error.message : 'temporary token request failed');
      }
    });

    const handleLoginCheck = async (req, res) => {
      const session = await getCurrentSession(req);
      if (!session) {
        sendUnauthorized(res);
        return;
      }
      sendSuccess(res, { username: session.username, permission: session.permission });
    };
    app.get('/api/login/check', handleLoginCheck);
    app.post('/api/login/check', handleLoginCheck);

    app.post('/api/login/logout', async (req, res) => {
      const token = getTokenFromRequest(req);
      if (isAuthJwtEnabled() && token) {
        try {
          await authJwtLogout(token);
        } catch (error) {
          sendError(res, 400, error instanceof Error ? error.message : 'logout failed');
          return;
        }
      }
      clearSession(res, token);
      sendSuccess(res);
    });
  };

  const requireAuth = async (req, res, next) => {
    const session = await getCurrentSession(req);
    if (!session) {
      sendUnauthorized(res);
      return;
    }
    req.slideAuth = {
      username: session.username,
      token: session.token,
    };
    next();
  };

  return {
    registerAuthRoutes,
    requireAuth,
  };
};

export {
  createSlideAuth,
};
