import React, { createContext, useContext } from 'react';
import { makeAutoObservable, runInAction } from 'mobx';
import { createDemoPersistStore } from './contentPersistStore';
import { getAvailableCompScripts, resolveCompScriptPayload } from './compScript';

const MIN_RATIO_SIZE = 0.03;
const MAX_RATIO_SIZE = 4;

const clamp = (value, min, max) => {
  return Math.min(max, Math.max(min, value));
};

const normalizeRect = (nextRect) => {
  const width = clamp(nextRect.width, MIN_RATIO_SIZE, MAX_RATIO_SIZE);
  const height = clamp(nextRect.height, MIN_RATIO_SIZE, MAX_RATIO_SIZE);
  const left = Number.isFinite(nextRect.left) ? nextRect.left : 0;
  const top = Number.isFinite(nextRect.top) ? nextRect.top : 0;
  return { left, top, width, height };
};

const createEmptyDirtyState = () => {
  return {
    updatedContainerIds: {},
    updatedCompIds: {},
    createdContainerIds: {},
    deletedContainerIds: {},
    createdCompIds: {},
    deletedCompIds: {},
  };
};

const collectDirtyIds = (dirtyMap) => {
  return Object.keys(dirtyMap ?? {}).filter((id) => dirtyMap[id]);
};

const hasDirtyState = (dirtyState) => {
  if (!dirtyState) return false;
  return (
    collectDirtyIds(dirtyState.updatedContainerIds).length > 0 ||
    collectDirtyIds(dirtyState.updatedCompIds).length > 0 ||
    collectDirtyIds(dirtyState.createdContainerIds).length > 0 ||
    collectDirtyIds(dirtyState.deletedContainerIds).length > 0 ||
    collectDirtyIds(dirtyState.createdCompIds).length > 0 ||
    collectDirtyIds(dirtyState.deletedCompIds).length > 0
  );
};

const cloneData = (value) => {
  return JSON.parse(JSON.stringify(value ?? {}));
};

const buildContainerPageMap = (pageDataById) => {
  const output = {};
  Object.entries(pageDataById ?? {}).forEach(([pageId, pageData]: any) => {
    (pageData?.containerIds ?? []).forEach((containerId) => {
      output[containerId] = pageId;
    });
  });
  return output;
};

const toRuntimeContainerDataMap = (containerDataById) => {
  const output = {};
  Object.entries(containerDataById ?? {}).forEach(([containerId, containerData]: any) => {
    output[containerId] = {
      ...(containerData ?? {}),
      containerSize: {
        pixelX: 0,
        pixelY: 0,
      },
    };
  });
  return output;
};

const toPersistContainerDataMap = (containerDataById) => {
  const output = {};
  Object.entries(containerDataById ?? {}).forEach(([containerId, containerData]: any) => {
    const nextContainerData = cloneData(containerData ?? {});
    delete nextContainerData.containerSize;
    output[containerId] = nextContainerData;
  });
  return output;
};

const toSafeLayer = (value, fallback) => {
  if (Number.isFinite(value)) return Math.max(0, Math.floor(value));
  return fallback;
};

const generateRandomToken = (length = 10) => {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += chars[Math.floor(Math.random() * chars.length)];
  }
  return output;
};

const generateTypedId = (prefix, length = 10) => {
  return `${prefix}-${generateRandomToken(length)}`;
};

class SlidesStore {
  metadata: any = {
    pageIds: [] as string[],
    currentPageId: '',
    aspectRatio: { x: 16, y: 9 },
  };
  pageDataById: any = {};
  containerDataById: any = {};
  compDataById: any = {};
  selectedContainerId = '';
  selectedCompId = '';
  editingCompId = '';
  isSlideSurfaceSelected = false;
  slideSurfacePixelSize = {
    pixelX: 0,
    pixelY: 0,
  };
  slidePagePixelSize = {
    pixelX: 0,
    pixelY: 0,
  };
  isPlayMode = false;
  isFullWindowMode = false;
  slidesPersistStore: any = null;
  slideItems: any[] = [{ id: 'local-demo', name: 'Local Demo' }];
  currentSlideId = 'local-demo';
  slideRuntimeBySlideId: any = {};
  dirtyPageStateBySlideId: any = {};
  containerPageIdByContainerId: any = {};
  dirtyPageStateById: any = {};
  isPersisting = false;
  isSlidesInitializing = false;
  isSlideSwitching = false;
  isSlideDeleting = false;
  isPageDeleting = false;
  persistFailureMessage = '';
  temporarySwitcherByPageId: any = {};
  temporaryOverflowVisibleContainerIdMap: any = {};
  temporaryCopiedContainerPayload: any = null;
  resourceTextCacheByResourceId: any = {};

  constructor(seedData: any, slidesPersistStore: any = null) {
    this.slidesPersistStore = slidesPersistStore;
    this.metadata = {
      ...this.metadata,
      ...seedData.metadata,
    };

    Object.entries(seedData.pageDataById ?? {}).forEach(([pageId, pageData]: any) => {
      this.pageDataById[pageId] = { ...pageData };
    });

    this.containerDataById = toRuntimeContainerDataMap(seedData.containerDataById ?? {});

    Object.entries(seedData.compDataById ?? {}).forEach(([compId, compEntry]: any) => {
      this.compDataById[compId] = {
        ...compEntry,
        compData: {
          ...(compEntry.compData ?? {}),
        },
      };
    });

    this.containerPageIdByContainerId = buildContainerPageMap(this.pageDataById);
    this.normalizeAllContainerLayers();
    this.slideRuntimeBySlideId[this.currentSlideId] = this.buildRuntimeSnapshot();
    this.dirtyPageStateBySlideId[this.currentSlideId] = cloneData(this.dirtyPageStateById);

    makeAutoObservable(this, {}, { autoBind: true });
  }

  getAvailableCompNames() {
    return [
      'CompTextSingleline',
      'CompTextMultline',
      'CompCode',
      'CompImage',
      'CompMetadata',
      'CompExcalidraw',
      'CompIFrame',
      'CompUrl',
    ];
  }

  getAvailableCompScripts() {
    return getAvailableCompScripts();
  }

  createDefaultCompData(compName) {
    if (compName === 'CompTextSingleline') {
      return {
        text: 'New line',
        initialPixelSize: { pixelX: 200, pixelY: 24 },
        fontScale: 1,
        fontScaleUnit: '1/100 slide width',
      };
    }
    if (compName === 'CompTextMultline') {
      return {
        text: 'New text',
        initialPixelSize: { pixelX: 220, pixelY: 80 },
        fontScale: 1,
        fontScaleUnit: '1/100 slide width',
      };
    }
    if (compName === 'CompCode') {
      return {
        codeText: "function greet(name) {\n  return `Hello, ${name}`;\n}",
        language: 'javascript',
        backgroundColor: '#111827',
        fontScale: 1,
        fontScaleUnit: '1/100 slide width',
      };
    }
    if (compName === 'CompImage' || compName === 'CompImageExample') {
      return {
        isCover: true,
        imageResourceId: '',
        imageMimeType: 'image/png',
        imageUrl: '',
      };
    }
    if (compName === 'CompExcalidraw') {
      return {
        sceneResourceId: '',
        sceneVersion: 1,
        sceneViewport: null,
      };
    }
    if (compName === 'CompIFrame') {
      return {
        url: 'https://example.com',
        iframeSizeRatioBySlideWidth: {
          width: 0.7,
          height: 0.42,
        },
        fontScale: 1.2,
        fontScaleUnit: '1/100 slide width',
        isIframeActive: false,
      };
    }
    if (compName === 'CompUrl') {
      return {
        url: 'https://example.com',
        fontScale: 1.2,
        fontScaleUnit: '1/100 slide width',
      };
    }
    return {
      title: 'New',
      note: '-',
    };
  }

  replaceRuntimeData(snapshot) {
    this.metadata = {
      pageIds: [],
      currentPageId: '',
      aspectRatio: { x: 16, y: 9 },
      ...(snapshot?.metadata ?? {}),
    };
    this.pageDataById = cloneData(snapshot?.pageDataById ?? {});
    this.containerDataById = toRuntimeContainerDataMap(snapshot?.containerDataById ?? {});
    this.compDataById = cloneData(snapshot?.compDataById ?? {});
    this.containerPageIdByContainerId = buildContainerPageMap(this.pageDataById);
    this.normalizeAllContainerLayers();
    this.dirtyPageStateById = {};
    this.selectedContainerId = '';
    this.selectedCompId = '';
    this.editingCompId = '';
    this.isSlideSurfaceSelected = false;
    this.slideSurfacePixelSize = {
      pixelX: 0,
      pixelY: 0,
    };
    this.slidePagePixelSize = {
      pixelX: 0,
      pixelY: 0,
    };
    this.isPlayMode = false;
    this.temporarySwitcherByPageId = {};
    this.temporaryOverflowVisibleContainerIdMap = {};
    this.resourceTextCacheByResourceId = {};
    this.temporaryCopiedContainerPayload = null;
  }

  buildRuntimeSnapshot() {
    return {
      metadata: cloneData(this.metadata ?? {}),
      pageDataById: cloneData(this.pageDataById ?? {}),
      containerDataById: toPersistContainerDataMap(this.containerDataById ?? {}),
      compDataById: cloneData(this.compDataById ?? {}),
    };
  }

  cacheCurrentSlideState() {
    const slideId = this.currentSlideId;
    if (!slideId) return;
    this.slideRuntimeBySlideId[slideId] = this.buildRuntimeSnapshot();
    this.dirtyPageStateBySlideId[slideId] = cloneData(this.dirtyPageStateById ?? {});
  }

  restoreSlideStateFromCache(slideId) {
    const cachedSnapshot = this.slideRuntimeBySlideId[slideId];
    if (!cachedSnapshot) return false;
    this.replaceRuntimeData(cachedSnapshot);
    this.dirtyPageStateById = cloneData(this.dirtyPageStateBySlideId[slideId] ?? {});
    return true;
  }

  async requestInitializeSlides() {
    if (this.isSlidesInitializing) return;
    if (!this.slidesPersistStore) return;
    runInAction(() => {
      this.isSlidesInitializing = true;
    });
    try {
      const result = await this.slidesPersistStore.listSlides();
      if (!result?.ok || !Array.isArray(result.slides) || result.slides.length === 0) {
        runInAction(() => {
          this.persistFailureMessage = result?.message ?? 'Failed to initialize slides';
        });
        return;
      }
      runInAction(() => {
        this.slideItems = result.slides;
        this.currentSlideId = result.slides[0].id;
        this.slideRuntimeBySlideId = {};
        this.dirtyPageStateBySlideId = {};
      });
      const loadResult = await this.slidesPersistStore.getSlideData(this.currentSlideId);
      if (!loadResult?.ok || !loadResult.data) {
        runInAction(() => {
          this.persistFailureMessage = loadResult?.message ?? 'Failed to load slide data';
        });
        return;
      }
      runInAction(() => {
        this.replaceRuntimeData(loadResult.data);
        this.cacheCurrentSlideState();
        this.persistFailureMessage = '';
      });
    } finally {
      runInAction(() => {
        this.isSlidesInitializing = false;
      });
    }
  }

  async requestSwitchSlide(slideId) {
    if (!slideId || this.currentSlideId === slideId) return;
    if (this.isPersisting || this.isSlideSwitching) return;
    this.cacheCurrentSlideState();
    runInAction(() => {
      this.isSlideSwitching = true;
    });
    try {
      const isRestoredFromCache = this.restoreSlideStateFromCache(slideId);
      if (isRestoredFromCache) {
        runInAction(() => {
          this.currentSlideId = slideId;
          this.persistFailureMessage = '';
        });
        return { ok: true };
      }
      const loadResult = await this.slidesPersistStore.getSlideData(slideId);
      if (!loadResult?.ok || !loadResult.data) {
        runInAction(() => {
          this.persistFailureMessage = loadResult?.message ?? 'Failed to switch slide';
        });
        return;
      }
      runInAction(() => {
        this.currentSlideId = slideId;
        this.replaceRuntimeData(loadResult.data);
        this.cacheCurrentSlideState();
        this.persistFailureMessage = '';
      });
    } finally {
      runInAction(() => {
        this.isSlideSwitching = false;
      });
    }
    return { ok: true };
  }

  async requestCreateSlide(name) {
    if (this.isPersisting || this.isSlideSwitching) return { ok: false };
    const result = await this.slidesPersistStore.createSlide(name);
    if (!result?.ok || !result.slide) {
      runInAction(() => {
        this.persistFailureMessage = result?.message ?? 'Failed to create slide';
      });
      return { ok: false };
    }
    runInAction(() => {
      this.slideItems = [...this.slideItems, result.slide];
      this.currentSlideId = result.slide.id;
    });
    if (result.data) {
      runInAction(() => {
        this.replaceRuntimeData(result.data);
        this.cacheCurrentSlideState();
      });
    } else {
      const loadResult = await this.slidesPersistStore.getSlideData(result.slide.id);
      if (loadResult?.ok && loadResult.data) {
        runInAction(() => {
          this.replaceRuntimeData(loadResult.data);
          this.cacheCurrentSlideState();
        });
      }
    }
    runInAction(() => {
      this.persistFailureMessage = '';
    });
    return { ok: true };
  }

  async requestRenameCurrentSlide(name) {
    const nextName = `${name ?? ''}`.trim();
    if (!nextName) return { ok: false };
    const result = await this.slidesPersistStore.renameSlide(this.currentSlideId, nextName);
    if (!result?.ok) {
      runInAction(() => {
        this.persistFailureMessage = result?.message ?? 'Failed to rename slide';
      });
      return { ok: false };
    }
    runInAction(() => {
      this.slideItems = this.slideItems.map((item) => {
        if (item.id !== this.currentSlideId) return item;
        return { ...item, name: nextName };
      });
      this.persistFailureMessage = '';
    });
    return { ok: true };
  }

  async requestReinitDatabase() {
    if (this.isPersisting || this.isSlideSwitching) return { ok: false };
    const result = await this.slidesPersistStore.reinitDatabase();
    if (!result?.ok || !Array.isArray(result.slides) || result.slides.length === 0) {
      runInAction(() => {
        this.persistFailureMessage = result?.message ?? 'Failed to re-initialize database';
      });
      return { ok: false };
    }
    runInAction(() => {
      this.slideItems = result.slides;
      this.currentSlideId = result.slides[0].id;
      this.slideRuntimeBySlideId = {};
      this.dirtyPageStateBySlideId = {};
    });
    const loadResult = await this.slidesPersistStore.getSlideData(this.currentSlideId);
    if (!loadResult?.ok || !loadResult.data) {
      runInAction(() => {
        this.persistFailureMessage = loadResult?.message ?? 'Failed to load slide after re-init';
      });
      return { ok: false };
    }
    runInAction(() => {
      this.replaceRuntimeData(loadResult.data);
      this.cacheCurrentSlideState();
      this.persistFailureMessage = '';
    });
    return { ok: true };
  }

  async requestCreateBytesResource() {
    if (!this.slidesPersistStore) return { ok: false };
    const result = await this.slidesPersistStore.createResource('bytes');
    if (!result?.ok) {
      runInAction(() => {
        this.persistFailureMessage = result?.message ?? 'Failed to create resource';
      });
      return { ok: false };
    }
    return { ok: true, resourceId: result.resourceId };
  }

  async requestSetResourceBytes(resourceId, base64) {
    if (!this.slidesPersistStore) return { ok: false };
    const result = await this.slidesPersistStore.setResourceBytes(resourceId, base64);
    if (!result?.ok) {
      runInAction(() => {
        this.persistFailureMessage = result?.message ?? 'Failed to save resource bytes';
      });
      return { ok: false };
    }
    return { ok: true };
  }

  async requestGetResourceBytes(resourceId) {
    if (!this.slidesPersistStore) return { ok: false, base64: '' };
    const result = await this.slidesPersistStore.getResourceBytes(resourceId);
    if (!result?.ok) {
      runInAction(() => {
        this.persistFailureMessage = result?.message ?? 'Failed to load resource bytes';
      });
      return { ok: false, base64: '' };
    }
    return { ok: true, base64: result.base64 ?? '' };
  }

  async requestCreateTextResource() {
    if (!this.slidesPersistStore) return { ok: false };
    const result = await this.slidesPersistStore.createResource('text');
    if (!result?.ok) {
      runInAction(() => {
        this.persistFailureMessage = result?.message ?? 'Failed to create text resource';
      });
      return { ok: false };
    }
    return { ok: true, resourceId: result.resourceId };
  }

  async requestSetResourceText(resourceId, text) {
    if (!resourceId) return { ok: false };
    this.resourceTextCacheByResourceId[resourceId] = text;
    if (!this.slidesPersistStore) return { ok: true };
    const result = await this.slidesPersistStore.setResourceText(resourceId, text);
    if (!result?.ok) {
      runInAction(() => {
        this.persistFailureMessage = result?.message ?? 'Failed to save resource text';
      });
      return { ok: false };
    }
    return { ok: true };
  }

  async requestGetResourceText(resourceId) {
    if (!resourceId) return { ok: false, text: '' };
    const cachedText = this.resourceTextCacheByResourceId[resourceId];
    if (typeof cachedText === 'string') {
      return { ok: true, text: cachedText };
    }
    if (!this.slidesPersistStore) return { ok: false, text: '' };
    const result = await this.slidesPersistStore.getResourceText(resourceId);
    if (!result?.ok) {
      runInAction(() => {
        this.persistFailureMessage = result?.message ?? 'Failed to load resource text';
      });
      return { ok: false, text: '' };
    }
    const loadedText = result.text ?? '';
    this.resourceTextCacheByResourceId[resourceId] = loadedText;
    return { ok: true, text: loadedText };
  }

  async requestDeleteCurrentSlide() {
    if (this.isPersisting || this.isSlideSwitching || this.isSlideDeleting) {
      return { ok: false };
    }
    if (!this.slidesPersistStore) {
      return { ok: false };
    }
    const deletingSlideId = this.currentSlideId;
    if (!deletingSlideId) return { ok: false };
    this.cacheCurrentSlideState();
    runInAction(() => {
      this.isSlideDeleting = true;
      this.persistFailureMessage = '';
    });
    try {
      const result = await this.slidesPersistStore.deleteSlide(deletingSlideId);
      if (!result?.ok) {
        runInAction(() => {
          this.persistFailureMessage = result?.message ?? 'Failed to delete slide';
        });
        return { ok: false };
      }

      const listResult = await this.slidesPersistStore.listSlides();
      const listedSlides = Array.isArray(listResult?.slides) ? listResult.slides : [];
      const nextSlideItems =
        listResult?.ok && listedSlides.length > 0
          ? listedSlides
          : this.slideItems.filter((item) => item.id !== deletingSlideId);
      delete this.slideRuntimeBySlideId[deletingSlideId];
      delete this.dirtyPageStateBySlideId[deletingSlideId];
      if (nextSlideItems.length === 0) {
        runInAction(() => {
          this.slideItems = [];
          this.currentSlideId = '';
          this.slideRuntimeBySlideId = {};
          this.dirtyPageStateBySlideId = {};
          this.replaceRuntimeData({
            metadata: {
              pageIds: [],
              currentPageId: '',
              aspectRatio: { x: 16, y: 9 },
            },
            pageDataById: {},
            containerDataById: {},
            compDataById: {},
          });
          this.persistFailureMessage = '';
        });
        return { ok: true };
      }

      const nextSlideId = nextSlideItems[0].id;
      runInAction(() => {
        this.slideItems = nextSlideItems;
        this.currentSlideId = nextSlideId;
      });
      const isRestoredFromCache = this.restoreSlideStateFromCache(nextSlideId);
      if (isRestoredFromCache) {
        runInAction(() => {
          this.persistFailureMessage = '';
        });
        return { ok: true };
      }
      const loadResult = await this.slidesPersistStore.getSlideData(nextSlideId);
      if (!loadResult?.ok || !loadResult.data) {
        runInAction(() => {
          this.persistFailureMessage = loadResult?.message ?? 'Failed to load slide after delete';
        });
        return { ok: false };
      }
      runInAction(() => {
        this.replaceRuntimeData(loadResult.data);
        this.cacheCurrentSlideState();
        this.persistFailureMessage = '';
      });
      return { ok: true };
    } finally {
      runInAction(() => {
        this.isSlideDeleting = false;
      });
    }
  }

  async requestDeleteCurrentPage() {
    if (this.isPersisting || this.isSlideSwitching || this.isSlideDeleting || this.isPageDeleting) {
      return { ok: false };
    }
    if (!this.slidesPersistStore) {
      return { ok: false };
    }
    const deletingSlideId = this.currentSlideId;
    const deletingPageId = this.metadata.currentPageId || '';
    if (!deletingSlideId || !deletingPageId) return { ok: false };
    if ((this.metadata.pageIds ?? []).length <= 1) {
      return { ok: false, message: 'cannot delete the last page' };
    }
    if (this.hasDirtyPages()) {
      const saveResult = await this.requestPersistDirtyPages();
      if (!saveResult?.ok) {
        return { ok: false };
      }
    }
    runInAction(() => {
      this.isPageDeleting = true;
      this.persistFailureMessage = '';
    });
    try {
      const result = await this.slidesPersistStore.deletePage(deletingSlideId, deletingPageId);
      if (!result?.ok) {
        runInAction(() => {
          this.persistFailureMessage = result?.message ?? 'Failed to delete page';
        });
        return { ok: false };
      }

      const loadResult = await this.slidesPersistStore.getSlideData(deletingSlideId);
      if (!loadResult?.ok || !loadResult.data) {
        runInAction(() => {
          this.persistFailureMessage = loadResult?.message ?? 'Failed to load slide after delete page';
        });
        return { ok: false };
      }
      runInAction(() => {
        this.replaceRuntimeData(loadResult.data);
        this.cacheCurrentSlideState();
        this.persistFailureMessage = '';
      });
      return { ok: true };
    } finally {
      runInAction(() => {
        this.isPageDeleting = false;
      });
    }
  }

  async requestDumpDatabaseSnapshot() {
    if (!this.slidesPersistStore?.dumpDatabaseSnapshot) return { ok: false };
    const result = await this.slidesPersistStore.dumpDatabaseSnapshot();
    if (!result?.ok) {
      runInAction(() => {
        this.persistFailureMessage = result?.message ?? 'Failed to dump database';
      });
      return { ok: false };
    }
    runInAction(() => {
      this.persistFailureMessage = '';
    });
    return result;
  }

  ensurePageDirtyState(pageId) {
    if (!pageId) return createEmptyDirtyState();
    if (!this.dirtyPageStateById[pageId]) {
      this.dirtyPageStateById[pageId] = createEmptyDirtyState();
    }
    return this.dirtyPageStateById[pageId];
  }

  markContainerDirty(containerId, dirtyType = 'updated', targetPageId = '') {
    const pageId = targetPageId || this.containerPageIdByContainerId[containerId];
    if (!pageId) return;
    const dirtyState = this.ensurePageDirtyState(pageId);
    if (dirtyType === 'created') {
      dirtyState.createdContainerIds[containerId] = true;
      delete dirtyState.deletedContainerIds[containerId];
      return;
    }
    if (dirtyType === 'deleted') {
      dirtyState.deletedContainerIds[containerId] = true;
      delete dirtyState.createdContainerIds[containerId];
      delete dirtyState.updatedContainerIds[containerId];
      return;
    }
    if (!dirtyState.createdContainerIds[containerId]) {
      dirtyState.updatedContainerIds[containerId] = true;
    }
  }

  markCompDirtyByContainerId(containerId, dirtyType = 'updated') {
    const containerData = this.getContainerData(containerId);
    const compId = containerData?.compId;
    if (!compId) return;
    const pageId = this.containerPageIdByContainerId[containerId];
    if (!pageId) return;
    const dirtyState = this.ensurePageDirtyState(pageId);
    if (dirtyType === 'created') {
      dirtyState.createdCompIds[compId] = true;
      delete dirtyState.deletedCompIds[compId];
      return;
    }
    if (dirtyType === 'deleted') {
      dirtyState.deletedCompIds[compId] = true;
      delete dirtyState.createdCompIds[compId];
      delete dirtyState.updatedCompIds[compId];
      return;
    }
    if (!dirtyState.createdCompIds[compId]) {
      dirtyState.updatedCompIds[compId] = true;
    }
  }

  clearDirtyState(pageId) {
    if (!pageId) return;
    this.dirtyPageStateById[pageId] = createEmptyDirtyState();
  }

  markMetadataDirty() {
    const pageId = this.metadata.currentPageId || this.metadata.pageIds[0] || '';
    if (!pageId) return;
    const dirtyState = this.ensurePageDirtyState(pageId);
    dirtyState.updatedContainerIds.__metadata__ = true;
  }

  isPageDirty(pageId) {
    return hasDirtyState(this.dirtyPageStateById[pageId]);
  }

  hasDirtyPages() {
    return Object.keys(this.dirtyPageStateById).some((pageId) => this.isPageDirty(pageId));
  }

  getDirtyPageIds() {
    return this.metadata.pageIds.filter((pageId) => this.isPageDirty(pageId));
  }

  async requestPersistDirtyPages() {
    if (this.isPersisting) return { ok: false, savedPageIds: [] };
    if (!this.slidesPersistStore) return { ok: false, savedPageIds: [] };
    if (!this.currentSlideId) return { ok: false, savedPageIds: [] };
    const dirtyPageIds = this.getDirtyPageIds();
    if (dirtyPageIds.length === 0) return { ok: true, savedPageIds: [] };

    runInAction(() => {
      this.isPersisting = true;
    });
    try {
      runInAction(() => {
        this.persistFailureMessage = '';
      });
      const result = await this.slidesPersistStore.saveDirtyPages(
        this.currentSlideId,
        {
          metadata: this.metadata,
          pageDataById: this.pageDataById,
          containerDataById: this.containerDataById,
          compDataById: this.compDataById,
        },
        this.dirtyPageStateById,
      );
      if (result?.ok) {
        runInAction(() => {
          (result.savedPageIds ?? []).forEach((pageId) => this.clearDirtyState(pageId));
          this.cacheCurrentSlideState();
          this.persistFailureMessage = '';
        });
      } else {
        runInAction(() => {
          this.persistFailureMessage = result?.message ?? 'Save failed in persistent store';
        });
      }
      return result ?? { ok: false, savedPageIds: [] };
    } catch (_error) {
      runInAction(() => {
        this.persistFailureMessage = 'Save failed in persistent store';
      });
      return { ok: false, savedPageIds: [] };
    } finally {
      runInAction(() => {
        this.isPersisting = false;
      });
    }
  }

  getCurrentPageData() {
    return this.getPageData(this.metadata.currentPageId);
  }

  getPageData(pageId) {
    return this.pageDataById[pageId] ?? null;
  }

  getFirstPageData() {
    const firstPageId = this.metadata.pageIds[0];
    if (!firstPageId) return null;
    return this.getPageData(firstPageId);
  }

  getCurrentPageIndex(pageId) {
    const currentIndex = this.metadata.pageIds.findIndex((id) => id === pageId);
    if (currentIndex < 0) return -1;
    return currentIndex + 1;
  }

  getTotalPageIndex(_pageId) {
    return this.metadata.pageIds.length;
  }

  getNextPageData(pageId) {
    const currentIndex = this.metadata.pageIds.findIndex((id) => id === pageId);
    if (currentIndex < 0) return null;
    return this.getPageData(this.metadata.pageIds[currentIndex + 1] ?? '');
  }

  getPrevPageData(pageId) {
    const currentIndex = this.metadata.pageIds.findIndex((id) => id === pageId);
    if (currentIndex < 0) return null;
    return this.getPageData(this.metadata.pageIds[currentIndex - 1] ?? '');
  }

  getPageAspectRatio() {
    const { x, y } = this.metadata.aspectRatio;
    if (!x || !y) return 1;
    return x / y;
  }

  getPageContainers(pageId) {
    const pageData = this.getPageData(pageId);
    if (!pageData) return [];
    const containers = (pageData.containerIds ?? [])
      .map((containerId) => this.containerDataById[containerId])
      .filter(Boolean);
    return containers.sort((containerA, containerB) => {
      const layerA = toSafeLayer(containerA?.layer, 0);
      const layerB = toSafeLayer(containerB?.layer, 0);
      return layerA - layerB;
    });
  }

  getContainerData(containerId) {
    return this.containerDataById[containerId] ?? null;
  }

  getCompData(compId) {
    return this.compDataById[compId] ?? null;
  }

  getContainerCompData(containerId) {
    const containerData = this.getContainerData(containerId);
    if (!containerData) return null;
    return this.getCompData(containerData.compId);
  }

  getContainerSize(containerId) {
    const containerData = this.getContainerData(containerId);
    if (!containerData) return { pixelX: 0, pixelY: 0 };
    return containerData.containerSize ?? { pixelX: 0, pixelY: 0 };
  }

  getTemporarySwitcher(pageId) {
    if (!pageId) return null;
    return this.temporarySwitcherByPageId[pageId] ?? null;
  }

  openTemporarySwitcher(pageId, anchorPoint: any = null) {
    if (this.isPersisting) return { ok: false };
    if (!pageId) return { ok: false };
    const safeX = clamp(anchorPoint?.x ?? 0.2, 0, 1);
    const safeY = clamp(anchorPoint?.y ?? 0.2, 0, 1);
    this.temporarySwitcherByPageId[pageId] = {
      id: generateTypedId('tmp-switcher'),
      anchorPoint: { x: safeX, y: safeY },
      text: '',
    };
    this.clearSelectedContainer();
    this.clearSlideSurfaceSelected();
    return { ok: true };
  }

  updateTemporarySwitcherText(pageId, text) {
    const temporarySwitcher = this.getTemporarySwitcher(pageId);
    if (!temporarySwitcher) return;
    this.temporarySwitcherByPageId[pageId] = {
      ...temporarySwitcher,
      text: `${text ?? ''}`,
    };
  }

  closeTemporarySwitcher(pageId) {
    if (!pageId) return;
    delete this.temporarySwitcherByPageId[pageId];
  }

  setContainerOverflowVisible(containerId, isVisible) {
    if (!containerId) return;
    if (isVisible) {
      if (this.temporaryOverflowVisibleContainerIdMap[containerId] === true) return;
      this.temporaryOverflowVisibleContainerIdMap = {
        ...this.temporaryOverflowVisibleContainerIdMap,
        [containerId]: true,
      };
      return;
    }
    if (this.temporaryOverflowVisibleContainerIdMap[containerId] !== true) return;
    const nextMap = {
      ...this.temporaryOverflowVisibleContainerIdMap,
    };
    delete nextMap[containerId];
    this.temporaryOverflowVisibleContainerIdMap = nextMap;
  }

  getIsContainerOverflowVisible(containerId) {
    if (!containerId) return false;
    return this.temporaryOverflowVisibleContainerIdMap[containerId] === true;
  }

  getHasCopiedContainer() {
    return Boolean(this.temporaryCopiedContainerPayload?.containerSnapshot);
  }

  requestCopyContainer(containerId) {
    const containerData = this.getContainerData(containerId);
    if (!containerData?.compId) return { ok: false };
    const compData = this.getCompData(containerData.compId);
    if (!compData) return { ok: false };
    this.temporaryCopiedContainerPayload = {
      sourceContainerId: containerId,
      containerSnapshot: {
        size: {
          x: Number(containerData.size?.x ?? 0.28),
          y: Number(containerData.size?.y ?? 0.22),
        },
        compId: containerData.compId,
      },
    };
    return { ok: true };
  }

  requestPasteCopiedContainerToPage(targetPageId, anchorPoint: any = null) {
    if (this.isPersisting) return { ok: false };
    const copiedPayload = this.temporaryCopiedContainerPayload?.containerSnapshot;
    if (!copiedPayload?.compId) return { ok: false };
    const compData = this.getCompData(copiedPayload.compId);
    if (!compData) return { ok: false };
    const pageData = this.getPageData(targetPageId);
    if (!pageData) return { ok: false };

    const width = clamp(Number(copiedPayload.size?.x ?? 0.28), MIN_RATIO_SIZE, MAX_RATIO_SIZE);
    const height = clamp(Number(copiedPayload.size?.y ?? 0.22), MIN_RATIO_SIZE, MAX_RATIO_SIZE);
    const anchorX = Number.isFinite(anchorPoint?.x) ? anchorPoint.x : 0.5;
    const anchorY = Number.isFinite(anchorPoint?.y) ? anchorPoint.y : 0.5;
    const left = clamp(anchorX - width / 2, -MAX_RATIO_SIZE, MAX_RATIO_SIZE);
    const top = clamp(anchorY - height / 2, -MAX_RATIO_SIZE, MAX_RATIO_SIZE);

    const containerId = generateTypedId('ctr');
    this.containerDataById[containerId] = {
      id: containerId,
      pos: { x: left, y: top },
      size: { x: width, y: height },
      compId: copiedPayload.compId,
      layer: (pageData.containerIds ?? []).length,
      containerSize: { pixelX: 0, pixelY: 0 },
    };
    this.pageDataById[targetPageId] = {
      ...pageData,
      containerIds: [...(pageData.containerIds ?? []), containerId],
    };
    this.containerPageIdByContainerId[containerId] = targetPageId;
    this.markContainerDirty(containerId, 'created');
    this.setSelectedContainer(containerId);
    return { ok: true, containerId };
  }

  setCurrentPage(pageId) {
    if (!this.pageDataById[pageId]) return;
    this.metadata.currentPageId = pageId;
    this.isSlideSurfaceSelected = false;
  }

  setSelectedContainer(containerId) {
    const containerData = this.getContainerData(containerId);
    if (!containerData) return;
    this.selectedContainerId = containerId;
    this.selectedCompId = containerData.compId ?? '';
    if (this.editingCompId && this.editingCompId !== this.selectedCompId) {
      this.editingCompId = '';
    }
    this.isSlideSurfaceSelected = false;
  }

  clearSelectedContainer() {
    this.selectedContainerId = '';
    this.selectedCompId = '';
    this.editingCompId = '';
  }

  setSlideSurfaceSelected() {
    this.isSlideSurfaceSelected = true;
    this.selectedContainerId = '';
    this.selectedCompId = '';
    this.editingCompId = '';
  }

  clearSlideSurfaceSelected() {
    this.isSlideSurfaceSelected = false;
  }

  getIsPlayMode() {
    return this.isPlayMode === true;
  }

  setPlayMode(isPlayMode) {
    this.isPlayMode = isPlayMode === true;
  }

  togglePlayMode() {
    this.isPlayMode = !this.isPlayMode;
  }

  getIsFullWindowMode() {
    return this.isFullWindowMode === true;
  }

  setIsFullWindowMode(isFullWindowMode) {
    this.isFullWindowMode = isFullWindowMode === true;
  }

  getSlideSurfacePixelSize() {
    return this.slideSurfacePixelSize ?? { pixelX: 0, pixelY: 0 };
  }

  setSlideSurfacePixelSize(nextPixelSize) {
    const safePixelX = Math.max(0, Math.round(nextPixelSize?.pixelX ?? 0));
    const safePixelY = Math.max(0, Math.round(nextPixelSize?.pixelY ?? 0));
    if (
      this.slideSurfacePixelSize.pixelX === safePixelX &&
      this.slideSurfacePixelSize.pixelY === safePixelY
    ) {
      return;
    }
    this.slideSurfacePixelSize = {
      pixelX: safePixelX,
      pixelY: safePixelY,
    };
  }

  getSlidePagePixelSize() {
    return this.slidePagePixelSize ?? { pixelX: 0, pixelY: 0 };
  }

  setSlidePagePixelSize(nextPixelSize) {
    const safePixelX = Math.max(0, Math.round(nextPixelSize?.pixelX ?? 0));
    const safePixelY = Math.max(0, Math.round(nextPixelSize?.pixelY ?? 0));
    if (
      this.slidePagePixelSize.pixelX === safePixelX &&
      this.slidePagePixelSize.pixelY === safePixelY
    ) {
      return;
    }
    this.slidePagePixelSize = {
      pixelX: safePixelX,
      pixelY: safePixelY,
    };
  }

  requestMovePageToIndex(pageId, nextIndex) {
    const pageIds = [...(this.metadata.pageIds ?? [])];
    const currentIndex = pageIds.findIndex((id) => id === pageId);
    if (currentIndex < 0) return { ok: false };
    const safeIndex = Math.max(0, Math.min(pageIds.length - 1, nextIndex));
    if (safeIndex === currentIndex) return { ok: false };
    const [movingPageId] = pageIds.splice(currentIndex, 1);
    pageIds.splice(safeIndex, 0, movingPageId);
    this.metadata = {
      ...this.metadata,
      pageIds,
    };
    this.markMetadataDirty();
    return { ok: true };
  }

  requestMoveCurrentPageByOffset(offset) {
    const currentPageId = this.metadata.currentPageId || '';
    if (!currentPageId) return { ok: false };
    const pageIds = this.metadata.pageIds ?? [];
    const currentIndex = pageIds.findIndex((id) => id === currentPageId);
    if (currentIndex < 0) return { ok: false };
    return this.requestMovePageToIndex(currentPageId, currentIndex + offset);
  }

  requestCreatePageAfterCurrent() {
    if (this.isPersisting) return { ok: false };
    const currentPageId = this.metadata.currentPageId || '';
    const currentPageIds = [...(this.metadata.pageIds ?? [])];
    const currentPageIndex = currentPageIds.findIndex((pageId) => pageId === currentPageId);
    const insertIndex = currentPageIndex >= 0 ? currentPageIndex + 1 : currentPageIds.length;
    const nextPageId = generateTypedId('page');
    this.pageDataById[nextPageId] = {
      id: nextPageId,
      containerIds: [],
    };
    currentPageIds.splice(insertIndex, 0, nextPageId);
    this.metadata = {
      ...this.metadata,
      pageIds: currentPageIds,
      currentPageId: nextPageId,
    };
    this.clearSelectedContainer();
    this.clearSlideSurfaceSelected();
    this.markMetadataDirty();
    return { ok: true, pageId: nextPageId };
  }

  requestCreatePageBeforeCurrent() {
    if (this.isPersisting) return { ok: false };
    const currentPageId = this.metadata.currentPageId || '';
    const currentPageIds = [...(this.metadata.pageIds ?? [])];
    const currentPageIndex = currentPageIds.findIndex((pageId) => pageId === currentPageId);
    const insertIndex = currentPageIndex >= 0 ? currentPageIndex : currentPageIds.length;
    const nextPageId = generateTypedId('page');
    this.pageDataById[nextPageId] = {
      id: nextPageId,
      containerIds: [],
    };
    currentPageIds.splice(insertIndex, 0, nextPageId);
    this.metadata = {
      ...this.metadata,
      pageIds: currentPageIds,
      currentPageId: nextPageId,
    };
    this.clearSelectedContainer();
    this.clearSlideSurfaceSelected();
    this.markMetadataDirty();
    return { ok: true, pageId: nextPageId };
  }

  setEditingComp(compId) {
    const compData = this.getCompData(compId);
    if (!compData) return;
    this.editingCompId = compId;
  }

  clearEditingComp() {
    this.editingCompId = '';
  }

  isCompEditing(compId) {
    return this.editingCompId === compId;
  }

  requestCreateContainerWithComp(compName, anchorPoint: any = null, options: any = null) {
    if (this.isPersisting) return { ok: false };
    const pageId = this.metadata.currentPageId;
    const pageData = this.getPageData(pageId);
    if (!pageData) return { ok: false };
    if (!this.getAvailableCompNames().includes(compName)) return { ok: false };

    const containerId = generateTypedId('ctr');
    const compId = generateTypedId('cmp');
    const anchorX = Number.isFinite(anchorPoint?.x) ? anchorPoint.x : 0.2;
    const anchorY = Number.isFinite(anchorPoint?.y) ? anchorPoint.y : 0.2;
    const placement = options?.placement === 'top-left' ? 'top-left' : 'center';
    const ratioByCompName = (() => {
      if (compName === 'CompTextSingleline') return { width: 0.22, height: 0.06 };
      if (compName === 'CompTextMultline') return { width: 0.28, height: 0.14 };
      if (compName === 'CompCode') return { width: 0.46, height: 0.34 };
      if (compName === 'CompExcalidraw') return { width: 0.5, height: 0.4 };
      if (compName === 'CompIFrame') return { width: 0.34, height: 0.03 };
      if (compName === 'CompUrl') return { width: 0.34, height: 0.03 };
      return { width: 0.28, height: 0.22 };
    })();
    const inputRectRatio = options?.rectRatio ?? null;
    const hasCustomRectRatio =
      Number.isFinite(inputRectRatio?.left) &&
      Number.isFinite(inputRectRatio?.top) &&
      Number.isFinite(inputRectRatio?.width) &&
      Number.isFinite(inputRectRatio?.height);
    const width = hasCustomRectRatio
      ? clamp(Number(inputRectRatio.width), MIN_RATIO_SIZE, MAX_RATIO_SIZE)
      : ratioByCompName.width;
    const height = hasCustomRectRatio
      ? clamp(Number(inputRectRatio.height), MIN_RATIO_SIZE, MAX_RATIO_SIZE)
      : ratioByCompName.height;
    const left = hasCustomRectRatio
      ? clamp(Number(inputRectRatio.left), -MAX_RATIO_SIZE, MAX_RATIO_SIZE)
      : placement === 'top-left'
        ? clamp(anchorX, -MAX_RATIO_SIZE, MAX_RATIO_SIZE)
        : clamp(anchorX - width / 2, 0, 1 - width);
    const top = hasCustomRectRatio
      ? clamp(Number(inputRectRatio.top), -MAX_RATIO_SIZE, MAX_RATIO_SIZE)
      : placement === 'top-left'
        ? clamp(anchorY, -MAX_RATIO_SIZE, MAX_RATIO_SIZE)
        : clamp(anchorY - height / 2, 0, 1 - height);

    this.compDataById[compId] = {
      id: compId,
      compName,
      compData: options?.compData ?? this.createDefaultCompData(compName),
    };
    this.containerDataById[containerId] = {
      id: containerId,
      pos: { x: left, y: top },
      size: { x: width, y: height },
      compId,
      layer: (pageData.containerIds ?? []).length,
      containerSize: { pixelX: 0, pixelY: 0 },
    };
    const nextContainerIds = [...(pageData.containerIds ?? []), containerId];
    this.pageDataById[pageId] = {
      ...pageData,
      containerIds: nextContainerIds,
    };
    this.containerPageIdByContainerId[containerId] = pageId;
    this.markContainerDirty(containerId, 'created');
    this.markCompDirtyByContainerId(containerId, 'created');
    this.setSelectedContainer(containerId);
    return { ok: true, containerId, compId };
  }

  confirmTemporarySwitcher(pageId, payload: any = null) {
    const temporarySwitcher = this.getTemporarySwitcher(pageId);
    if (!temporarySwitcher) return { ok: false };
    let nextPayload = payload;
    if (payload?.compScriptInput) {
      const matchedScriptPayload = resolveCompScriptPayload(payload.compScriptInput);
      if (matchedScriptPayload) {
        nextPayload = matchedScriptPayload;
      }
    }
    const nextCompName = nextPayload?.compName || 'CompTextSingleline';
    const createResult = this.requestCreateContainerWithComp(
      nextCompName,
      temporarySwitcher.anchorPoint,
      {
        placement: nextPayload?.options?.placement ?? 'top-left',
        rectRatio: nextPayload?.options?.rectRatio ?? null,
        compData: nextPayload?.compData ?? null,
      },
    );
    this.closeTemporarySwitcher(pageId);
    return createResult;
  }

  requestDeleteContainer(containerId) {
    if (this.isPersisting) return { ok: false };
    const containerData = this.getContainerData(containerId);
    if (!containerData) return { ok: false };
    const pageId = this.containerPageIdByContainerId[containerId];
    const pageData = this.getPageData(pageId);
    if (!pageData) return { ok: false };

    const compId = containerData.compId ?? '';
    delete this.containerDataById[containerId];
    delete this.containerPageIdByContainerId[containerId];
    this.setContainerOverflowVisible(containerId, false);

    this.pageDataById[pageId] = {
      ...pageData,
      containerIds: (pageData.containerIds ?? []).filter((id) => id !== containerId),
    };
    this.syncContainerLayersForPage(pageId);
    this.markContainerDirty(containerId, 'deleted', pageId);

    const isCompStillUsed = Object.values(this.containerDataById).some((entry: any) => {
      return entry?.compId === compId;
    });
    if (!isCompStillUsed && compId && this.compDataById[compId]) {
      delete this.compDataById[compId];
      const dirtyState = this.ensurePageDirtyState(pageId);
      dirtyState.deletedCompIds[compId] = true;
      delete dirtyState.createdCompIds[compId];
      delete dirtyState.updatedCompIds[compId];
    }

    if (this.selectedContainerId === containerId) {
      this.clearSelectedContainer();
    }
    return { ok: true };
  }

  requestContainerRectUpdate(containerId, nextRect) {
    if (this.isPersisting) return;
    const containerData = this.getContainerData(containerId);
    if (!containerData) return;
    const safeRect = normalizeRect(nextRect);
    this.containerDataById[containerId] = {
      ...containerData,
      pos: {
        x: safeRect.left,
        y: safeRect.top,
      },
      size: {
        x: safeRect.width,
        y: safeRect.height,
      },
    };
    this.markContainerDirty(containerId, 'updated');
  }

  normalizeAllContainerLayers() {
    this.metadata.pageIds.forEach((pageId) => {
      this.syncContainerLayersForPage(pageId);
    });
  }

  syncContainerLayersForPage(pageId) {
    const pageData = this.getPageData(pageId);
    if (!pageData) return;
    const orderedContainerIds = [...(pageData.containerIds ?? [])].sort((containerAId, containerBId) => {
      const containerA = this.getContainerData(containerAId);
      const containerB = this.getContainerData(containerBId);
      const layerA = toSafeLayer(containerA?.layer, 0);
      const layerB = toSafeLayer(containerB?.layer, 0);
      return layerA - layerB;
    });
    orderedContainerIds.forEach((containerId, index) => {
      const containerData = this.getContainerData(containerId);
      if (!containerData) return;
      this.containerDataById[containerId] = {
        ...containerData,
        layer: index,
      };
    });
    this.pageDataById[pageId] = {
      ...pageData,
      containerIds: orderedContainerIds,
    };
  }

  requestMoveContainerLayer(containerId, direction) {
    if (this.isPersisting) return { ok: false };
    const pageId = this.containerPageIdByContainerId[containerId];
    const pageData = this.getPageData(pageId);
    if (!pageData) return { ok: false };

    const containerIds = [...(pageData.containerIds ?? [])];
    const currentIndex = containerIds.findIndex((id) => id === containerId);
    if (currentIndex < 0) return { ok: false };

    const lastIndex = containerIds.length - 1;
    let nextIndex = currentIndex;
    if (direction === 'up') nextIndex = Math.min(lastIndex, currentIndex + 1);
    if (direction === 'down') nextIndex = Math.max(0, currentIndex - 1);
    if (direction === 'top') nextIndex = lastIndex;
    if (direction === 'bottom') nextIndex = 0;
    if (nextIndex === currentIndex) return { ok: false };

    const [movingContainerId] = containerIds.splice(currentIndex, 1);
    containerIds.splice(nextIndex, 0, movingContainerId);

    this.pageDataById[pageId] = {
      ...pageData,
      containerIds,
    };
    this.syncContainerLayersForPage(pageId);
    this.markContainerDirty(containerId, 'updated');
    return { ok: true };
  }

  setContainerPixelSize(containerId, nextPixelSize) {
    const containerData = this.getContainerData(containerId);
    if (!containerData) return;
    const prevSize = this.getContainerSize(containerId);
    if (
      prevSize.pixelX === nextPixelSize.pixelX &&
      prevSize.pixelY === nextPixelSize.pixelY
    ) {
      return;
    }
    this.containerDataById[containerId] = {
      ...containerData,
      containerSize: {
        pixelX: Math.max(0, nextPixelSize.pixelX),
        pixelY: Math.max(0, nextPixelSize.pixelY),
      },
    };
  }

  requestContainerCompDataUpdate(containerId, nextCompDataPartial) {
    if (this.isPersisting) return;
    const containerData = this.getContainerData(containerId);
    if (!containerData) return;
    const compData = this.getCompData(containerData.compId);
    if (!compData) return;
    this.compDataById[containerData.compId] = {
      ...compData,
      compData: {
        ...(compData.compData ?? {}),
        ...(nextCompDataPartial ?? {}),
      },
    };
    this.markCompDirtyByContainerId(containerId, 'updated');
  }

  requestReplaceContainerComp(containerId, nextCompName, nextCompData = null) {
    if (this.isPersisting) return { ok: false };
    if (!this.getAvailableCompNames().includes(nextCompName)) return { ok: false };
    const containerData = this.getContainerData(containerId);
    if (!containerData) return { ok: false };
    const compId = containerData.compId ?? '';
    if (!compId) return { ok: false };
    const currentCompData = this.getCompData(compId);
    if (!currentCompData) return { ok: false };
    this.compDataById[compId] = {
      ...currentCompData,
      compName: nextCompName,
      compData: nextCompData ?? this.createDefaultCompData(nextCompName),
    };
    this.setContainerOverflowVisible(containerId, false);
    this.markCompDirtyByContainerId(containerId, 'updated');
    return { ok: true, compId };
  }

  requestContainerFitToPixelSize(containerId, nextPixelSize) {
    if (this.isPersisting) return;
    if (this.isFullWindowMode) return;
    const containerData = this.getContainerData(containerId);
    if (!containerData) return;
    const currentPixelSize = this.getContainerSize(containerId);
    const currentRatioWidth = containerData.size?.x ?? 0;
    const currentRatioHeight = containerData.size?.y ?? 0;

    let pagePixelWidth =
      currentRatioWidth > 0 ? currentPixelSize.pixelX / currentRatioWidth : 0;
    let pagePixelHeight =
      currentRatioHeight > 0 ? currentPixelSize.pixelY / currentRatioHeight : 0;

    const pageAspectRatio = this.getPageAspectRatio();
    if (pagePixelWidth <= 0 && pagePixelHeight > 0) {
      pagePixelWidth = pagePixelHeight * pageAspectRatio;
    }
    if (pagePixelHeight <= 0 && pagePixelWidth > 0) {
      pagePixelHeight = pagePixelWidth / pageAspectRatio;
    }
    if (pagePixelWidth <= 0 || pagePixelHeight <= 0) return;

    const nextRatioWidth = clamp(nextPixelSize.pixelX / pagePixelWidth, MIN_RATIO_SIZE, 1);
    const nextRatioHeight = clamp(
      nextPixelSize.pixelY / pagePixelHeight,
      MIN_RATIO_SIZE,
      1,
    );

    const nextLeft = Number.isFinite(containerData.pos.x) ? containerData.pos.x : 0;
    const nextTop = Number.isFinite(containerData.pos.y) ? containerData.pos.y : 0;

    this.requestContainerRectUpdate(containerId, {
      left: nextLeft,
      top: nextTop,
      width: nextRatioWidth,
      height: nextRatioHeight,
    });
  }

  requestEnsureContainerMinPixelSize(containerId, minPixelSize) {
    if (this.isPersisting) return;
    if (this.isFullWindowMode) return;
    const currentPixelSize = this.getContainerSize(containerId);
    const nextPixelX = Math.max(
      0,
      Math.round(Math.max(currentPixelSize.pixelX, minPixelSize?.pixelX ?? 0)),
    );
    const nextPixelY = Math.max(
      0,
      Math.round(Math.max(currentPixelSize.pixelY, minPixelSize?.pixelY ?? 0)),
    );
    if (nextPixelX === currentPixelSize.pixelX && nextPixelY === currentPixelSize.pixelY) return;
    this.requestContainerFitToPixelSize(containerId, {
      pixelX: nextPixelX,
      pixelY: nextPixelY,
    });
  }
}

const SlideStoreContext = createContext<any>(null);

const SlideStoreProvider = ({ store, children }: any) => {
  return (
    <SlideStoreContext.Provider value={store}>{children}</SlideStoreContext.Provider>
  );
};

const useSlidesStore = () => {
  const store = useContext<any>(SlideStoreContext);
  if (!store) {
    throw new Error('Slide store provider is missing.');
  }
  return store;
};

const createDemoSlideStore = () => {
  const slidesPersistStore = createDemoPersistStore();
  return new SlidesStore(slidesPersistStore.getSnapshot(), slidesPersistStore);
};

export {
  SlidesStore,
  SlideStoreProvider,
  useSlidesStore,
  createDemoSlideStore,
};
