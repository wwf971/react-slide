import { makeAutoObservable } from 'mobx';
import { createDemoPersistData } from './slidesPersistStoreUtils';

const cloneData = (data: any) => {
  return JSON.parse(JSON.stringify(data ?? {}));
};

const resolveDefaultBackendBaseUrl = () => {
  if (typeof window !== 'undefined' && window?.location?.origin) {
    return window.location.origin;
  }
  return '';
};

const PERSIST_BACKEND_BASE_URL =
  (import.meta as any)?.env?.VITE_SLIDE_BACKEND_BASE_URL ?? resolveDefaultBackendBaseUrl();

const collectDirtyIds = (dirtyMap: any) => {
  return Object.keys(dirtyMap ?? {}).filter((id) => dirtyMap[id]);
};

const isDirtyStateEmpty = (dirtyState: any) => {
  if (!dirtyState) return true;
  return (
    collectDirtyIds(dirtyState.updatedContainerIds).length === 0 &&
    collectDirtyIds(dirtyState.updatedCompIds).length === 0 &&
    collectDirtyIds(dirtyState.createdContainerIds).length === 0 &&
    collectDirtyIds(dirtyState.deletedContainerIds).length === 0 &&
    collectDirtyIds(dirtyState.createdCompIds).length === 0 &&
    collectDirtyIds(dirtyState.deletedCompIds).length === 0
  );
};

const isMetadataDirty = (dirtyPageStateById: any) => {
  return Object.values(dirtyPageStateById ?? {}).some((dirtyState: any) => {
    return Boolean(dirtyState?.updatedContainerIds?.__metadata__);
  });
};

const sanitizeContainerDataForPersist = (containerData: any) => {
  const nextContainerData = cloneData(containerData ?? {});
  delete nextContainerData.containerSize;
  return nextContainerData;
};

const sanitizeContainerDataMapForPersist = (containerDataById: any) => {
  const output = {};
  Object.entries(containerDataById ?? {}).forEach(([containerId, containerData]) => {
    output[containerId] = sanitizeContainerDataForPersist(containerData);
  });
  return output;
};

const normalizeSlideSnapshot = (snapshot: any) => {
  return {
    metadata: cloneData(snapshot?.metadata ?? {}),
    pageDataById: cloneData(snapshot?.pageDataById ?? {}),
    containerDataById: cloneData(snapshot?.containerDataById ?? {}),
    compDataById: cloneData(snapshot?.compDataById ?? {}),
  };
};

class SlidesPersistStore {
  persistedDataBySlideId: any = {};

  slideItems: any[] = [];

  resourceBytesById: any = {};

  constructor(initialData: any) {
    this.persistedDataBySlideId['local-demo'] = normalizeSlideSnapshot(initialData);
    this.slideItems = [{ id: 'local-demo', name: 'Local Demo' }];
    makeAutoObservable(this, {}, { autoBind: true });
  }

  clearLocalSnapshotCache() {
    this.persistedDataBySlideId = {};
    this.resourceBytesById = {};
    this.slideItems = [];
  }

  getSnapshot(slideId: string = 'local-demo') {
    const existingSnapshot = this.persistedDataBySlideId[slideId];
    if (existingSnapshot) return cloneData(existingSnapshot);
    if (slideId === 'local-demo') {
      const fallbackSnapshot = normalizeSlideSnapshot(createDemoPersistData());
      this.persistedDataBySlideId['local-demo'] = fallbackSnapshot;
      return cloneData(fallbackSnapshot);
    }
    return null;
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

  async listSlides() {
    const result = await this.requestJson(`${PERSIST_BACKEND_BASE_URL}/api/slide/slides`);
    if (!result.isOk) {
      const backendMessage = `${result.payload?.message ?? ''}`.trim();
      return {
        ok: false,
        slides: this.slideItems,
        message: backendMessage
          ? `${backendMessage}. Local Demo is displayed.`
          : 'Slide list could not be loaded. Local Demo is displayed.',
      };
    }
    const slides = Array.isArray(result.payload?.slides) ? result.payload.slides : [];
    this.slideItems = slides.map((slide: any) => ({
      id: `${slide.id ?? ''}`,
      name: `${slide.name ?? ''}`,
    }));
    const activeSlideIdMap = {};
    this.slideItems.forEach((slide) => {
      activeSlideIdMap[slide.id] = true;
    });
    Object.keys(this.persistedDataBySlideId).forEach((slideId) => {
      if (activeSlideIdMap[slideId]) return;
      delete this.persistedDataBySlideId[slideId];
    });
    return { ok: true, slides: this.slideItems };
  }

  async getSlideData(slideId: string) {
    const result = await this.requestJson(
      `${PERSIST_BACKEND_BASE_URL}/api/slide/slides/${slideId}/data`,
    );
    if (!result.isOk || !result.payload?.ok) {
      return { ok: false, data: null, message: 'Failed to load slide data' };
    }
    const data = normalizeSlideSnapshot(result.payload.data ?? {});
    this.persistedDataBySlideId[slideId] = data;
    return { ok: true, data: cloneData(data) };
  }

  async createSlide(name: string) {
    const result = await this.requestJson(`${PERSIST_BACKEND_BASE_URL}/api/slide/slides`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    if (!result.isOk || !result.payload?.ok || !result.payload?.slide) {
      return { ok: false, message: 'Failed to create slide' };
    }
    const slide = {
      id: `${result.payload.slide.id ?? ''}`,
      name: `${result.payload.slide.name ?? ''}`,
    };
    this.slideItems = [...this.slideItems, slide];
    if (result.payload.slide.data) {
      this.persistedDataBySlideId[slide.id] = normalizeSlideSnapshot(result.payload.slide.data);
    }
    return {
      ok: true,
      slide,
      data: this.persistedDataBySlideId[slide.id]
        ? cloneData(this.persistedDataBySlideId[slide.id])
        : null,
    };
  }

  async renameSlide(slideId: string, name: string) {
    const result = await this.requestJson(
      `${PERSIST_BACKEND_BASE_URL}/api/slide/slides/${slideId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      },
    );
    if (!result.isOk || !result.payload?.ok) {
      return { ok: false, message: result.payload?.message ?? 'Failed to rename slide' };
    }
    this.slideItems = this.slideItems.map((item) => {
      if (item.id !== slideId) return item;
      return { ...item, name };
    });
    return { ok: true };
  }

  async reinitDatabase() {
    const result = await this.requestJson(
      `${PERSIST_BACKEND_BASE_URL}/api/slide/admin/reinit-database`,
      {
        method: 'POST',
      },
    );
    if (!result.isOk || !result.payload?.ok) {
      return { ok: false, message: 'Failed to re-initialize database' };
    }
    const slides = Array.isArray(result.payload?.slides) ? result.payload.slides : [];
    this.slideItems = slides.map((slide: any) => ({
      id: `${slide.id ?? ''}`,
      name: `${slide.name ?? ''}`,
    }));
    this.persistedDataBySlideId = {};
    this.resourceBytesById = {};
    return { ok: true, slides: this.slideItems };
  }

  async createResource(kind: 'bytes' | 'text') {
    const result = await this.requestJson(`${PERSIST_BACKEND_BASE_URL}/api/slide/resources`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ kind }),
    });
    if (!result.isOk || !result.payload?.ok) {
      return { ok: false, message: result.payload?.message ?? 'Failed to create resource' };
    }
    return {
      ok: true,
      resourceId: `${result.payload.resourceId ?? ''}`,
    };
  }

  async setResourceBytes(resourceId: string, base64: string) {
    const result = await this.requestJson(
      `${PERSIST_BACKEND_BASE_URL}/api/slide/resources/${resourceId}/bytes`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ base64 }),
      },
    );
    if (!result.isOk || !result.payload?.ok) {
      return { ok: false, message: result.payload?.message ?? 'Failed to save resource bytes' };
    }
    const commaIndex = base64.indexOf(',');
    const rawBase64 = commaIndex >= 0 ? base64.slice(commaIndex + 1) : base64;
    this.resourceBytesById[resourceId] = rawBase64;
    return { ok: true };
  }

  async getResourceBytes(resourceId: string) {
    const cached = this.resourceBytesById[resourceId];
    if (cached) return { ok: true, base64: cached };
    const result = await this.requestJson(
      `${PERSIST_BACKEND_BASE_URL}/api/slide/resources/${resourceId}/bytes`,
    );
    if (!result.isOk || !result.payload?.ok) {
      return { ok: false, message: result.payload?.message ?? 'Failed to load resource bytes' };
    }
    const base64 = `${result.payload.base64 ?? ''}`;
    this.resourceBytesById[resourceId] = base64;
    return { ok: true, base64 };
  }

  async setResourceText(resourceId: string, text: string) {
    const result = await this.requestJson(
      `${PERSIST_BACKEND_BASE_URL}/api/slide/resources/${resourceId}/text`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      },
    );
    if (!result.isOk || !result.payload?.ok) {
      return { ok: false, message: result.payload?.message ?? 'Failed to save resource text' };
    }
    return { ok: true };
  }

  async getResourceText(resourceId: string) {
    const result = await this.requestJson(
      `${PERSIST_BACKEND_BASE_URL}/api/slide/resources/${resourceId}/text`,
    );
    if (!result.isOk || !result.payload?.ok) {
      return { ok: false, message: result.payload?.message ?? 'Failed to load resource text' };
    }
    return { ok: true, text: `${result.payload.text ?? ''}` };
  }

  async deleteSlide(slideId: string) {
    const result = await this.requestJson(`${PERSIST_BACKEND_BASE_URL}/api/slide/slides/${slideId}`, {
      method: 'DELETE',
    });
    if (!result.isOk || !result.payload?.ok) {
      return { ok: false, message: result.payload?.message ?? 'Failed to delete slide' };
    }
    this.slideItems = this.slideItems.filter((item) => item.id !== slideId);
    delete this.persistedDataBySlideId[slideId];
    return { ok: true };
  }

  async deletePage(slideId: string, pageId: string) {
    const result = await this.requestJson(
      `${PERSIST_BACKEND_BASE_URL}/api/slide/slides/${slideId}/pages/${pageId}`,
      {
        method: 'DELETE',
      },
    );
    if (!result.isOk || !result.payload?.ok) {
      return { ok: false, message: result.payload?.message ?? 'Failed to delete page' };
    }
    return { ok: true };
  }

  async dumpDatabaseSnapshot() {
    const result = await this.requestJson(
      `${PERSIST_BACKEND_BASE_URL}/api/slide/admin/dump-database`,
      {
        method: 'POST',
      },
    );
    if (!result.isOk || !result.payload?.ok) {
      return {
        ok: false,
        message: result.payload?.message ?? 'Failed to dump database',
      };
    }
    return {
      ok: true,
      fileName: `${result.payload.fileName ?? ''}`,
      filePath: `${result.payload.filePath ?? ''}`,
      dumpedAt: `${result.payload.dumpedAt ?? ''}`,
    };
  }

  applyDirtyPagesToMemory(
    slideId: string,
    runtimeData: any,
    dirtyPageStateById: any,
    dirtyPageIds: string[],
  ) {
    const persistedData = normalizeSlideSnapshot(
      this.persistedDataBySlideId[slideId] ?? runtimeData ?? {},
    );
    const runtimePageDataById = runtimeData?.pageDataById ?? {};
    const runtimeContainerDataById = runtimeData?.containerDataById ?? {};
    const runtimeCompDataById = runtimeData?.compDataById ?? {};

    if (isMetadataDirty(dirtyPageStateById)) {
      persistedData.metadata = cloneData(runtimeData?.metadata ?? {});
      const nextPageIds = persistedData.metadata?.pageIds ?? [];
      const pageIdSet = new Set(nextPageIds);
      Object.keys(persistedData.pageDataById ?? {}).forEach((pageId) => {
        if (pageIdSet.has(pageId)) return;
        delete persistedData.pageDataById[pageId];
      });
      nextPageIds.forEach((pageId) => {
        const runtimePageData = runtimePageDataById[pageId];
        if (runtimePageData) {
          persistedData.pageDataById[pageId] = cloneData(runtimePageData);
          return;
        }
        if (persistedData.pageDataById[pageId]) return;
        persistedData.pageDataById[pageId] = {
          id: pageId,
          containerIds: [],
        };
      });
    }

    dirtyPageIds.forEach((pageId) => {
      const dirtyState = dirtyPageStateById?.[pageId] ?? {};
      const runtimePageData = runtimePageDataById[pageId];
      if (!runtimePageData) return;

      persistedData.pageDataById[pageId] = cloneData(runtimePageData);

      collectDirtyIds(dirtyState.updatedContainerIds).forEach((containerId) => {
        if (containerId === '__metadata__') return;
        const containerData = runtimeContainerDataById[containerId];
        if (!containerData) return;
        persistedData.containerDataById[containerId] = sanitizeContainerDataForPersist(containerData);
      });
      collectDirtyIds(dirtyState.createdContainerIds).forEach((containerId) => {
        const containerData = runtimeContainerDataById[containerId];
        if (!containerData) return;
        persistedData.containerDataById[containerId] = sanitizeContainerDataForPersist(containerData);
      });
      collectDirtyIds(dirtyState.deletedContainerIds).forEach((containerId) => {
        delete persistedData.containerDataById[containerId];
      });

      collectDirtyIds(dirtyState.updatedCompIds).forEach((compId) => {
        const compData = runtimeCompDataById[compId];
        if (!compData) return;
        persistedData.compDataById[compId] = cloneData(compData);
      });
      collectDirtyIds(dirtyState.createdCompIds).forEach((compId) => {
        const compData = runtimeCompDataById[compId];
        if (!compData) return;
        persistedData.compDataById[compId] = cloneData(compData);
      });
      collectDirtyIds(dirtyState.deletedCompIds).forEach((compId) => {
        delete persistedData.compDataById[compId];
      });
    });
    this.persistedDataBySlideId[slideId] = normalizeSlideSnapshot(persistedData);
  }

  async saveDirtyPages(slideId: string, runtimeData: any, dirtyPageStateById: any) {
    const dirtyPageIds = Object.keys(dirtyPageStateById ?? {}).filter((pageId) => {
      return !isDirtyStateEmpty(dirtyPageStateById[pageId]);
    });
    if (dirtyPageIds.length === 0) {
      return { ok: true, savedPageIds: [] };
    }

    try {
      const response = await fetch(
        `${PERSIST_BACKEND_BASE_URL}/api/slide/slides/${slideId}/save-dirty`,
        {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metadata: runtimeData?.metadata ?? {},
          pageDataById: runtimeData?.pageDataById ?? {},
          containerDataById: sanitizeContainerDataMapForPersist(
            runtimeData?.containerDataById ?? {},
          ),
          compDataById: runtimeData?.compDataById ?? {},
          dirtyPageStateById: dirtyPageStateById ?? {},
        }),
      },
      );

      if (!response.ok) {
        return {
          ok: false,
          savedPageIds: [],
          message: `Save failed: backend status ${response.status}`,
        };
      }

      const result = await response.json();
      if (!result?.ok) {
        return {
          ok: false,
          savedPageIds: [],
          message: result?.message ?? 'Save failed: backend returned error',
        };
      }

      this.applyDirtyPagesToMemory(slideId, runtimeData, dirtyPageStateById, dirtyPageIds);
      return {
        ok: true,
        savedPageIds: result?.savedPageIds ?? dirtyPageIds,
      };
    } catch (_error) {
      return {
        ok: false,
        savedPageIds: [],
        message: 'Save failed: cannot reach backend server',
      };
    }
  }
}

const createDemoPersistStore = () => {
  return new SlidesPersistStore(createDemoPersistData());
};

export { SlidesPersistStore, createDemoPersistData, createDemoPersistStore };
