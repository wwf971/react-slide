import { makeAutoObservable, runInAction } from 'mobx';
import { requestJsonWithAuth } from '../auth/requestAuth';

import { resolveBackendBaseUrl } from '../../publicPath.js';

const BACKEND_BASE_URL = resolveBackendBaseUrl();

class BackendStore {
  databaseItems: any[] = [];
  endpointKeyCurrent = '';
  isDatabaseLoading = false;
  isDatabaseSwitching = false;
  isDatabaseTesting = false;
  testingDatabaseKey = '';
  loadFailureMessage = '';
  loadDatabasesRequestToken = 0;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  async requestJson(url: string, options: any = {}) {
    const result = await requestJsonWithAuth(url, options);
    const body = result.body ?? {};
    const code = Number.isFinite(Number(body.code)) ? Number(body.code) : -1;
    const isBackendUnreachable = result.status === 0;
    return {
      status: result.status,
      code,
      data: body.data ?? {},
      message: isBackendUnreachable
        ? 'Backend server is not responding'
        : `${body.message ?? ''}`.trim(),
    };
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

  async requestLoadDatabases(isForceRefresh = false) {
    if (this.isDatabaseLoading && !isForceRefresh) return { ok: false };
    const requestToken = this.loadDatabasesRequestToken + 1;
    this.loadDatabasesRequestToken = requestToken;
    runInAction(() => {
      this.isDatabaseLoading = true;
    });
    try {
      const result = await this.requestJson(`${BACKEND_BASE_URL}/api/slide/database/presets`);
      if (result.code !== 0) {
        if (requestToken !== this.loadDatabasesRequestToken) return { ok: false };
        runInAction(() => {
          this.loadFailureMessage = result.message || 'Failed to load databases';
        });
        return { ok: false };
      }
      const currentKey = `${result.data.endpointKeyCurrent ?? ''}`;
      const databaseItemsRaw = Array.isArray(result.data.databaseItems)
        ? result.data.databaseItems
        : [];
      if (requestToken !== this.loadDatabasesRequestToken) return { ok: false };
      runInAction(() => {
        this.endpointKeyCurrent = currentKey;
        this.databaseItems = this.normalizeDatabaseItems(databaseItemsRaw, currentKey);
        this.loadFailureMessage = '';
      });
      return { ok: true };
    } finally {
      if (requestToken !== this.loadDatabasesRequestToken) return;
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
      if (!result.data?.databaseItem) {
        runInAction(() => {
          this.loadFailureMessage = 'Invalid database test response';
        });
        return { ok: false, message: 'Invalid database test response' };
      }
      const testedItem = this.normalizeDatabaseItems(
        [result.data.databaseItem],
        this.endpointKeyCurrent,
      )[0];
      const isTestOk = result.code === 0;
      runInAction(() => {
        this.databaseItems = this.databaseItems.map((item) => {
          if (item.key !== testedItem.key) return item;
          return {
            ...item,
            ...testedItem,
          };
        });
        this.loadFailureMessage = isTestOk
          ? ''
          : result.message || 'Failed to test object-storage';
      });
      return {
        ok: isTestOk,
        message: result.message,
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
    if (this.isDatabaseSwitching) {
      return {
        ok: false,
        isSelected: false,
        isBusy: true,
        message: 'Switch in progress',
      };
    }
    runInAction(() => {
      this.isDatabaseSwitching = true;
      this.loadFailureMessage = '';
    });
    try {
      const result = await this.requestJson(`${BACKEND_BASE_URL}/api/slide/database/switch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ databaseKey }),
      });
      const isSwitchOk = result.code === 0;
      const message = result.message;
      const nextCurrentKey = `${result.data?.endpointKeyCurrent ?? ''}`.trim();
      const switchDatabaseItemRaw = result.data?.databaseItem ?? null;
      const switchDatabaseItem = switchDatabaseItemRaw
        ? this.normalizeDatabaseItems([switchDatabaseItemRaw], nextCurrentKey || this.endpointKeyCurrent)[0]
        : null;
      runInAction(() => {
        if (nextCurrentKey) {
          this.endpointKeyCurrent = nextCurrentKey;
          this.databaseItems = this.databaseItems.map((item) => ({
            ...item,
            isCurrent: item.key === nextCurrentKey,
          }));
        }
        if (switchDatabaseItem?.key) {
          let isItemUpdated = false;
          this.databaseItems = this.databaseItems.map((item) => {
            if (item.key !== switchDatabaseItem.key) return item;
            isItemUpdated = true;
            return {
              ...item,
              ...switchDatabaseItem,
              isCurrent: item.key === (nextCurrentKey || this.endpointKeyCurrent),
            };
          });
          if (!isItemUpdated) {
            this.databaseItems = [
              ...this.databaseItems,
              {
                ...switchDatabaseItem,
                isCurrent: switchDatabaseItem.key === (nextCurrentKey || this.endpointKeyCurrent),
              },
            ];
          }
        }
        this.loadFailureMessage = isSwitchOk
          ? ''
          : message || 'Failed to switch object-storage';
      });
      const effectiveCurrentKey = nextCurrentKey || this.endpointKeyCurrent;
      const isSelected = effectiveCurrentKey === `${databaseKey ?? ''}`.trim();
      return {
        ok: isSwitchOk,
        isSelected,
        message: message || (isSwitchOk ? '' : 'Failed to switch object-storage'),
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
