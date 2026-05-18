import { createHash, timingSafeEqual } from 'node:crypto';

const AUTH_COOKIE_NAME = 'slide_auth_token';
const AUTH_TOKEN_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

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

const createSlideAuth = ({
  username,
  password,
} = {}) => {
  const configuredUsername = toText(username);
  const configuredPassword = toText(password);

  const isCredentialsConfigured = Boolean(configuredUsername) && Boolean(configuredPassword);
  const stableAuthToken = isCredentialsConfigured
    ? createStableToken(configuredUsername, configuredPassword)
    : '';

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
    const cookieMap = parseCookieHeader(req?.headers?.cookie ?? '');
    const cookieToken = toText(cookieMap[AUTH_COOKIE_NAME]);
    if (cookieToken) return cookieToken;
    return '';
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

  const getSession = (tokenRaw) => {
    const token = toText(tokenRaw);
    if (!token || !stableAuthToken) return null;
    const isMatched = secureCompare(token, stableAuthToken);
    if (!isMatched) return null;
    return {
      username: configuredUsername,
      createdAt: 0,
      expiresAt: Number.MAX_SAFE_INTEGER,
    };
  };

  const getCurrentSession = (req) => {
    const token = getTokenFromRequest(req);
    if (!token) return null;
    const session = getSession(token);
    if (!session) return null;
    return {
      token,
      ...session,
    };
  };

  const sendUnauthorized = (res, message = 'login required') => {
    res.status(401).json({
      ok: false,
      message,
    });
  };

  const registerAuthRoutes = (app) => {
    app.post('/api/login', (req, res) => {
      if (!isCredentialsConfigured) {
        res.status(503).json({
          ok: false,
          message: 'login is not configured',
        });
        return;
      }
      const inputUsername = toText(req?.body?.username);
      const inputPassword = toText(req?.body?.password);
      const isUsernameMatched = secureCompare(inputUsername, configuredUsername);
      const isPasswordMatched = secureCompare(inputPassword, configuredPassword);
      if (!isUsernameMatched || !isPasswordMatched) {
        sendUnauthorized(res, 'invalid username or password');
        return;
      }
      const token = stableAuthToken;
      attachSession(res, token, configuredUsername);
      res.json({
        ok: true,
        token,
      });
    });

    app.post('/api/login/token', (req, res) => {
      const token = toText(req?.body?.token);
      const session = getSession(token);
      if (!session) {
        sendUnauthorized(res);
        return;
      }
      attachSession(res, token, session.username);
      res.json({
        ok: true,
        token,
      });
    });

    app.get('/api/login/check', (req, res) => {
      const session = getCurrentSession(req);
      if (!session) {
        sendUnauthorized(res);
        return;
      }
      res.json({
        ok: true,
        username: session.username,
      });
    });

    app.post('/api/login/logout', (req, res) => {
      const token = getTokenFromRequest(req);
      clearSession(res, token);
      res.json({
        ok: true,
      });
    });
  };

  const requireAuth = (req, res, next) => {
    const session = getCurrentSession(req);
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
