import { makeAutoObservable, runInAction } from 'mobx';

const resolveDefaultBackendBaseUrl = () => {
  if (typeof window !== 'undefined' && window?.location?.origin) {
    return window.location.origin;
  }
  return '';
};

const BACKEND_BASE_URL =
  (import.meta as any)?.env?.VITE_SLIDE_BACKEND_BASE_URL ?? resolveDefaultBackendBaseUrl();

class BackendStore {
  databaseItems: any[] = [];
  currentDatabaseKey = '';
  isDatabaseLoading = false;
  isDatabaseSwitching = false;
  isDatabaseTesting = false;
  testingDatabaseKey = '';
  loadFailureMessage = '';

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  async requestJson(url: string, options: any = {}) {
    try {
      const response = await fetch(url, options);
      const payload = await response.json().catch(() => ({}));
      return {
        isOk: response.ok,
        status: response.status,
        payload,
      };
    } catch (_error) {
      return {
        isOk: false,
        status: 0,
        payload: {},
      };
    }
  }

  normalizeDatabaseItems(rawItems: any[] = [], currentKey = '') {
    return rawItems.map((entry) => {
      const key = `${entry?.key ?? ''}`;
      const errorMessage = `${entry?.errorMessage ?? ''}`.trim();
      const isInError = entry?.isInError === true || Boolean(errorMessage);
      return {
        key,
        label: `${entry?.label ?? key}`,
        databaseName: `${entry?.databaseName ?? ''}`,
        host: `${entry?.host ?? ''}`,
        port: Number(entry?.port ?? 0),
        isCurrent: key === currentKey,
        isConnected: entry?.isConnected === true,
        isInError,
        errorMessage,
      };
    });
  }

  async requestLoadDatabases() {
    if (this.isDatabaseLoading) return { ok: false };
    runInAction(() => {
      this.isDatabaseLoading = true;
    });
    try {
      const result = await this.requestJson(`${BACKEND_BASE_URL}/api/slide/database/presets`);
      if (!result.isOk || !result.payload?.ok) {
        runInAction(() => {
          this.loadFailureMessage = result.payload?.message ?? 'Failed to load databases';
        });
        return { ok: false };
      }
      const currentKey = `${result.payload.currentDatabaseKey ?? ''}`;
      runInAction(() => {
        this.currentDatabaseKey = currentKey;
        this.databaseItems = this.normalizeDatabaseItems(result.payload.databaseItems ?? [], currentKey);
        this.loadFailureMessage = '';
      });
      return { ok: true };
    } finally {
      runInAction(() => {
        this.isDatabaseLoading = false;
      });
    }
  }

  async requestTestDatabase(databaseKey: string) {
    if (!databaseKey) return { ok: false };
    if (this.isDatabaseTesting) return { ok: false };
    runInAction(() => {
      this.isDatabaseTesting = true;
      this.testingDatabaseKey = databaseKey;
    });
    try {
      const result = await this.requestJson(`${BACKEND_BASE_URL}/api/slide/database/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ databaseKey }),
      });
      if (!result.payload?.databaseItem) {
        runInAction(() => {
          this.loadFailureMessage = 'Invalid database test response';
        });
        return { ok: false, message: 'Invalid database test response' };
      }
      const testedItem = this.normalizeDatabaseItems(
        [result.payload.databaseItem],
        this.currentDatabaseKey,
      )[0];
      runInAction(() => {
        this.databaseItems = this.databaseItems.map((item) => {
          if (item.key !== testedItem.key) return item;
          return {
            ...item,
            ...testedItem,
          };
        });
        this.loadFailureMessage = result.payload?.message ?? '';
      });
      return {
        ok: result.isOk && result.payload?.ok,
        message: result.payload?.message ?? '',
      };
    } finally {
      runInAction(() => {
        this.isDatabaseTesting = false;
        this.testingDatabaseKey = '';
      });
    }
  }

  async requestSwitchDatabase(databaseKey: string) {
    if (!databaseKey) return { ok: false };
    if (this.currentDatabaseKey === databaseKey) return { ok: true };
    if (this.isDatabaseSwitching) return { ok: false };
    runInAction(() => {
      this.isDatabaseSwitching = true;
    });
    try {
      const result = await this.requestJson(`${BACKEND_BASE_URL}/api/slide/database/switch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ databaseKey }),
      });
      if (!result.payload?.databaseItem) {
        return { ok: false, message: 'Invalid database switch response' };
      }
      const nextCurrentKey = `${result.payload.currentDatabaseKey ?? databaseKey}`;
      const switchedItem = this.normalizeDatabaseItems([result.payload.databaseItem], nextCurrentKey)[0];
      runInAction(() => {
        this.currentDatabaseKey = nextCurrentKey;
        this.databaseItems = this.databaseItems.map((item) => {
          if (item.key !== switchedItem.key) {
            return {
              ...item,
              isCurrent: false,
            };
          }
          return {
            ...item,
            ...switchedItem,
            isCurrent: true,
          };
        });
      });
      return {
        ok: result.isOk && result.payload?.ok,
        message: result.payload?.message ?? '',
      };
    } finally {
      runInAction(() => {
        this.isDatabaseSwitching = false;
      });
    }
  }
}

const createBackendStore = () => {
  return new BackendStore();
};

export { BackendStore, createBackendStore };
