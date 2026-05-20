import { makeAutoObservable, runInAction } from 'mobx';
import { configureAuthRequest, requestJsonWithAuth } from './requestAuth';

const LOCAL_STORAGE_AUTH_TOKEN_KEY = 'react-slide-auth-token';

const toText = (value: unknown) => {
  return `${value ?? ''}`.trim();
};

class AuthStore {
  isInitializing = false;
  isLoading = false;
  isLoggedIn = false;
  username = '';
  password = '';
  token = '';
  message = '';
  messageType: 'error' | 'success' = 'error';
  isPasswordVisible = false;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
    configureAuthRequest({
      getToken: () => this.token,
      onRequestUnauthorized: this.clearSessionOnUnauthorized,
    });
  }

  get loginData() {
    return {
      isLoggedIn: this.isLoggedIn,
      isLoading: this.isLoading,
      username: this.username,
      password: this.password,
      token: this.token,
      loginMode: 'credentials',
      message: this.message,
      messageType: this.messageType,
      isPasswordVisible: this.isPasswordVisible,
      loginStatus: this.message,
    };
  }

  saveToken(tokenRaw: unknown) {
    const token = toText(tokenRaw);
    if (!token) {
      localStorage.removeItem(LOCAL_STORAGE_AUTH_TOKEN_KEY);
      return;
    }
    localStorage.setItem(LOCAL_STORAGE_AUTH_TOKEN_KEY, token);
  }

  loadSavedToken() {
    return toText(localStorage.getItem(LOCAL_STORAGE_AUTH_TOKEN_KEY));
  }

  clearSessionOnUnauthorized() {
    if (!this.isLoggedIn && !this.token) return;
    runInAction(() => {
      this.isLoggedIn = false;
      this.token = '';
      this.password = '';
      this.message = 'Session expired, please login again';
      this.messageType = 'error';
    });
    this.saveToken('');
  }

  clearSessionAfterLogout(message = 'Logged out') {
    runInAction(() => {
      this.isLoggedIn = false;
      this.token = '';
      this.password = '';
      this.message = message;
      this.messageType = 'success';
      this.isLoading = false;
    });
    this.saveToken('');
  }

  async logoutWithApi() {
    if (this.isLoading) return { code: -1 };
    runInAction(() => {
      this.isLoading = true;
      this.message = '';
    });
    const result = await requestJsonWithAuth('/api/login/logout', {
      method: 'POST',
    });
    const message = toText(result.body?.message) || 'Logged out';
    this.clearSessionAfterLogout(message);
    return { code: result.body?.code ?? -1 };
  }

  async initialize() {
    if (this.isInitializing) return;
    runInAction(() => {
      this.isInitializing = true;
      this.token = this.loadSavedToken();
    });
    if (!this.token) {
      runInAction(() => {
        this.isInitializing = false;
      });
      return;
    }
    await this.submitTokenLogin();
    runInAction(() => {
      this.isInitializing = false;
    });
  }

  async submitCredentialsLogin() {
    runInAction(() => {
      this.isLoading = true;
      this.message = '';
    });
    try {
      const result = await requestJsonWithAuth('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: this.username,
          password: this.password,
        }),
      });
      if (result.body?.code !== 0) {
        runInAction(() => {
          this.isLoggedIn = false;
          this.message = toText(result.body?.message) || 'login failed';
          this.messageType = 'error';
        });
        return { code: -1 };
      }
      const token = toText(result.body?.data?.token);
      runInAction(() => {
        this.token = token;
        this.password = '';
        this.isLoggedIn = true;
        this.message = 'Login success';
        this.messageType = 'success';
      });
      this.saveToken(token);
      return { code: 0 };
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  async submitTokenLogin() {
    const token = toText(this.token);
    if (!token) return { code: -1 };
    runInAction(() => {
      this.isLoading = true;
      this.message = '';
    });
    try {
      const result = await requestJsonWithAuth('/api/login/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });
      if (result.body?.code !== 0) {
        runInAction(() => {
          this.token = '';
          this.isLoggedIn = false;
          this.message = toText(result.body?.message) || 'login failed';
          this.messageType = 'error';
        });
        this.saveToken('');
        return { code: -1 };
      }
      const nextToken = toText(result.body?.data?.token) || token;
      runInAction(() => {
        this.token = nextToken;
        this.isLoggedIn = true;
        this.message = 'Login success';
        this.messageType = 'success';
      });
      this.saveToken(nextToken);
      return { code: 0 };
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  async onDataChangeRequest(eventType: string, eventData: Record<string, unknown> = {}) {
    if (eventType === 'set-username') {
      runInAction(() => {
        this.username = toText(eventData.username);
      });
      return { code: 0 };
    }
    if (eventType === 'set-password') {
      runInAction(() => {
        this.password = toText(eventData.password);
      });
      return { code: 0 };
    }
    if (eventType === 'toggle-password-visible') {
      runInAction(() => {
        this.isPasswordVisible = !this.isPasswordVisible;
      });
      return { code: 0 };
    }
    if (eventType === 'submit-credentials') {
      return this.submitCredentialsLogin();
    }
    return { code: -1 };
  }
}

const authStore = new AuthStore();

export {
  authStore,
};
