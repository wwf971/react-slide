import { Buffer } from 'node:buffer';
import { createSeedSlideDocument } from './init_data.js';
import { OBJECT_STORAGE_SERVICE_URL, OBJECT_STORAGE_SPACE_NAME } from './config.js';

const TYPE_CODE = {
  slide: 1,
  page: 2,
  container: 3,
  component: 4,
  resourceMeta: 5,
  resourceContentText: 6,
  resourceContentBytes: 7,
  slideGroup: 8,
  slideGroupMeta: 9,
};
const OBJECT_EDIT_TYPE_UPDATE_AND_EDIT = 1;

const cloneData = (value) => JSON.parse(JSON.stringify(value ?? {}));
const nowIso = () => new Date().toISOString();

const requestObjectStorage = async (ctx, method, path, options = {}) => {
  const query = options.query ?? {};
  const body = options.body;
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    searchParams.set(key, `${value}`);
  });
  const queryText = searchParams.toString();
  const url = `${ctx.serviceUrl}${path}${queryText ? `?${queryText}` : ''}`;
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`object-storage unreachable: ${error instanceof Error ? error.message : 'network error'}`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || Number(payload?.code ?? -1) < 0) {
    const message = `${payload?.message ?? ''}`.trim() || `request failed: ${response.status}`;
    throw new Error(`object-storage request failed: ${message}`);
  }
  return payload?.data ?? {};
};

const listAllObjectsByType = async (ctx, dataType, type) => {
  const output = [];
  let pageIndex = 1;
  const pageSize = 200;
  while (true) {
    const data = await requestObjectStorage(ctx, 'GET', '/api/object/list', {
      query: {
        spaceId: ctx.spaceId,
        dataType,
        type,
        pageIndex,
        pageSize,
      },
    });
    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length <= 0) break;
    output.push(...items);
    const totalCount = Number(data?.totalCount ?? 0);
    if (output.length >= totalCount) break;
    pageIndex += 1;
  }
  return output;
};

const parseJsonText = (value, fallbackValue) => {
  if (!value) return fallbackValue;
  if (typeof value === 'object') {
    try {
      return cloneData(value);
    } catch {
      return fallbackValue;
    }
  }
  try {
    return JSON.parse(`${value}`);
  } catch {
    return fallbackValue;
  }
};

const normalizeSlidePayload = (payload, fallbackName = 'Untitled') => {
  const nextPayload = {
    ...(payload ?? {}),
  };
  if (!nextPayload.name || typeof nextPayload.name !== 'string') {
    nextPayload.name = fallbackName;
  }
  if (!nextPayload.metadata) {
    nextPayload.metadata = {
      pageIds: [],
      currentPageId: '',
      aspectRatio: { x: 16, y: 9 },
    };
  }
  if (!nextPayload.pageDataById) nextPayload.pageDataById = {};
  if (!nextPayload.containerDataById) nextPayload.containerDataById = {};
  if (!nextPayload.compDataById) nextPayload.compDataById = {};
  Object.values(nextPayload.compDataById).forEach((compEntry) => {
    if (`${compEntry?.compName ?? ''}` !== 'CompIFrame') return;
    compEntry.compData = {
      ...(compEntry?.compData ?? {}),
      isIframeActive: false,
    };
  });
  return nextPayload;
};

const readSpaceMetadataMap = async (ctx) => {
  const listData = await requestObjectStorage(ctx, 'GET', '/api/space/metadata/list', {
    query: { spaceId: ctx.spaceId },
  });
  const output = {};
  const items = Array.isArray(listData?.items) ? listData.items : [];
  items.forEach((item) => {
    const tag = `${item?.tag ?? ''}`;
    if (!tag) return;
    output[tag] = item;
  });
  return output;
};

const upsertSpaceMetadataJson = async (ctx, tag, valueJson) => {
  await requestObjectStorage(ctx, 'POST', '/api/space/metadata/upsert', {
    body: {
      spaceId: ctx.spaceId,
      tag,
      valueType: 2,
      valueJson,
    },
  });
};

const upsertSpaceMetadataText = async (ctx, tag, valueText) => {
  await requestObjectStorage(ctx, 'POST', '/api/space/metadata/upsert', {
    body: {
      spaceId: ctx.spaceId,
      tag,
      valueType: 1,
      valueText: `${valueText ?? ''}`,
    },
  });
};

const loadMaps = async (ctx) => {
  // Keep metadata loading for slide-group meta object only.
  const metadataByTag = await readSpaceMetadataMap(ctx);
  ctx.slideGroupMetaObjectId = `${metadataByTag.reactNoteSlideGroupMetaObjectId?.valueText ?? ''}`.trim();
};

const persistMaps = async (ctx) => {
  // slide/resource maps were removed. no-op to keep compatibility.
  void ctx;
};

const normalizeFolderPath = (pathRaw) => {
  const pathText = `${pathRaw ?? ''}`.trim();
  const withoutPrefixSlash = pathText.replace(/^\/+/, '');
  const withoutSuffixSlash = withoutPrefixSlash.replace(/\/+$/, '');
  return withoutSuffixSlash
    .split('/')
    .filter(Boolean)
    .join('/');
};

const normalizePermanentFolderPath = (pathRaw) => {
  const normalizedPath = normalizeFolderPath(pathRaw);
  if (!normalizedPath) return '';
  return `${normalizedPath}/`;
};

const normalizeSlideGroupSlides = (slides) => {
  if (!Array.isArray(slides)) return [];
  const uniqueSlideMap = {};
  const output = [];
  slides.forEach((slideItem) => {
    const slideId = `${slideItem?.slideId ?? ''}`.trim();
    if (!slideId) return;
    if (uniqueSlideMap[slideId]) return;
    uniqueSlideMap[slideId] = true;
    const pathWithoutSuffixSlash = normalizeFolderPath(slideItem?.path ?? '');
    output.push({
      slideId,
      path: pathWithoutSuffixSlash,
    });
  });
  return output;
};

const normalizeSlideGroupFolderPaths = (folderPathsRaw) => {
  if (!Array.isArray(folderPathsRaw)) return [];
  const seenMap = {};
  const output = [];
  folderPathsRaw.forEach((folderPathRaw) => {
    const folderPath = normalizePermanentFolderPath(folderPathRaw);
    if (!folderPath) return;
    if (seenMap[folderPath]) return;
    seenMap[folderPath] = true;
    output.push(folderPath);
  });
  return output;
};

const normalizeSlideGroupPayload = (payload, fallbackGroupId = '') => {
  const groupId = `${payload?.groupId ?? fallbackGroupId ?? ''}`.trim();
  const name = `${payload?.name ?? ''}`.trim() || groupId || 'Untitled Group';
  const slides = normalizeSlideGroupSlides(payload?.slides);
  const folderPaths = normalizeSlideGroupFolderPaths(payload?.folderPaths);
  return {
    entityType: 'slide-group',
    groupId,
    name,
    slides,
    folderPaths,
    createdAt: `${payload?.createdAt ?? ''}`.trim() || nowIso(),
    updatedAt: `${payload?.updatedAt ?? ''}`.trim() || nowIso(),
  };
};

const normalizeSlideGroupMetaPayload = (payload) => {
  const groupIdListRaw = Array.isArray(payload?.slideGroupIdList) ? payload.slideGroupIdList : [];
  const groupIdSeenMap = {};
  const slideGroupIdList = [];
  groupIdListRaw.forEach((groupIdRaw) => {
    const groupId = `${groupIdRaw ?? ''}`.trim();
    if (!groupId) return;
    if (groupIdSeenMap[groupId]) return;
    groupIdSeenMap[groupId] = true;
    slideGroupIdList.push(groupId);
  });
  return {
    entityType: 'slideGroupMeta',
    slideGroupIdList,
    updatedAt: nowIso(),
  };
};

const ensureSlideGroupMetaObject = async (ctx) => {
  const metadataByTag = await readSpaceMetadataMap(ctx);
  let metaObjectId = `${metadataByTag.reactNoteSlideGroupMetaObjectId?.valueText ?? ''}`.trim();
  let metaPayload = null;
  if (metaObjectId) {
    try {
      const row = await getObject(ctx, 'json', metaObjectId);
      metaPayload = normalizeSlideGroupMetaPayload(row?.valueJson ?? {});
    } catch (_error) {
      metaObjectId = '';
      metaPayload = null;
    }
  }
  if (!metaObjectId) {
    metaPayload = normalizeSlideGroupMetaPayload({
      entityType: 'slideGroupMeta',
      slideGroupIdList: [],
    });
    metaObjectId = await createObject(ctx, 'json', TYPE_CODE.slideGroupMeta, {
      valueJson: metaPayload,
    });
    await upsertSpaceMetadataText(ctx, 'reactNoteSlideGroupMetaObjectId', metaObjectId);
  }
  ctx.slideGroupMetaObjectId = metaObjectId;
  return {
    metaObjectId,
    metaPayload,
  };
};

const listSlideGroupRows = async (ctx) => {
  const items = await listAllObjectsByType(ctx, 'json', TYPE_CODE.slideGroup);
  const output = [];
  items.forEach((item) => {
    const objectId = `${item?.objectId ?? ''}`.trim();
    if (!objectId) return;
    const payload = normalizeSlideGroupPayload(item?.valueJson ?? {});
    if (!payload.groupId) return;
    output.push({
      objectId,
      payload,
    });
  });
  return output;
};

const listSlideGroups = async (ctx) => {
  await ensureBackendStoreReady(ctx);
  const { metaObjectId, metaPayload } = await ensureSlideGroupMetaObject(ctx);
  const metaGroupIds = Array.isArray(metaPayload?.slideGroupIdList) ? metaPayload.slideGroupIdList : [];
  const groupRows = await listSlideGroupRows(ctx);
  const groupRowMap = {};
  groupRows.forEach((row) => {
    groupRowMap[row.payload.groupId] = row;
  });

  const knownGroupIdMap = {};
  const normalizedMetaGroupIds = [];
  metaGroupIds.forEach((groupIdRaw) => {
    const groupId = `${groupIdRaw ?? ''}`.trim();
    if (!groupId) return;
    if (!groupRowMap[groupId]) return;
    if (knownGroupIdMap[groupId]) return;
    knownGroupIdMap[groupId] = true;
    normalizedMetaGroupIds.push(groupId);
  });
  groupRows.forEach((row) => {
    const groupId = row.payload.groupId;
    if (knownGroupIdMap[groupId]) return;
    knownGroupIdMap[groupId] = true;
    normalizedMetaGroupIds.push(groupId);
  });

  if (JSON.stringify(normalizedMetaGroupIds) !== JSON.stringify(metaGroupIds)) {
    const nextMetaPayload = normalizeSlideGroupMetaPayload({
      ...metaPayload,
      slideGroupIdList: normalizedMetaGroupIds,
    });
    await updateObject(ctx, 'json', metaObjectId, TYPE_CODE.slideGroupMeta, {
      valueJson: nextMetaPayload,
    }, true);
  }

  return normalizedMetaGroupIds.map((groupId) => {
    const row = groupRowMap[groupId];
    return {
      id: groupId,
      name: row.payload.name,
      slides: row.payload.slides,
      folderPaths: row.payload.folderPaths,
      slideNum: row.payload.slides.length,
      createdAt: row.payload.createdAt,
      updatedAt: row.payload.updatedAt,
      objectId: row.objectId,
    };
  });
};

const getSlideGroupOwnershipMap = (slideGroups, ignoredGroupId = '') => {
  const ownerBySlideId = {};
  (slideGroups ?? []).forEach((slideGroup) => {
    if (`${slideGroup?.id ?? ''}`.trim() === `${ignoredGroupId ?? ''}`.trim()) return;
    (slideGroup?.slides ?? []).forEach((slideItem) => {
      const slideId = `${slideItem?.slideId ?? ''}`.trim();
      if (!slideId) return;
      ownerBySlideId[slideId] = `${slideGroup?.id ?? ''}`;
    });
  });
  return ownerBySlideId;
};

const resolveSpaceIdByName = async (ctx) => {
  const findData = await requestObjectStorage(ctx, 'GET', '/api/space/find-by-name', {
    query: { name: ctx.spaceName },
  });
  const spaceId = `${findData?.spaceId ?? ''}`.trim();
  if (!spaceId) {
    throw new Error(`space not found by name: ${ctx.spaceName}`);
  }
  ctx.spaceId = spaceId;
  ctx.info.spaceId = spaceId;
};

const ensureBackendStoreReady = async (ctx) => {
  if (ctx.isReady) return;
  await requestObjectStorage(ctx, 'GET', '/api/health/ping');
  if (!ctx.spaceId) {
    await resolveSpaceIdByName(ctx);
  }
  await loadMaps(ctx);
  ctx.isReady = true;
};

const createObject = async (ctx, dataType, type, values) => {
  const data = await requestObjectStorage(ctx, 'POST', '/api/object/create', {
    body: {
      spaceId: ctx.spaceId,
      dataType,
      type,
      editType: OBJECT_EDIT_TYPE_UPDATE_AND_EDIT,
      ...values,
    },
  });
  return `${data?.objectId ?? ''}`;
};

const updateObject = async (ctx, dataType, objectId, type, values, isDeletePrevVersionData = true) => {
  // This adapter keeps the old function signature, but runtime now always edits in-place.
  // In in-place mode, deleting previous-version data is not applicable.
  void isDeletePrevVersionData;
  await requestObjectStorage(ctx, 'POST', '/api/object/update', {
    body: {
      spaceId: ctx.spaceId,
      dataType,
      objectId,
      type,
      isUpdateVersion: false,
      // Keep false because previous-version cleanup is only valid on append-version writes.
      isDeletePrevVersionData: false,
      ...values,
    },
  });
};

const getObject = async (ctx, dataType, objectId) => {
  return requestObjectStorage(ctx, 'GET', '/api/object/get', {
    query: {
      spaceId: ctx.spaceId,
      dataType,
      objectId,
    },
  });
};

const deleteObjects = async (ctx, dataType, objectIds) => {
  if (!Array.isArray(objectIds) || objectIds.length <= 0) return;
  await requestObjectStorage(ctx, 'POST', '/api/object/delete', {
    body: {
      spaceId: ctx.spaceId,
      dataType,
      objectIds,
    },
  });
};

const getSlideSnapshotById = async (ctx, slideId) => {
  const objectId = `${slideId ?? ''}`.trim();
  if (!objectId) return null;
  let row;
  try {
    row = await getObject(ctx, 'json', objectId);
  } catch (error) {
    const messageText = `${error instanceof Error ? error.message : error}`.toLowerCase();
    if (messageText.includes('object not found')) return null;
    throw error;
  }
  const slideData = normalizeSlidePayload(row?.valueJson ?? {}, 'Untitled');
  const hasPageData = Object.keys(slideData?.pageDataById ?? {}).length > 0;
  if (hasPageData) {
    return slideData;
  }
  const pageIds = Array.isArray(slideData?.metadata?.pageIds) ? slideData.metadata.pageIds.map((id) => `${id}`) : [];
  if (pageIds.length <= 0) {
    return slideData;
  }
  const pageItems = await listAllObjectsByType(ctx, 'json', TYPE_CODE.page);
  const pageDataById = {};
  pageItems.forEach((item) => {
    const payload = item?.valueJson ?? {};
    const pageId = `${payload?.legacyPageId ?? ''}`.trim();
    if (!pageId || !pageIds.includes(pageId)) return;
    pageDataById[pageId] = cloneData(payload?.pageData ?? {});
  });
  slideData.pageDataById = pageDataById;

  const containerIds = new Set();
  Object.values(pageDataById).forEach((pageData) => {
    (pageData?.containerIds ?? []).forEach((containerId) => {
      const normalizedContainerId = `${containerId ?? ''}`.trim();
      if (normalizedContainerId) containerIds.add(normalizedContainerId);
    });
  });
  const containerItems = await listAllObjectsByType(ctx, 'json', TYPE_CODE.container);
  const containerDataById = {};
  containerItems.forEach((item) => {
    const payload = item?.valueJson ?? {};
    const containerId = `${payload?.legacyContainerId ?? ''}`.trim();
    if (!containerId || !containerIds.has(containerId)) return;
    containerDataById[containerId] = cloneData(payload?.containerData ?? {});
  });
  slideData.containerDataById = containerDataById;

  const compIds = new Set();
  Object.values(containerDataById).forEach((containerData) => {
    const compId = `${containerData?.compId ?? ''}`.trim();
    if (compId) compIds.add(compId);
  });
  const componentItems = await listAllObjectsByType(ctx, 'json', TYPE_CODE.component);
  const compDataById = {};
  componentItems.forEach((item) => {
    const payload = item?.valueJson ?? {};
    const compId = `${payload?.legacyCompId ?? ''}`.trim();
    if (!compId || !compIds.has(compId)) return;
    compDataById[compId] = cloneData(payload?.compData ?? {});
  });
  slideData.compDataById = compDataById;
  return slideData;
};

const saveSlideSnapshotById = async (ctx, slideId, slideData) => {
  const normalizedData = normalizeSlidePayload(slideData);
  const payload = { ...normalizedData };
  const objectId = `${slideId ?? ''}`.trim();
  if (objectId) {
    await updateObject(ctx, 'json', objectId, TYPE_CODE.slide, { valueJson: payload }, true);
    return objectId;
  }
  return createObject(ctx, 'json', TYPE_CODE.slide, { valueJson: payload });
};

const collectResourceIdsFromCompData = (value, output = new Set()) => {
  if (value == null) return output;
  if (typeof value === 'string') return output;
  if (Array.isArray(value)) {
    value.forEach((item) => collectResourceIdsFromCompData(item, output));
    return output;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, nextValue]) => {
      if (typeof nextValue === 'string' && (key === 'resourceId' || key.endsWith('ResourceId'))) {
        output.add(nextValue);
      }
      collectResourceIdsFromCompData(nextValue, output);
    });
  }
  return output;
};

const collectResourceIdsFromSlideData = (slideData) => {
  const output = new Set();
  Object.values(slideData?.compDataById ?? {}).forEach((compEntry) => {
    collectResourceIdsFromCompData(compEntry?.compData ?? {}, output);
  });
  return output;
};

const initBackendStore = async (ctx) => {
  await ensureBackendStoreReady(ctx);
  const existingSlides = await listAllObjectsByType(ctx, 'json', TYPE_CODE.slide);
  if (existingSlides.length > 0) return;
  const seed = createSeedSlideDocument();
  await saveSlideSnapshotById(ctx, '', seed.data);
};

const listSlides = async (ctx) => {
  await ensureBackendStoreReady(ctx);
  const slideRows = await listAllObjectsByType(ctx, 'json', TYPE_CODE.slide);
  const slideIds = slideRows.map((row) => `${row?.objectId ?? ''}`.trim()).filter(Boolean);
  const slides = [];
  for (const slideId of slideIds) {
    const slideData = await getSlideSnapshotById(ctx, slideId);
    if (!slideData) continue;
    slides.push({
      id: slideId,
      name: `${slideData?.name ?? 'Untitled'}`,
    });
  }
  return slides;
};

const getSlideGroupsOverview = async (ctx) => {
  await ensureBackendStoreReady(ctx);
  const [slideGroups, slides] = await Promise.all([
    listSlideGroups(ctx),
    listSlides(ctx),
  ]);
  const groupedSlideIdMap = {};
  slideGroups.forEach((slideGroup) => {
    (slideGroup?.slides ?? []).forEach((slideItem) => {
      const slideId = `${slideItem?.slideId ?? ''}`.trim();
      if (!slideId) return;
      groupedSlideIdMap[slideId] = true;
    });
  });
  const orphanSlides = slides.filter((slide) => {
    const slideId = `${slide?.id ?? ''}`.trim();
    return !groupedSlideIdMap[slideId];
  });
  return {
    slideGroups: slideGroups.map((slideGroup) => ({
      id: slideGroup.id,
      name: slideGroup.name,
      slideNum: slideGroup.slideNum,
      slides: slideGroup.slides,
      folderPaths: slideGroup.folderPaths,
    })),
    orphanSlides,
  };
};

const createSlideGroup = async (ctx, requestedName = '') => {
  await ensureBackendStoreReady(ctx);
  const { metaObjectId, metaPayload } = await ensureSlideGroupMetaObject(ctx);
  const currentGroupIds = Array.isArray(metaPayload?.slideGroupIdList) ? metaPayload.slideGroupIdList : [];
  const newGroupName = `${requestedName ?? ''}`.trim() || 'Untitled Group';
  const newGroupObjectId = await createObject(ctx, 'json', TYPE_CODE.slideGroup, {
    valueJson: {
      entityType: 'slide-group',
      groupId: '',
      name: newGroupName,
      slides: [],
      folderPaths: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  });
  const groupPayload = normalizeSlideGroupPayload({
    groupId: newGroupObjectId,
    name: newGroupName,
    slides: [],
    folderPaths: [],
  }, newGroupObjectId);
  await updateObject(ctx, 'json', newGroupObjectId, TYPE_CODE.slideGroup, {
    valueJson: groupPayload,
  }, true);
  const nextMetaPayload = normalizeSlideGroupMetaPayload({
    ...metaPayload,
    slideGroupIdList: [...currentGroupIds, newGroupObjectId],
  });
  await updateObject(ctx, 'json', metaObjectId, TYPE_CODE.slideGroupMeta, {
    valueJson: nextMetaPayload,
  }, true);
  return {
    id: newGroupObjectId,
    name: groupPayload.name,
    slideNum: 0,
    slides: [],
  };
};

const deleteSlideGroup = async (ctx, groupIdRaw) => {
  await ensureBackendStoreReady(ctx);
  const groupId = `${groupIdRaw ?? ''}`.trim();
  if (!groupId) return { ok: false, message: 'groupId is required' };
  const [slideGroups, metaInfo] = await Promise.all([
    listSlideGroups(ctx),
    ensureSlideGroupMetaObject(ctx),
  ]);
  const targetGroup = slideGroups.find((slideGroup) => slideGroup.id === groupId);
  if (!targetGroup) return { ok: false, message: 'slide-group not found' };
  await deleteObjects(ctx, 'json', [targetGroup.objectId]);
  const nextMetaPayload = normalizeSlideGroupMetaPayload({
    ...metaInfo.metaPayload,
    slideGroupIdList: (metaInfo.metaPayload?.slideGroupIdList ?? []).filter((nextGroupId) => nextGroupId !== groupId),
  });
  await updateObject(ctx, 'json', metaInfo.metaObjectId, TYPE_CODE.slideGroupMeta, {
    valueJson: nextMetaPayload,
  }, true);
  return { ok: true };
};

const renameSlideGroup = async (ctx, groupIdRaw, nextNameRaw) => {
  await ensureBackendStoreReady(ctx);
  const groupId = `${groupIdRaw ?? ''}`.trim();
  const nextName = `${nextNameRaw ?? ''}`.trim();
  if (!groupId) return { ok: false, message: 'groupId is required' };
  if (!nextName) return { ok: false, message: 'name is required' };
  const slideGroups = await listSlideGroups(ctx);
  const targetGroup = slideGroups.find((slideGroup) => slideGroup.id === groupId);
  if (!targetGroup) return { ok: false, message: 'slide-group not found' };
  const nextPayload = normalizeSlideGroupPayload({
    groupId,
    name: nextName,
    slides: targetGroup.slides,
    folderPaths: targetGroup.folderPaths,
    createdAt: targetGroup.createdAt,
    updatedAt: nowIso(),
  }, groupId);
  await updateObject(ctx, 'json', targetGroup.objectId, TYPE_CODE.slideGroup, {
    valueJson: nextPayload,
  }, true);
  return { ok: true };
};

const updateSlideGroupSlides = async (ctx, groupIdRaw, nextSlidesRaw, nextFolderPathsRaw) => {
  await ensureBackendStoreReady(ctx);
  const groupId = `${groupIdRaw ?? ''}`.trim();
  if (!groupId) return { ok: false, message: 'groupId is required' };
  const nextSlides = normalizeSlideGroupSlides(nextSlidesRaw);
  const [slideGroups, slides] = await Promise.all([
    listSlideGroups(ctx),
    listSlides(ctx),
  ]);
  const targetGroup = slideGroups.find((slideGroup) => slideGroup.id === groupId);
  if (!targetGroup) return { ok: false, message: 'slide-group not found' };
  const nextFolderPaths = nextFolderPathsRaw === undefined
    ? normalizeSlideGroupFolderPaths(targetGroup.folderPaths)
    : normalizeSlideGroupFolderPaths(nextFolderPathsRaw);
  const slideIdSet = {};
  const currentGroupSlideIdSet = {};
  slides.forEach((slide) => {
    const slideId = `${slide?.id ?? ''}`.trim();
    if (!slideId) return;
    slideIdSet[slideId] = true;
  });
  (targetGroup?.slides ?? []).forEach((slideItem) => {
    const slideId = `${slideItem?.slideId ?? ''}`.trim();
    if (!slideId) return;
    currentGroupSlideIdSet[slideId] = true;
  });
  for (const slideItem of nextSlides) {
    if (slideIdSet[slideItem.slideId]) {
      continue;
    }
    if (!currentGroupSlideIdSet[slideItem.slideId]) {
      return { ok: false, message: `slide not found: ${slideItem.slideId}` };
    }
  }
  const ownerBySlideId = getSlideGroupOwnershipMap(slideGroups, groupId);
  for (const slideItem of nextSlides) {
    const ownerGroupId = `${ownerBySlideId[slideItem.slideId] ?? ''}`.trim();
    if (ownerGroupId && ownerGroupId !== groupId) {
      return {
        ok: false,
        message: `slide ${slideItem.slideId} already belongs to group ${ownerGroupId}`,
      };
    }
  }
  const nextPayload = normalizeSlideGroupPayload({
    groupId,
    name: targetGroup.name,
    slides: nextSlides,
    folderPaths: nextFolderPaths,
    updatedAt: nowIso(),
  }, groupId);
  await updateObject(ctx, 'json', targetGroup.objectId, TYPE_CODE.slideGroup, {
    valueJson: nextPayload,
  }, true);
  return { ok: true };
};

const createSlide = async (ctx, requestedName) => {
  await ensureBackendStoreReady(ctx);
  const firstPageId = `page-${Date.now()}`;
  const name = `${requestedName ?? ''}`.trim() || 'Untitled';
  const payload = {
    name,
    metadata: {
      pageIds: [firstPageId],
      currentPageId: firstPageId,
      aspectRatio: { x: 16, y: 9 },
    },
    pageDataById: {
      [firstPageId]: {
        id: firstPageId,
        containerIds: [],
      },
    },
    containerDataById: {},
    compDataById: {},
  };
  const slideObjectId = await saveSlideSnapshotById(ctx, '', payload);
  return { id: slideObjectId, name, data: payload };
};

const renameSlide = async (ctx, slideId, name) => {
  await ensureBackendStoreReady(ctx);
  const nextName = `${name ?? ''}`.trim();
  if (!nextName) return { ok: false, message: 'name is required' };
  const slideData = await getSlideSnapshotById(ctx, slideId);
  if (!slideData) return { ok: false, message: 'slide not found' };
  slideData.name = nextName;
  await saveSlideSnapshotById(ctx, slideId, slideData);
  return { ok: true };
};

const getSlideSnapshot = async (ctx, slideId) => {
  await ensureBackendStoreReady(ctx);
  const data = await getSlideSnapshotById(ctx, slideId);
  if (!data) return { ok: false, message: 'slide not found' };
  return { ok: true, data };
};

const applyDirtyPatchToSlideData = (previousData, payload, dirtyPageStateById) => {
  const nextData = normalizeSlidePayload(cloneData(previousData));
  const runtimePageDataById = payload?.pageDataById ?? {};
  const runtimeContainerDataById = payload?.containerDataById ?? {};
  const runtimeCompDataById = payload?.compDataById ?? {};
  const isMetadataDirty = Object.values(dirtyPageStateById ?? {}).some((dirtyState) => Boolean(dirtyState?.updatedContainerIds?.__metadata__));

  if (isMetadataDirty) {
    nextData.metadata = cloneData(payload?.metadata ?? nextData.metadata);
    const nextPageIds = Array.isArray(nextData?.metadata?.pageIds) ? nextData.metadata.pageIds : [];
    const pageIdSet = new Set(nextPageIds);
    Object.keys(nextData.pageDataById ?? {}).forEach((pageId) => {
      if (pageIdSet.has(pageId)) return;
      delete nextData.pageDataById[pageId];
    });
    nextPageIds.forEach((pageId) => {
      const runtimePageData = runtimePageDataById?.[pageId];
      if (runtimePageData) {
        nextData.pageDataById[pageId] = cloneData(runtimePageData);
      } else if (!nextData.pageDataById?.[pageId]) {
        nextData.pageDataById[pageId] = { id: pageId, containerIds: [] };
      }
    });
  }

  Object.keys(dirtyPageStateById ?? {}).forEach((pageId) => {
    const dirtyState = dirtyPageStateById?.[pageId] ?? {};
    const runtimePageData = runtimePageDataById?.[pageId];
    if (!runtimePageData) return;
    nextData.pageDataById[pageId] = cloneData(runtimePageData);
    Object.keys(dirtyState.updatedContainerIds ?? {}).filter((id) => dirtyState.updatedContainerIds[id]).forEach((containerId) => {
      if (containerId === '__metadata__') return;
      if (!runtimeContainerDataById[containerId]) return;
      nextData.containerDataById[containerId] = cloneData(runtimeContainerDataById[containerId]);
      delete nextData.containerDataById[containerId]?.containerSize;
    });
    Object.keys(dirtyState.createdContainerIds ?? {}).filter((id) => dirtyState.createdContainerIds[id]).forEach((containerId) => {
      if (!runtimeContainerDataById[containerId]) return;
      nextData.containerDataById[containerId] = cloneData(runtimeContainerDataById[containerId]);
      delete nextData.containerDataById[containerId]?.containerSize;
    });
    Object.keys(dirtyState.deletedContainerIds ?? {}).filter((id) => dirtyState.deletedContainerIds[id]).forEach((containerId) => {
      delete nextData.containerDataById[containerId];
    });
    Object.keys(dirtyState.updatedCompIds ?? {}).filter((id) => dirtyState.updatedCompIds[id]).forEach((compId) => {
      if (runtimeCompDataById[compId]) nextData.compDataById[compId] = cloneData(runtimeCompDataById[compId]);
    });
    Object.keys(dirtyState.createdCompIds ?? {}).filter((id) => dirtyState.createdCompIds[id]).forEach((compId) => {
      if (runtimeCompDataById[compId]) nextData.compDataById[compId] = cloneData(runtimeCompDataById[compId]);
    });
    Object.keys(dirtyState.deletedCompIds ?? {}).filter((id) => dirtyState.deletedCompIds[id]).forEach((compId) => {
      delete nextData.compDataById[compId];
    });
  });
  return nextData;
};

const saveDirtySlide = async (ctx, slideId, payload) => {
  await ensureBackendStoreReady(ctx);
  const slideData = await getSlideSnapshotById(ctx, slideId);
  if (!slideData) return { ok: false, message: 'slide not found', savedPageIds: [] };
  const dirtyPageStateById = payload?.dirtyPageStateById ?? {};
  const savedPageIds = Object.keys(dirtyPageStateById).filter((pageId) => {
    const d = dirtyPageStateById[pageId] ?? {};
    return Object.values(d.updatedContainerIds ?? {}).some(Boolean)
      || Object.values(d.updatedCompIds ?? {}).some(Boolean)
      || Object.values(d.createdContainerIds ?? {}).some(Boolean)
      || Object.values(d.deletedContainerIds ?? {}).some(Boolean)
      || Object.values(d.createdCompIds ?? {}).some(Boolean)
      || Object.values(d.deletedCompIds ?? {}).some(Boolean);
  });
  if (savedPageIds.length <= 0) return { ok: true, savedPageIds: [] };
  const nextData = applyDirtyPatchToSlideData(slideData, payload, dirtyPageStateById);
  await saveSlideSnapshotById(ctx, slideId, nextData);
  return { ok: true, savedPageIds };
};

const createResource = async (ctx, kind) => {
  await ensureBackendStoreReady(ctx);
  if (kind !== 'bytes' && kind !== 'text') return { ok: false, message: 'invalid resource kind' };
  const contentObjectId = kind === 'bytes'
    ? await createObject(ctx, 'bytes', TYPE_CODE.resourceContentBytes, { valueBase64: '' })
    : await createObject(ctx, 'text', TYPE_CODE.resourceContentText, { valueText: '' });
  const metaObjectId = await createObject(ctx, 'json', TYPE_CODE.resourceMeta, {
    valueJson: {
      kind,
      contentObjectId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  });
  return { ok: true, resourceId: metaObjectId, kind };
};

const getResourceMappingById = async (ctx, resourceId) => {
  const normalizedResourceId = `${resourceId ?? ''}`.trim();
  if (!normalizedResourceId) return null;
  if (ctx.resourceMetaCache?.[normalizedResourceId]) return ctx.resourceMetaCache[normalizedResourceId];
  try {
    const metaRow = await getObject(ctx, 'json', normalizedResourceId);
    const payload = metaRow?.valueJson ?? {};
    const contentObjectId = `${payload?.contentObjectId ?? ''}`.trim();
    const kindRaw = `${payload?.kind ?? payload?.resourceType ?? ''}`.trim().toLowerCase();
    const kind = kindRaw === 'bytes' ? 'bytes' : 'text';
    if (!contentObjectId) return null;
    const mapping = {
      kind,
      contentObjectId,
      metaObjectId: normalizedResourceId,
    };
    ctx.resourceMetaCache[normalizedResourceId] = mapping;
    return mapping;
  } catch (_error) {}
  const resourceMetaItems = await listAllObjectsByType(ctx, 'json', TYPE_CODE.resourceMeta);
  for (const item of resourceMetaItems) {
    const payload = item?.valueJson ?? {};
    const legacyResourceId = `${payload?.legacyResourceId ?? ''}`.trim();
    if (legacyResourceId !== normalizedResourceId) continue;
    const metaObjectId = `${item?.objectId ?? ''}`.trim();
    const contentObjectId = `${payload?.contentObjectId ?? ''}`.trim();
    if (!metaObjectId || !contentObjectId) return null;
    const kindRaw = `${payload?.kind ?? payload?.resourceType ?? ''}`.trim().toLowerCase();
    const kind = kindRaw === 'bytes' ? 'bytes' : 'text';
    const mapping = { kind, contentObjectId, metaObjectId };
    ctx.resourceMetaCache[metaObjectId] = mapping;
    return mapping;
  }
  return null;
};

const updateResourceBytes = async (ctx, resourceId, base64) => {
  await ensureBackendStoreReady(ctx);
  const mapping = await getResourceMappingById(ctx, resourceId);
  if (!mapping) return { ok: false, message: 'resource not found' };
  await updateObject(ctx, 'bytes', mapping.contentObjectId, TYPE_CODE.resourceContentBytes, { valueBase64: `${base64 ?? ''}` }, true);
  return { ok: true };
};

const getResourceBytes = async (ctx, resourceId) => {
  await ensureBackendStoreReady(ctx);
  const mapping = await getResourceMappingById(ctx, resourceId);
  if (!mapping) return { ok: false, message: 'resource not found' };
  const row = await getObject(ctx, 'bytes', mapping.contentObjectId);
  return { ok: true, base64: `${row?.valueBase64 ?? ''}` };
};

const updateResourceText = async (ctx, resourceId, text) => {
  await ensureBackendStoreReady(ctx);
  const mapping = await getResourceMappingById(ctx, resourceId);
  if (!mapping) return { ok: false, message: 'resource not found' };
  await updateObject(ctx, 'text', mapping.contentObjectId, TYPE_CODE.resourceContentText, { valueText: `${text ?? ''}` }, true);
  return { ok: true };
};

const getResourceText = async (ctx, resourceId) => {
  await ensureBackendStoreReady(ctx);
  const mapping = await getResourceMappingById(ctx, resourceId);
  if (!mapping) return { ok: false, message: 'resource not found' };
  const row = await getObject(ctx, 'text', mapping.contentObjectId);
  return { ok: true, text: `${row?.valueText ?? ''}` };
};

const isResourceUsedByAnySlide = async (ctx, resourceId) => {
  const slideRows = await listAllObjectsByType(ctx, 'json', TYPE_CODE.slide);
  const slideIds = slideRows.map((item) => `${item?.objectId ?? ''}`.trim()).filter(Boolean);
  for (const slideId of slideIds) {
    const slideData = await getSlideSnapshotById(ctx, slideId);
    if (!slideData) continue;
    if (collectResourceIdsFromSlideData(slideData).has(resourceId)) return true;
  }
  return false;
};

const deleteResource = async (ctx, resourceId) => {
  await ensureBackendStoreReady(ctx);
  const mapping = await getResourceMappingById(ctx, resourceId);
  if (!mapping) return { ok: true };
  if (await isResourceUsedByAnySlide(ctx, resourceId)) {
    return { ok: false, message: 'resource is still referenced by components' };
  }
  await deleteObjects(ctx, 'json', [mapping.metaObjectId]);
  if (mapping.kind === 'bytes') {
    await deleteObjects(ctx, 'bytes', [mapping.contentObjectId]);
  } else {
    await deleteObjects(ctx, 'text', [mapping.contentObjectId]);
  }
  delete ctx.resourceMetaCache[mapping.metaObjectId];
  return { ok: true };
};

const toNormalizedIdSet = (valueList) => {
  const output = {};
  (valueList ?? []).forEach((valueItem) => {
    const valueText = `${valueItem ?? ''}`.trim();
    if (!valueText) return;
    output[valueText] = true;
  });
  return output;
};

const getNestedValue = (value, pathList) => {
  let currentValue = value;
  for (const pathItem of pathList) {
    if (currentValue == null || typeof currentValue !== 'object') return '';
    currentValue = currentValue[pathItem];
  }
  return `${currentValue ?? ''}`.trim();
};

const collectOwnedObjectIdsByType = async (ctx, typeCode, slideId, relatedIdSet) => {
  const items = await listAllObjectsByType(ctx, 'json', typeCode);
  const output = [];
  items.forEach((item) => {
    const objectId = `${item?.objectId ?? ''}`.trim();
    if (!objectId) return;
    const payload = item?.valueJson ?? {};
    const candidateIdList = [
      `${payload?.legacySlideId ?? ''}`.trim(),
      `${payload?.slideId ?? ''}`.trim(),
      `${payload?.ownerSlideId ?? ''}`.trim(),
      `${payload?.parentSlideId ?? ''}`.trim(),
      `${payload?.legacyPageId ?? ''}`.trim(),
      `${payload?.pageId ?? ''}`.trim(),
      `${payload?.legacyContainerId ?? ''}`.trim(),
      `${payload?.containerId ?? ''}`.trim(),
      `${payload?.legacyCompId ?? ''}`.trim(),
      `${payload?.compId ?? ''}`.trim(),
      getNestedValue(payload, ['pageData', 'id']),
      getNestedValue(payload, ['containerData', 'id']),
      getNestedValue(payload, ['containerData', 'compId']),
      getNestedValue(payload, ['compData', 'id']),
    ];
    const isOwned = candidateIdList.some((candidateId) => {
      if (!candidateId) return false;
      if (candidateId === slideId) return true;
      return Boolean(relatedIdSet[candidateId]);
    });
    if (!isOwned) return;
    output.push(objectId);
  });
  return output;
};

const deleteSlide = async (ctx, slideId) => {
  await ensureBackendStoreReady(ctx);
  const objectId = `${slideId ?? ''}`.trim();
  if (!objectId) return { ok: false, message: 'slide not found' };
  const slideData = await getSlideSnapshotById(ctx, slideId);
  if (!slideData) return { ok: false, message: 'slide not found' };
  const resourceIdSet = collectResourceIdsFromSlideData(slideData ?? {});
  const pageIds = Array.isArray(slideData?.metadata?.pageIds) ? slideData.metadata.pageIds : [];
  const pageDataIds = Object.keys(slideData?.pageDataById ?? {});
  const containerIds = Object.keys(slideData?.containerDataById ?? {});
  const compIds = Object.keys(slideData?.compDataById ?? {});
  const relatedIdSet = toNormalizedIdSet([
    ...pageIds,
    ...pageDataIds,
    ...containerIds,
    ...compIds,
  ]);
  const [pageObjectIds, containerObjectIds, componentObjectIds] = await Promise.all([
    collectOwnedObjectIdsByType(ctx, TYPE_CODE.page, objectId, relatedIdSet),
    collectOwnedObjectIdsByType(ctx, TYPE_CODE.container, objectId, relatedIdSet),
    collectOwnedObjectIdsByType(ctx, TYPE_CODE.component, objectId, relatedIdSet),
  ]);
  if (componentObjectIds.length > 0) {
    const componentIdSet = toNormalizedIdSet(componentObjectIds);
    const componentItems = await listAllObjectsByType(ctx, 'json', TYPE_CODE.component);
    componentItems.forEach((item) => {
      const componentObjectId = `${item?.objectId ?? ''}`.trim();
      if (!componentIdSet[componentObjectId]) return;
      collectResourceIdsFromCompData(item?.valueJson?.compData ?? {}, resourceIdSet);
    });
  }
  const relatedJsonObjectIds = [
    ...new Set([objectId, ...pageObjectIds, ...containerObjectIds, ...componentObjectIds]),
  ];
  await deleteObjects(ctx, 'json', relatedJsonObjectIds);
  for (const resourceId of Array.from(resourceIdSet)) {
    if (await isResourceUsedByAnySlide(ctx, resourceId)) continue;
    await deleteResource(ctx, resourceId);
  }
  return { ok: true };
};

const deletePage = async (ctx, slideId, pageId) => {
  const snapshotResult = await getSlideSnapshot(ctx, slideId);
  if (!snapshotResult.ok) return snapshotResult;
  const slideData = normalizeSlidePayload(snapshotResult.data);
  const pageData = slideData.pageDataById?.[pageId];
  if (!pageData) return { ok: false, message: 'page not found' };
  delete slideData.pageDataById[pageId];
  slideData.metadata.pageIds = (slideData.metadata.pageIds ?? []).filter((id) => id !== pageId);
  if (!slideData.metadata.pageIds.includes(slideData.metadata.currentPageId)) {
    slideData.metadata.currentPageId = slideData.metadata.pageIds[0] ?? '';
  }
  await saveSlideSnapshotById(ctx, slideId, slideData);
  return { ok: true };
};

const deleteContainer = async (ctx, slideId, containerId) => {
  const snapshotResult = await getSlideSnapshot(ctx, slideId);
  if (!snapshotResult.ok) return snapshotResult;
  const slideData = normalizeSlidePayload(snapshotResult.data);
  const containerData = slideData.containerDataById?.[containerId];
  if (!containerData) return { ok: false, message: 'container not found' };
  delete slideData.containerDataById[containerId];
  Object.values(slideData.pageDataById ?? {}).forEach((pageData) => {
    pageData.containerIds = (pageData.containerIds ?? []).filter((id) => id !== containerId);
  });
  await saveSlideSnapshotById(ctx, slideId, slideData);
  return { ok: true };
};

const deleteComponent = async (ctx, slideId, compId) => {
  const snapshotResult = await getSlideSnapshot(ctx, slideId);
  if (!snapshotResult.ok) return snapshotResult;
  const slideData = normalizeSlidePayload(snapshotResult.data);
  if (!slideData.compDataById?.[compId]) return { ok: false, message: 'component not found' };
  delete slideData.compDataById[compId];
  await saveSlideSnapshotById(ctx, slideId, slideData);
  return { ok: true };
};

const reinitDatabase = async (ctx) => {
  await ensureBackendStoreReady(ctx);
  const slideRows = await listAllObjectsByType(ctx, 'json', TYPE_CODE.slide);
  const slideIds = slideRows.map((row) => `${row?.objectId ?? ''}`.trim()).filter(Boolean);
  for (const slideId of slideIds) {
    await deleteSlide(ctx, slideId);
  }
  ctx.resourceMetaCache = {};
  const seed = createSeedSlideDocument();
  await saveSlideSnapshotById(ctx, '', seed.data);
  const slides = await listSlides(ctx);
  return { ok: true, slides };
};

const dumpDatabaseSnapshot = async (ctx) => {
  await ensureBackendStoreReady(ctx);
  const slides = [];
  const resources = [];
  const slideRows = await listAllObjectsByType(ctx, 'json', TYPE_CODE.slide);
  for (const row of slideRows) {
    const objectId = `${row?.objectId ?? ''}`.trim();
    if (!objectId) continue;
    slides.push({
      id: objectId,
      data: row?.valueJson ?? {},
      objectId,
    });
  }
  const resourceMetaRows = await listAllObjectsByType(ctx, 'json', TYPE_CODE.resourceMeta);
  for (const resourceMetaRow of resourceMetaRows) {
    const resourceId = `${resourceMetaRow?.objectId ?? ''}`.trim();
    const payload = resourceMetaRow?.valueJson ?? {};
    const contentObjectId = `${payload?.contentObjectId ?? ''}`.trim();
    const kindRaw = `${payload?.kind ?? payload?.resourceType ?? ''}`.trim().toLowerCase();
    const kind = kindRaw === 'bytes' ? 'bytes' : 'text';
    if (!resourceId || !contentObjectId) continue;
    const row = await getObject(ctx, kind === 'bytes' ? 'bytes' : 'text', contentObjectId);
    resources.push({
      id: resourceId,
      kind,
      contentObjectId,
      data_text: kind === 'text' ? `${row?.valueText ?? ''}` : '',
      data_bytes_base64: kind === 'bytes' ? `${row?.valueBase64 ?? ''}` : '',
    });
  }
  return {
    dumpedAt: nowIso(),
    slides,
    resources,
  };
};

const createObjectStorageContext = () => {
  const serviceUrl = `${OBJECT_STORAGE_SERVICE_URL ?? ''}`.trim().replace(/\/+$/, '');
  const spaceName = `${OBJECT_STORAGE_SPACE_NAME ?? ''}`.trim();
  return {
    serviceUrl,
    spaceName,
    spaceId: '',
    isReady: false,
    resourceMetaCache: {},
    slideGroupMetaObjectId: '',
    info: {
      serviceUrl,
      spaceName,
      spaceId: '',
    },
  };
};

export {
  createObjectStorageContext,
  ensureBackendStoreReady,
  initBackendStore,
  listSlides,
  listSlideGroups,
  getSlideGroupsOverview,
  createSlideGroup,
  deleteSlideGroup,
  renameSlideGroup,
  updateSlideGroupSlides,
  createSlide,
  renameSlide,
  getSlideSnapshot,
  saveDirtySlide,
  reinitDatabase,
  dumpDatabaseSnapshot,
  createResource,
  updateResourceBytes,
  getResourceBytes,
  updateResourceText,
  getResourceText,
  deleteResource,
  deleteSlide,
  deletePage,
  deleteContainer,
  deleteComponent,
};
