import { makeAutoObservable, runInAction } from 'mobx';

const resolveDefaultBackendBaseUrl = () => {
  if (typeof window !== 'undefined' && window?.location?.origin) {
    return window.location.origin;
  }
  return '';
};

const BACKEND_BASE_URL =
  (import.meta as any)?.env?.VITE_SLIDE_BACKEND_BASE_URL ?? resolveDefaultBackendBaseUrl();

class SlidesGroupStore {
  groupItems: any[] = [];
  orphanSlideItems: any[] = [];
  currentGroup: any = null;
  slideNameById: any = {};
  selectedOverviewGroupId = '';
  isOverviewLoading = false;
  isGroupLoading = false;
  isSubmitting = false;
  errorText = '';

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  normalizeFolderPath(pathRaw: string) {
    const pathText = `${pathRaw ?? ''}`.trim();
    const withoutPrefixSlash = pathText.replace(/^\/+/, '');
    const withoutSuffixSlash = withoutPrefixSlash.replace(/\/+$/, '');
    return withoutSuffixSlash
      .split('/')
      .filter(Boolean)
      .join('/');
  }

  normalizePermanentFolderPath(pathRaw: string) {
    const normalizedPath = this.normalizeFolderPath(pathRaw);
    if (!normalizedPath) return '';
    return `${normalizedPath}/`;
  }

  normalizeFolderPaths(folderPathsRaw: any[]) {
    if (!Array.isArray(folderPathsRaw)) return [];
    const seen = {};
    const output: string[] = [];
    folderPathsRaw.forEach((folderPathRaw) => {
      const folderPath = this.normalizePermanentFolderPath(`${folderPathRaw ?? ''}`);
      if (!folderPath) return;
      if (seen[folderPath]) return;
      seen[folderPath] = true;
      output.push(folderPath);
    });
    return output;
  }

  async requestJson(path: string, options: any = {}) {
    const url = `${BACKEND_BASE_URL}${path}`;
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

  async requestLoadOverview() {
    if (this.isOverviewLoading) return { ok: false };
    runInAction(() => {
      this.isOverviewLoading = true;
      this.errorText = '';
    });
    try {
      const result = await this.requestJson('/api/slide/groups/overview');
      if (!result.isOk || !result.payload?.ok) {
        runInAction(() => {
          this.errorText = `${result.payload?.message ?? 'Failed to load overview'}`;
        });
        return { ok: false };
      }
      const groupItems = Array.isArray(result.payload?.slideGroups) ? result.payload.slideGroups : [];
      const orphanSlideItems = Array.isArray(result.payload?.orphanSlides) ? result.payload.orphanSlides : [];
      const nextSlideNameById = {};
      orphanSlideItems.forEach((slideItem) => {
        const slideId = `${slideItem?.id ?? ''}`.trim();
        if (!slideId) return;
        nextSlideNameById[slideId] = `${slideItem?.name ?? ''}`.trim() || slideId;
      });
      runInAction(() => {
        this.groupItems = groupItems.map((groupItem) => ({
          id: `${groupItem?.id ?? ''}`,
          name: `${groupItem?.name ?? ''}`,
          slideNum: Number(groupItem?.slideNum ?? 0),
          slides: Array.isArray(groupItem?.slides) ? groupItem.slides : [],
          folderPaths: this.normalizeFolderPaths(groupItem?.folderPaths ?? []),
        }));
        this.orphanSlideItems = orphanSlideItems.map((slideItem) => ({
          id: `${slideItem?.id ?? ''}`,
          name: `${slideItem?.name ?? ''}`,
        }));
        this.slideNameById = {
          ...this.slideNameById,
          ...nextSlideNameById,
        };
        if (this.selectedOverviewGroupId) {
          const isSelectedGroupStillAvailable = this.groupItems.some((groupItem) => {
            return groupItem.id === this.selectedOverviewGroupId;
          });
          if (!isSelectedGroupStillAvailable) {
            this.selectedOverviewGroupId = '';
          }
        }
      });
      return { ok: true };
    } finally {
      runInAction(() => {
        this.isOverviewLoading = false;
      });
    }
  }

  setSelectedOverviewGroup(groupId: string) {
    this.selectedOverviewGroupId = `${groupId ?? ''}`.trim();
  }

  async requestCreateGroup(name: string) {
    if (this.isSubmitting) return { ok: false };
    const nextName = `${name ?? ''}`.trim();
    if (!nextName) return { ok: false, message: 'name is required' };
    runInAction(() => {
      this.isSubmitting = true;
      this.errorText = '';
    });
    try {
      const result = await this.requestJson('/api/slide/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: nextName }),
      });
      if (!result.isOk || !result.payload?.ok) {
        runInAction(() => {
          this.errorText = `${result.payload?.message ?? 'Failed to create slide-group'}`;
        });
        return { ok: false };
      }
      await this.requestLoadOverview();
      const groupId = `${result.payload?.group?.id ?? ''}`;
      if (groupId) {
        runInAction(() => {
          this.selectedOverviewGroupId = groupId;
        });
      }
      return { ok: true, groupId };
    } finally {
      runInAction(() => {
        this.isSubmitting = false;
      });
    }
  }

  async requestDeleteGroup(groupIdRaw: string) {
    if (this.isSubmitting) return { ok: false };
    const groupId = `${groupIdRaw ?? ''}`.trim();
    if (!groupId) return { ok: false, message: 'groupId is required' };
    runInAction(() => {
      this.isSubmitting = true;
      this.errorText = '';
    });
    try {
      const result = await this.requestJson(`/api/slide/groups/${encodeURIComponent(groupId)}`, {
        method: 'DELETE',
      });
      if (!result.isOk || !result.payload?.ok) {
        runInAction(() => {
          this.errorText = `${result.payload?.message ?? 'Failed to delete slide-group'}`;
        });
        return { ok: false };
      }
      await this.requestLoadOverview();
      runInAction(() => {
        if (this.selectedOverviewGroupId === groupId) {
          this.selectedOverviewGroupId = '';
        }
        if (`${this.currentGroup?.id ?? ''}` === groupId) {
          this.currentGroup = null;
        }
      });
      return { ok: true };
    } finally {
      runInAction(() => {
        this.isSubmitting = false;
      });
    }
  }

  async requestLoadGroup(groupIdRaw: string) {
    const groupId = `${groupIdRaw ?? ''}`.trim();
    if (!groupId) return { ok: false };
    if (this.isGroupLoading) return { ok: false };
    runInAction(() => {
      this.isGroupLoading = true;
      this.errorText = '';
    });
    try {
      const [groupResult, slideResult] = await Promise.all([
        this.requestJson('/api/slide/groups'),
        this.requestJson('/api/slide/slides'),
      ]);
      if (!groupResult.isOk || !groupResult.payload?.ok) {
        runInAction(() => {
          this.errorText = `${groupResult.payload?.message ?? 'Failed to load slide-group'}`;
        });
        return { ok: false };
      }
      if (!slideResult.isOk || !slideResult.payload?.ok) {
        runInAction(() => {
          this.errorText = `${slideResult.payload?.message ?? 'Failed to load slides'}`;
        });
        return { ok: false };
      }
      const slideItems = Array.isArray(slideResult.payload?.slides) ? slideResult.payload.slides : [];
      const nextSlideNameById = {};
      slideItems.forEach((slideItem) => {
        const slideId = `${slideItem?.id ?? ''}`.trim();
        if (!slideId) return;
        nextSlideNameById[slideId] = `${slideItem?.name ?? ''}`.trim() || slideId;
      });
      const result = groupResult;
      if (!result.isOk || !result.payload?.ok) {
        runInAction(() => {
          this.errorText = `${result.payload?.message ?? 'Failed to load slide-group'}`;
        });
        return { ok: false };
      }
      const groups = Array.isArray(result.payload?.groups) ? result.payload.groups : [];
      const targetGroup = groups.find((groupItem) => `${groupItem?.id ?? ''}` === groupId);
      if (!targetGroup) {
        runInAction(() => {
          this.currentGroup = null;
          this.errorText = 'slide-group not found';
        });
        return { ok: false };
      }
      runInAction(() => {
        this.slideNameById = nextSlideNameById;
        this.currentGroup = {
          id: `${targetGroup?.id ?? ''}`,
          name: `${targetGroup?.name ?? ''}`,
          slideNum: Number(targetGroup?.slideNum ?? 0),
          slides: Array.isArray(targetGroup?.slides) ? targetGroup.slides.map((slideItem) => ({
            slideId: `${slideItem?.slideId ?? ''}`,
            path: `${slideItem?.path ?? ''}`,
          })) : [],
          folderPaths: this.normalizeFolderPaths(targetGroup?.folderPaths ?? []),
        };
      });
      return { ok: true };
    } finally {
      runInAction(() => {
        this.isGroupLoading = false;
      });
    }
  }

  async requestRenameGroup(groupIdRaw: string, nameRaw: string) {
    if (this.isSubmitting) return { ok: false };
    const groupId = `${groupIdRaw ?? ''}`.trim();
    const name = `${nameRaw ?? ''}`.trim();
    if (!groupId) return { ok: false, message: 'groupId is required' };
    if (!name) return { ok: false, message: 'name is required' };
    runInAction(() => {
      this.isSubmitting = true;
      this.errorText = '';
    });
    try {
      const result = await this.requestJson(`/api/slide/groups/${encodeURIComponent(groupId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });
      if (!result.isOk || !result.payload?.ok) {
        runInAction(() => {
          this.errorText = `${result.payload?.message ?? 'Failed to rename slide-group'}`;
        });
        return { ok: false };
      }
      await this.requestLoadOverview();
      if (`${this.currentGroup?.id ?? ''}` === groupId) {
        await this.requestLoadGroup(groupId);
      }
      return { ok: true };
    } finally {
      runInAction(() => {
        this.isSubmitting = false;
      });
    }
  }

  async requestRenameSlide(slideIdRaw: string, nextNameRaw: string) {
    if (this.isSubmitting) return { ok: false };
    const slideId = `${slideIdRaw ?? ''}`.trim();
    const nextName = `${nextNameRaw ?? ''}`.trim();
    if (!slideId) return { ok: false, message: 'slideId is required' };
    if (!nextName) return { ok: false, message: 'name is required' };
    runInAction(() => {
      this.isSubmitting = true;
      this.errorText = '';
    });
    try {
      const result = await this.requestJson(`/api/slide/slides/${encodeURIComponent(slideId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: nextName }),
      });
      if (!result.isOk || !result.payload?.ok) {
        runInAction(() => {
          this.errorText = `${result.payload?.message ?? 'Failed to rename slide'}`;
        });
        return { ok: false };
      }
      runInAction(() => {
        this.slideNameById = {
          ...this.slideNameById,
          [slideId]: nextName,
        };
      });
      await this.requestLoadOverview();
      return { ok: true };
    } finally {
      runInAction(() => {
        this.isSubmitting = false;
      });
    }
  }

  async requestUpdateGroupSlides(groupIdRaw: string, nextSlidesRaw: any[], nextFolderPathsRaw: any[] | undefined = undefined) {
    if (this.isSubmitting) return { ok: false };
    const groupId = `${groupIdRaw ?? ''}`.trim();
    if (!groupId) return { ok: false, message: 'groupId is required' };
    const nextSlides = Array.isArray(nextSlidesRaw) ? nextSlidesRaw.map((slideItem) => ({
      slideId: `${slideItem?.slideId ?? ''}`.trim(),
      path: this.normalizeFolderPath(`${slideItem?.path ?? ''}`),
    })) : [];
    const nextFolderPaths = nextFolderPathsRaw === undefined
      ? this.normalizeFolderPaths(this.currentGroup?.folderPaths ?? [])
      : this.normalizeFolderPaths(nextFolderPathsRaw);
    runInAction(() => {
      this.isSubmitting = true;
      this.errorText = '';
    });
    try {
      const result = await this.requestJson(`/api/slide/groups/${encodeURIComponent(groupId)}/slides`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slides: nextSlides,
          folderPaths: nextFolderPaths,
        }),
      });
      if (!result.isOk || !result.payload?.ok) {
        runInAction(() => {
          this.errorText = `${result.payload?.message ?? 'Failed to update slide-group slides'}`;
        });
        return { ok: false };
      }
      await this.requestLoadOverview();
      await this.requestLoadGroup(groupId);
      return { ok: true };
    } finally {
      runInAction(() => {
        this.isSubmitting = false;
      });
    }
  }
}

const createSlidesGroupStore = () => {
  return new SlidesGroupStore();
};

export { SlidesGroupStore, createSlidesGroupStore };
