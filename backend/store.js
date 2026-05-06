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
};

const cloneData = (value) => JSON.parse(JSON.stringify(value ?? {}));
const nowIso = () => new Date().toISOString();

const generateRandomToken = (length = 10) => {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += chars[Math.floor(Math.random() * chars.length)];
  }
  return output;
};

const generateTypedId = (typePrefix, tokenLength = 10) => `${typePrefix}-${generateRandomToken(tokenLength)}`;

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

const loadMaps = async (ctx) => {
  const metadataByTag = await readSpaceMetadataMap(ctx);
  ctx.slideMap = parseJsonText(metadataByTag.reactNoteSlideMap?.valueJson, {});
  ctx.resourceMap = parseJsonText(metadataByTag.reactNoteResourceMap?.valueJson, {});
  const slideItems = await listAllObjectsByType(ctx, 'json', TYPE_CODE.slide);
  let isSlideMapChanged = false;
  slideItems.forEach((item) => {
    const objectId = `${item?.objectId ?? ''}`.trim();
    const legacySlideIdRaw = `${item?.valueJson?.legacySlideId ?? ''}`.trim();
    const legacySlideId = legacySlideIdRaw || `slide_${objectId.slice(-8)}`;
    if (!objectId) return;
    const currentObjectId = `${ctx.slideMap[legacySlideId] ?? ''}`.trim();
    if (!currentObjectId) {
      ctx.slideMap[legacySlideId] = objectId;
      isSlideMapChanged = true;
      return;
    }
    if (currentObjectId === objectId) return;
    const duplicateSlideId = `${legacySlideId}__${objectId.slice(-6)}`;
    if (`${ctx.slideMap[duplicateSlideId] ?? ''}`.trim() === objectId) return;
    ctx.slideMap[duplicateSlideId] = objectId;
    isSlideMapChanged = true;
  });
  if (isSlideMapChanged || (slideItems.length > 0 && Object.keys(ctx.slideMap ?? {}).length <= 0)) {
    await upsertSpaceMetadataJson(ctx, 'reactNoteSlideMap', ctx.slideMap);
  }

  const resourceMetaItems = await listAllObjectsByType(ctx, 'json', TYPE_CODE.resourceMeta);
  let isResourceMapChanged = false;
  resourceMetaItems.forEach((item) => {
    const payload = item?.valueJson ?? {};
    const legacyResourceId = `${payload?.legacyResourceId ?? ''}`.trim();
    const contentObjectId = `${payload?.contentObjectId ?? ''}`.trim();
    const resourceType = `${payload?.resourceType ?? payload?.kind ?? ''}`.trim().toLowerCase();
    const kind = resourceType === 'bytes' ? 'bytes' : 'text';
    const metaObjectId = `${item?.objectId ?? ''}`.trim();
    if (!legacyResourceId || !contentObjectId || !metaObjectId) return;
    const current = ctx.resourceMap?.[legacyResourceId] ?? null;
    if (
      current &&
      `${current.contentObjectId ?? ''}`.trim() === contentObjectId &&
      `${current.metaObjectId ?? ''}`.trim() === metaObjectId &&
      `${current.kind ?? ''}`.trim() === kind
    ) {
      return;
    }
    ctx.resourceMap[legacyResourceId] = {
      kind,
      contentObjectId,
      metaObjectId,
    };
    isResourceMapChanged = true;
  });
  if (isResourceMapChanged || (resourceMetaItems.length > 0 && Object.keys(ctx.resourceMap ?? {}).length <= 0)) {
    await upsertSpaceMetadataJson(ctx, 'reactNoteResourceMap', ctx.resourceMap);
  }
};

const persistMaps = async (ctx) => {
  await upsertSpaceMetadataJson(ctx, 'reactNoteSlideMap', ctx.slideMap);
  await upsertSpaceMetadataJson(ctx, 'reactNoteResourceMap', ctx.resourceMap);
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
  if (ctx.spaceId) return;
  await requestObjectStorage(ctx, 'GET', '/api/health/ping');
  await resolveSpaceIdByName(ctx);
  await loadMaps(ctx);
};

const createObject = async (ctx, dataType, type, values) => {
  const data = await requestObjectStorage(ctx, 'POST', '/api/object/create', {
    body: {
      spaceId: ctx.spaceId,
      dataType,
      type,
      ...values,
    },
  });
  return `${data?.objectId ?? ''}`;
};

const updateObject = async (ctx, dataType, objectId, type, values, isDeletePreviousData = true) => {
  await requestObjectStorage(ctx, 'POST', '/api/object/update', {
    body: {
      spaceId: ctx.spaceId,
      dataType,
      objectId,
      type,
      isDeletePreviousData,
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

const getSlideObjectId = (ctx, slideId) => `${ctx.slideMap?.[slideId] ?? ''}`.trim();

const getSlideSnapshotById = async (ctx, slideId) => {
  const objectId = getSlideObjectId(ctx, slideId);
  if (!objectId) return null;
  let row;
  try {
    row = await getObject(ctx, 'json', objectId);
  } catch (error) {
    const messageText = `${error instanceof Error ? error.message : error}`;
    if (messageText.includes('object not found')) {
      delete ctx.slideMap[slideId];
      await persistMaps(ctx);
      return null;
    }
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
  const payload = {
    legacySlideId: slideId,
    ...normalizedData,
  };
  const objectId = getSlideObjectId(ctx, slideId);
  if (objectId) {
    await updateObject(ctx, 'json', objectId, TYPE_CODE.slide, { valueJson: payload }, true);
    return objectId;
  }
  const nextObjectId = await createObject(ctx, 'json', TYPE_CODE.slide, { valueJson: payload });
  ctx.slideMap[slideId] = nextObjectId;
  await persistMaps(ctx);
  return nextObjectId;
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
  if (Object.keys(ctx.slideMap).length > 0) return;
  const seed = createSeedSlideDocument();
  await saveSlideSnapshotById(ctx, seed.id, seed.data);
};

const listSlides = async (ctx) => {
  await ensureBackendStoreReady(ctx);
  const slideIds = Object.keys(ctx.slideMap ?? {}).sort();
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

const createSlide = async (ctx, requestedName) => {
  await ensureBackendStoreReady(ctx);
  let slideId = generateTypedId('sld');
  while (ctx.slideMap?.[slideId]) {
    slideId = generateTypedId('sld');
  }
  const firstPageId = generateTypedId('pag', 8);
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
  await saveSlideSnapshotById(ctx, slideId, payload);
  return { id: slideId, name, data: payload };
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
  let resourceId = generateTypedId('res');
  while (ctx.resourceMap?.[resourceId]) {
    resourceId = generateTypedId('res');
  }
  const contentObjectId = kind === 'bytes'
    ? await createObject(ctx, 'bytes', TYPE_CODE.resourceContentBytes, { valueBase64: '' })
    : await createObject(ctx, 'text', TYPE_CODE.resourceContentText, { valueText: '' });
  const metaObjectId = await createObject(ctx, 'json', TYPE_CODE.resourceMeta, {
    valueJson: {
      legacyResourceId: resourceId,
      kind,
      contentObjectId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  });
  ctx.resourceMap[resourceId] = { kind, contentObjectId, metaObjectId };
  await persistMaps(ctx);
  return { ok: true, resourceId, kind };
};

const updateResourceBytes = async (ctx, resourceId, base64) => {
  await ensureBackendStoreReady(ctx);
  const mapping = ctx.resourceMap?.[resourceId];
  if (!mapping) return { ok: false, message: 'resource not found' };
  await updateObject(ctx, 'bytes', mapping.contentObjectId, TYPE_CODE.resourceContentBytes, { valueBase64: `${base64 ?? ''}` }, true);
  return { ok: true };
};

const getResourceBytes = async (ctx, resourceId) => {
  await ensureBackendStoreReady(ctx);
  const mapping = ctx.resourceMap?.[resourceId];
  if (!mapping) return { ok: false, message: 'resource not found' };
  const row = await getObject(ctx, 'bytes', mapping.contentObjectId);
  return { ok: true, base64: `${row?.valueBase64 ?? ''}` };
};

const updateResourceText = async (ctx, resourceId, text) => {
  await ensureBackendStoreReady(ctx);
  const mapping = ctx.resourceMap?.[resourceId];
  if (!mapping) return { ok: false, message: 'resource not found' };
  await updateObject(ctx, 'text', mapping.contentObjectId, TYPE_CODE.resourceContentText, { valueText: `${text ?? ''}` }, true);
  return { ok: true };
};

const getResourceText = async (ctx, resourceId) => {
  await ensureBackendStoreReady(ctx);
  const mapping = ctx.resourceMap?.[resourceId];
  if (!mapping) return { ok: false, message: 'resource not found' };
  const row = await getObject(ctx, 'text', mapping.contentObjectId);
  return { ok: true, text: `${row?.valueText ?? ''}` };
};

const isResourceUsedByAnySlide = async (ctx, resourceId) => {
  const slideIds = Object.keys(ctx.slideMap ?? {});
  for (const slideId of slideIds) {
    const slideData = await getSlideSnapshotById(ctx, slideId);
    if (!slideData) continue;
    if (collectResourceIdsFromSlideData(slideData).has(resourceId)) return true;
  }
  return false;
};

const deleteResource = async (ctx, resourceId) => {
  await ensureBackendStoreReady(ctx);
  const mapping = ctx.resourceMap?.[resourceId];
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
  delete ctx.resourceMap[resourceId];
  await persistMaps(ctx);
  return { ok: true };
};

const deleteSlide = async (ctx, slideId) => {
  await ensureBackendStoreReady(ctx);
  const objectId = getSlideObjectId(ctx, slideId);
  if (!objectId) return { ok: false, message: 'slide not found' };
  const slideData = await getSlideSnapshotById(ctx, slideId);
  const resourceIds = Array.from(collectResourceIdsFromSlideData(slideData ?? {}));
  await deleteObjects(ctx, 'json', [objectId]);
  delete ctx.slideMap[slideId];
  await persistMaps(ctx);
  for (const resourceId of resourceIds) {
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
  const slideIds = Object.keys(ctx.slideMap ?? {});
  for (const slideId of slideIds) {
    await deleteSlide(ctx, slideId);
  }
  Object.keys(ctx.resourceMap ?? {}).forEach((resourceId) => {
    delete ctx.resourceMap[resourceId];
  });
  ctx.slideMap = {};
  await persistMaps(ctx);
  const seed = createSeedSlideDocument();
  await saveSlideSnapshotById(ctx, seed.id, seed.data);
  const slides = await listSlides(ctx);
  return { ok: true, slides };
};

const dumpDatabaseSnapshot = async (ctx) => {
  await ensureBackendStoreReady(ctx);
  const slides = [];
  const resources = [];
  for (const [slideId, objectId] of Object.entries(ctx.slideMap ?? {})) {
    const row = await getObject(ctx, 'json', objectId);
    slides.push({
      id: slideId,
      data: row?.valueJson ?? {},
      objectId,
    });
  }
  for (const [resourceId, mapping] of Object.entries(ctx.resourceMap ?? {})) {
    const row = await getObject(ctx, mapping.kind === 'bytes' ? 'bytes' : 'text', mapping.contentObjectId);
    resources.push({
      id: resourceId,
      kind: mapping.kind,
      contentObjectId: mapping.contentObjectId,
      data_text: mapping.kind === 'text' ? `${row?.valueText ?? ''}` : '',
      data_bytes_base64: mapping.kind === 'bytes' ? `${row?.valueBase64 ?? ''}` : '',
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
    slideMap: {},
    resourceMap: {},
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
