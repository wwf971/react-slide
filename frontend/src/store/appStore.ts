import { createAuthStore } from '@wwf971/react-comp-misc';
import { configureAuthRequest, requestJsonWithAuth } from '../auth/requestAuth';

async function requestJsonData(url: string, options: RequestInit = {}) {
  const result = await requestJsonWithAuth(url, options);
  const body = result.body ?? {};
  if (result.status < 200 || result.status >= 300 || body.code !== 0) {
    throw new Error(`${body.message ?? ''}`.trim() || `request failed: ${result.status}`);
  }
  return body.data || {};
}

export const authStore = createAuthStore({
  storageKey: 'react-slide-auth-token',
  autoLoginStorageKey: 'react-slide-auto-login-enabled',
  endpoints: {
    login: '/api/login',
    tokenLogin: '/api/login/token',
    temporaryToken: '/api/login/temporary-token',
    logout: '/api/login/logout',
  },
  requestJsonData,
  loginSuccessMessage: 'Login success',
  logoutSuccessMessage: 'Logged out',
});

configureAuthRequest({
  getToken: () => authStore.token,
  getServiceToken: authStore.getServiceToken,
  onRequestUnauthorized: authStore.clearSessionOnUnauthorized,
});
