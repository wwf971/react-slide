import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { all, get, run } from './db.js';
import { createSeedSlideDocument } from './init_data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const initDbSqlPath = path.join(__dirname, 'init_db.sql');

const parseJson = (value, fallbackValue) => {
  if (!value) return fallbackValue;
  try {
    return JSON.parse(value);
  } catch {
    return fallbackValue;
  }
};

const nowIso = () => {
  return new Date().toISOString();
};

const generateRandomToken = (length = 10) => {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += chars[Math.floor(Math.random() * chars.length)];
  }
  return output;
};

const generateTypedId = (typePrefix, tokenLength = 10) => {
  return `${typePrefix}-${generateRandomToken(tokenLength)}`;
};

const runInTransaction = async (db, action) => {
  if (typeof db.withTransaction === 'function') {
    await db.withTransaction(async (txDb) => {
      await action(txDb);
    });
    return;
  }
  await run(db, 'BEGIN');
  try {
    await action(db);
    await run(db, 'COMMIT');
  } catch (error) {
    await run(db, 'ROLLBACK');
    throw error;
  }
};

const applySchema = async (db) => {
  const sql = fs.readFileSync(initDbSqlPath, 'utf8');
  await run(db, sql);
};

const hasColumn = async (db, tableName, columnName) => {
  const row = await get(
    db,
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = $2
    LIMIT 1
    `,
    [tableName, columnName],
  );
  return Boolean(row);
};

const resetTablesForSchemaMigration = async (db) => {
  await run(db, 'DROP TABLE IF EXISTS slide_metadata');
  await run(db, 'DROP TABLE IF EXISTS slide_resources');
  await run(db, 'DROP TABLE IF EXISTS slide_containers');
  await run(db, 'DROP TABLE IF EXISTS slide_components');
  await run(db, 'DROP TABLE IF EXISTS slide_pages');
  await run(db, 'DROP TABLE IF EXISTS slide_documents');
};

const migrateResourceKindToTypeIfNeeded = async (db) => {
  const hasKindColumn = await hasColumn(db, 'slide_resources', 'kind');
  if (!hasKindColumn) return;
  const hasTypeColumn = await hasColumn(db, 'slide_resources', 'type');
  if (hasTypeColumn) return;
  await run(db, 'ALTER TABLE slide_resources RENAME COLUMN kind TO type');
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
  return nextPayload;
};

const cloneData = (value) => {
  return JSON.parse(JSON.stringify(value ?? {}));
};

const insertOrUpdateSlideDocument = async (db, slideId, payload, createdAt = null) => {
  const safePayload = normalizeSlidePayload(payload);
  const timestamp = nowIso();
  const createdTimestamp = createdAt ?? timestamp;

  await run(
    db,
    `
    INSERT INTO slide_documents (id, data_json, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      data_json = excluded.data_json,
      updated_at = excluded.updated_at
    `,
    [
      slideId,
      JSON.stringify(safePayload),
      createdTimestamp,
      timestamp,
    ],
  );
};

const buildSlideSnapshot = async (db, slideId) => {
  const slideRow = await get(
    db,
    `
    SELECT data_json
    FROM slide_documents
    WHERE id = ?
    `,
    [slideId],
  );
  if (!slideRow) return null;
  return normalizeSlidePayload(parseJson(slideRow.data_json, {}));
};

const listSlides = async (db) => {
  const rows = await all(
    db,
    `
    SELECT id, data_json
    FROM slide_documents
    ORDER BY created_at ASC, id ASC
    `,
  );
  return rows.map((row) => {
    const data = parseJson(row.data_json, {});
    return {
      id: row.id,
      name: data?.name ?? 'Untitled',
    };
  });
};

const insertSeedSlideIfNeeded = async (db) => {
  const row = await get(db, 'SELECT COUNT(1) AS count_value FROM slide_documents');
  const isSeeded = (row?.count_value ?? 0) > 0;
  if (isSeeded) return;
  const seedDocument = createSeedSlideDocument();
  await insertOrUpdateSlideDocument(db, seedDocument.id, seedDocument.data);
};

const initBackendStore = async (db) => {
  const hasDataJsonColumn = await hasColumn(db, 'slide_documents', 'data_json');
  if (!hasDataJsonColumn) {
    await resetTablesForSchemaMigration(db);
  }
  await applySchema(db);
  await migrateResourceKindToTypeIfNeeded(db);
  await insertSeedSlideIfNeeded(db);
};

const createSlide = async (db, requestedName) => {
  let slideId = generateTypedId('sld');
  let existingSlide = await get(db, 'SELECT id FROM slide_documents WHERE id = ?', [slideId]);
  while (existingSlide) {
    slideId = generateTypedId('sld');
    existingSlide = await get(db, 'SELECT id FROM slide_documents WHERE id = ?', [slideId]);
  }

  const firstPageId = generateTypedId('pag', 8);
  const name = (requestedName ?? '').trim() || 'Untitled';
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

  await runInTransaction(db, async (txDb) => {
    await insertOrUpdateSlideDocument(txDb, slideId, payload);
  });
  return { id: slideId, name, data: payload };
};

const renameSlide = async (db, slideId, name) => {
  const nextName = (name ?? '').trim();
  if (!nextName) return { ok: false, message: 'name is required' };
  const row = await get(
    db,
    `
    SELECT data_json, created_at
    FROM slide_documents
    WHERE id = ?
    `,
    [slideId],
  );
  if (!row) {
    return { ok: false, message: 'slide not found' };
  }
  const data = normalizeSlidePayload(parseJson(row.data_json, {}));
  data.name = nextName;
  await runInTransaction(db, async (txDb) => {
    await insertOrUpdateSlideDocument(txDb, slideId, data, row.created_at);
  });
  return { ok: true };
};

const getSlideSnapshot = async (db, slideId) => {
  const snapshot = await buildSlideSnapshot(db, slideId);
  if (!snapshot) return { ok: false, message: 'slide not found' };
  return { ok: true, data: snapshot };
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
      if (
        typeof nextValue === 'string' &&
        (key === 'resourceId' || key.endsWith('ResourceId'))
      ) {
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

const isResourceUsedByAnySlide = async (db, resourceId) => {
  const rows = await all(db, 'SELECT data_json FROM slide_documents');
  for (const row of rows) {
    const slideData = normalizeSlidePayload(parseJson(row.data_json, {}));
    const resourceIds = collectResourceIdsFromSlideData(slideData);
    if (resourceIds.has(resourceId)) return true;
  }
  return false;
};

const cleanupResourcesIfUnused = async (db, candidateResourceIds = []) => {
  for (const resourceId of candidateResourceIds) {
    if (!resourceId) continue;
    const isUsed = await isResourceUsedByAnySlide(db, resourceId);
    if (isUsed) continue;
    await run(db, 'DELETE FROM slide_resources WHERE id = ?', [resourceId]);
  }
};

const getCompResourceIds = (compEntry) => {
  return Array.from(collectResourceIdsFromCompData(compEntry?.compData ?? {}));
};

const deleteComponentFromSlideData = (slideData, compId) => {
  const nextSlideData = normalizeSlidePayload(cloneData(slideData));
  const compEntry = nextSlideData.compDataById?.[compId];
  if (!compEntry) {
    return { ok: false, message: 'component not found', resourceIds: [] };
  }
  const resourceIds = getCompResourceIds(compEntry);

  delete nextSlideData.compDataById[compId];
  const removedContainerIds = [];
  Object.entries(nextSlideData.containerDataById ?? {}).forEach(([containerId, containerData]) => {
    if (containerData?.compId !== compId) return;
    removedContainerIds.push(containerId);
    delete nextSlideData.containerDataById[containerId];
  });

  Object.values(nextSlideData.pageDataById ?? {}).forEach((pageData) => {
    pageData.containerIds = (pageData.containerIds ?? []).filter((containerId) => {
      return !removedContainerIds.includes(containerId);
    });
  });

  return { ok: true, slideData: nextSlideData, resourceIds };
};

const deleteContainerFromSlideData = (slideData, containerId) => {
  const nextSlideData = normalizeSlidePayload(cloneData(slideData));
  const containerData = nextSlideData.containerDataById?.[containerId];
  if (!containerData) {
    return { ok: false, message: 'container not found', resourceIds: [] };
  }
  delete nextSlideData.containerDataById[containerId];
  Object.values(nextSlideData.pageDataById ?? {}).forEach((pageData) => {
    pageData.containerIds = (pageData.containerIds ?? []).filter((id) => id !== containerId);
  });

  const compId = containerData.compId ?? '';
  const isCompStillUsed = Object.values(nextSlideData.containerDataById ?? {}).some((entry) => {
    return entry?.compId === compId;
  });
  let resourceIds = [];
  if (!isCompStillUsed && compId && nextSlideData.compDataById?.[compId]) {
    resourceIds = getCompResourceIds(nextSlideData.compDataById[compId]);
    delete nextSlideData.compDataById[compId];
  }
  return { ok: true, slideData: nextSlideData, resourceIds };
};

const deletePageFromSlideData = (slideData, pageId) => {
  const nextSlideData = normalizeSlidePayload(cloneData(slideData));
  const pageData = nextSlideData.pageDataById?.[pageId];
  if (!pageData) {
    return { ok: false, message: 'page not found', resourceIds: [] };
  }
  const containerIds = [...(pageData.containerIds ?? [])];
  delete nextSlideData.pageDataById[pageId];
  nextSlideData.metadata.pageIds = (nextSlideData.metadata.pageIds ?? []).filter((id) => id !== pageId);

  const candidateCompIds = new Set();
  containerIds.forEach((containerId) => {
    const containerData = nextSlideData.containerDataById?.[containerId];
    if (!containerData) return;
    if (containerData.compId) candidateCompIds.add(containerData.compId);
    delete nextSlideData.containerDataById[containerId];
  });

  const resourceIds = [];
  candidateCompIds.forEach((compId) => {
    const isCompStillUsed = Object.values(nextSlideData.containerDataById ?? {}).some((entry) => {
      return entry?.compId === compId;
    });
    if (isCompStillUsed) return;
    if (!nextSlideData.compDataById?.[compId]) return;
    resourceIds.push(...getCompResourceIds(nextSlideData.compDataById[compId]));
    delete nextSlideData.compDataById[compId];
  });

  const nextPageIds = nextSlideData.metadata.pageIds ?? [];
  if (!nextPageIds.includes(nextSlideData.metadata.currentPageId)) {
    nextSlideData.metadata.currentPageId = nextPageIds[0] ?? '';
  }
  return { ok: true, slideData: nextSlideData, resourceIds };
};

const getDirtyIds = (dirtyMap) => {
  return Object.keys(dirtyMap ?? {}).filter((id) => dirtyMap[id]);
};

const isDirtyStateEmpty = (dirtyState) => {
  if (!dirtyState) return true;
  return (
    getDirtyIds(dirtyState.updatedContainerIds).length === 0 &&
    getDirtyIds(dirtyState.updatedCompIds).length === 0 &&
    getDirtyIds(dirtyState.createdContainerIds).length === 0 &&
    getDirtyIds(dirtyState.deletedContainerIds).length === 0 &&
    getDirtyIds(dirtyState.createdCompIds).length === 0 &&
    getDirtyIds(dirtyState.deletedCompIds).length === 0
  );
};

const isMetadataDirty = (dirtyPageStateById) => {
  return Object.values(dirtyPageStateById ?? {}).some((dirtyState) => {
    return Boolean(dirtyState?.updatedContainerIds?.__metadata__);
  });
};

const sanitizeContainerDataForPersist = (containerData) => {
  const nextContainerData = cloneData(containerData ?? {});
  delete nextContainerData.containerSize;
  return nextContainerData;
};

const applyDirtyPatchToSlideData = (previousData, payload, dirtyPageStateById) => {
  const nextData = normalizeSlidePayload(cloneData(previousData));
  const runtimePageDataById = payload?.pageDataById ?? {};
  const runtimeContainerDataById = payload?.containerDataById ?? {};
  const runtimeCompDataById = payload?.compDataById ?? {};

  if (isMetadataDirty(dirtyPageStateById)) {
    const nextMetadata = cloneData(payload?.metadata ?? nextData.metadata);
    nextData.metadata = nextMetadata;
    const nextPageIds = Array.isArray(nextMetadata?.pageIds) ? nextMetadata.pageIds : [];
    const pageIdSet = new Set(nextPageIds);
    Object.keys(nextData.pageDataById ?? {}).forEach((pageId) => {
      if (pageIdSet.has(pageId)) return;
      delete nextData.pageDataById[pageId];
    });
    nextPageIds.forEach((pageId) => {
      const runtimePageData = runtimePageDataById?.[pageId];
      if (runtimePageData) {
        nextData.pageDataById[pageId] = cloneData(runtimePageData);
        return;
      }
      if (nextData.pageDataById?.[pageId]) return;
      nextData.pageDataById[pageId] = {
        id: pageId,
        containerIds: [],
      };
    });
  }

  Object.keys(dirtyPageStateById ?? {}).forEach((pageId) => {
    const dirtyState = dirtyPageStateById?.[pageId] ?? {};
    if (isDirtyStateEmpty(dirtyState)) return;
    const runtimePageData = runtimePageDataById[pageId];
    if (runtimePageData) {
      nextData.pageDataById[pageId] = cloneData(runtimePageData);
    }

    getDirtyIds(dirtyState.updatedContainerIds).forEach((containerId) => {
      if (containerId === '__metadata__') return;
      const containerData = runtimeContainerDataById[containerId];
      if (!containerData) return;
      nextData.containerDataById[containerId] = sanitizeContainerDataForPersist(containerData);
    });
    getDirtyIds(dirtyState.createdContainerIds).forEach((containerId) => {
      const containerData = runtimeContainerDataById[containerId];
      if (!containerData) return;
      nextData.containerDataById[containerId] = sanitizeContainerDataForPersist(containerData);
    });
    getDirtyIds(dirtyState.deletedContainerIds).forEach((containerId) => {
      delete nextData.containerDataById[containerId];
    });

    getDirtyIds(dirtyState.updatedCompIds).forEach((compId) => {
      const compData = runtimeCompDataById[compId];
      if (!compData) return;
      nextData.compDataById[compId] = cloneData(compData);
    });
    getDirtyIds(dirtyState.createdCompIds).forEach((compId) => {
      const compData = runtimeCompDataById[compId];
      if (!compData) return;
      nextData.compDataById[compId] = cloneData(compData);
    });
    getDirtyIds(dirtyState.deletedCompIds).forEach((compId) => {
      delete nextData.compDataById[compId];
    });
  });

  return nextData;
};

const saveDirtySlide = async (db, slideId, payload) => {
  const slideRow = await get(
    db,
    `
    SELECT data_json, created_at
    FROM slide_documents
    WHERE id = ?
    `,
    [slideId],
  );
  if (!slideRow) {
    return { ok: false, message: 'slide not found', savedPageIds: [] };
  }

  const dirtyPageStateById = payload?.dirtyPageStateById ?? {};
  const savedPageIds = Object.keys(dirtyPageStateById).filter((pageId) => {
    const dirtyState = dirtyPageStateById[pageId] ?? {};
    return (
      getDirtyIds(dirtyState.updatedContainerIds).length > 0 ||
      getDirtyIds(dirtyState.updatedCompIds).length > 0 ||
      getDirtyIds(dirtyState.createdContainerIds).length > 0 ||
      getDirtyIds(dirtyState.deletedContainerIds).length > 0 ||
      getDirtyIds(dirtyState.createdCompIds).length > 0 ||
      getDirtyIds(dirtyState.deletedCompIds).length > 0
    );
  });

  if (savedPageIds.length === 0) {
    return { ok: true, savedPageIds: [] };
  }

  const previousData = normalizeSlidePayload(parseJson(slideRow.data_json, {}));
  const nextData = applyDirtyPatchToSlideData(previousData, payload, dirtyPageStateById);

  await runInTransaction(db, async (txDb) => {
    await insertOrUpdateSlideDocument(txDb, slideId, nextData, slideRow.created_at);
  });

  return { ok: true, savedPageIds };
};

const createResource = async (db, kind) => {
  if (kind !== 'bytes' && kind !== 'text') {
    return { ok: false, message: 'invalid resource kind' };
  }
  let resourceId = generateTypedId('res');
  let row = await get(db, 'SELECT id FROM slide_resources WHERE id = ?', [resourceId]);
  while (row) {
    resourceId = generateTypedId('res');
    row = await get(db, 'SELECT id FROM slide_resources WHERE id = ?', [resourceId]);
  }
  const timestamp = nowIso();
  await run(
    db,
    `
    INSERT INTO slide_resources (id, type, data_bytes, data_text, created_at, updated_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    `,
    [resourceId, kind, timestamp, timestamp],
  );
  return { ok: true, resourceId, kind };
};

const parseBase64Payload = (value) => {
  const payload = `${value ?? ''}`;
  const commaIndex = payload.indexOf(',');
  const base64 = commaIndex >= 0 ? payload.slice(commaIndex + 1) : payload;
  return base64.trim();
};

const updateResourceBytes = async (db, resourceId, base64) => {
  const bytes = Buffer.from(parseBase64Payload(base64), 'base64');
  const result = await run(
    db,
    `
    UPDATE slide_resources
    SET type = 'bytes', data_bytes = ?, data_text = NULL, updated_at = ?
    WHERE id = ?
    `,
    [bytes, nowIso(), resourceId],
  );
  if ((result?.changes ?? 0) === 0) {
    return { ok: false, message: 'resource not found' };
  }
  return { ok: true };
};

const getResourceBytes = async (db, resourceId) => {
  const row = await get(
    db,
    `
    SELECT data_bytes
    FROM slide_resources
    WHERE id = ?
    `,
    [resourceId],
  );
  if (!row) return { ok: false, message: 'resource not found' };
  if (!row.data_bytes) return { ok: false, message: 'resource byte data is empty' };
  const base64 = Buffer.from(row.data_bytes).toString('base64');
  return { ok: true, base64 };
};

const updateResourceText = async (db, resourceId, text) => {
  const result = await run(
    db,
    `
    UPDATE slide_resources
    SET type = 'text', data_text = ?, data_bytes = NULL, updated_at = ?
    WHERE id = ?
    `,
    [`${text ?? ''}`, nowIso(), resourceId],
  );
  if ((result?.changes ?? 0) === 0) {
    return { ok: false, message: 'resource not found' };
  }
  return { ok: true };
};

const getResourceText = async (db, resourceId) => {
  const row = await get(
    db,
    `
    SELECT data_text
    FROM slide_resources
    WHERE id = ?
    `,
    [resourceId],
  );
  if (!row) return { ok: false, message: 'resource not found' };
  return { ok: true, text: row.data_text ?? '' };
};

const deleteResource = async (db, resourceId) => {
  const isUsed = await isResourceUsedByAnySlide(db, resourceId);
  if (isUsed) {
    return { ok: false, message: 'resource is still referenced by components' };
  }
  await run(db, 'DELETE FROM slide_resources WHERE id = ?', [resourceId]);
  return { ok: true };
};

const deleteSlide = async (db, slideId) => {
  const slideRow = await get(db, 'SELECT data_json FROM slide_documents WHERE id = ?', [slideId]);
  if (!slideRow) return { ok: false, message: 'slide not found' };
  const slideData = normalizeSlidePayload(parseJson(slideRow.data_json, {}));
  const resourceIds = Array.from(collectResourceIdsFromSlideData(slideData));
  await runInTransaction(db, async (txDb) => {
    await run(txDb, 'DELETE FROM slide_documents WHERE id = ?', [slideId]);
  });
  await cleanupResourcesIfUnused(db, resourceIds);
  return { ok: true };
};

const deletePage = async (db, slideId, pageId) => {
  const row = await get(db, 'SELECT data_json, created_at FROM slide_documents WHERE id = ?', [slideId]);
  if (!row) return { ok: false, message: 'slide not found' };
  const slideData = normalizeSlidePayload(parseJson(row.data_json, {}));
  const result = deletePageFromSlideData(slideData, pageId);
  if (!result.ok) return { ok: false, message: result.message };
  await runInTransaction(db, async (txDb) => {
    await insertOrUpdateSlideDocument(txDb, slideId, result.slideData, row.created_at);
  });
  await cleanupResourcesIfUnused(db, result.resourceIds);
  return { ok: true };
};

const deleteContainer = async (db, slideId, containerId) => {
  const row = await get(db, 'SELECT data_json, created_at FROM slide_documents WHERE id = ?', [slideId]);
  if (!row) return { ok: false, message: 'slide not found' };
  const slideData = normalizeSlidePayload(parseJson(row.data_json, {}));
  const result = deleteContainerFromSlideData(slideData, containerId);
  if (!result.ok) return { ok: false, message: result.message };
  await runInTransaction(db, async (txDb) => {
    await insertOrUpdateSlideDocument(txDb, slideId, result.slideData, row.created_at);
  });
  await cleanupResourcesIfUnused(db, result.resourceIds);
  return { ok: true };
};

const deleteComponent = async (db, slideId, compId) => {
  const row = await get(db, 'SELECT data_json, created_at FROM slide_documents WHERE id = ?', [slideId]);
  if (!row) return { ok: false, message: 'slide not found' };
  const slideData = normalizeSlidePayload(parseJson(row.data_json, {}));
  const result = deleteComponentFromSlideData(slideData, compId);
  if (!result.ok) return { ok: false, message: result.message };
  await runInTransaction(db, async (txDb) => {
    await insertOrUpdateSlideDocument(txDb, slideId, result.slideData, row.created_at);
  });
  await cleanupResourcesIfUnused(db, result.resourceIds);
  return { ok: true };
};

const reinitDatabase = async (db) => {
  await runInTransaction(db, async (txDb) => {
    await run(txDb, 'DELETE FROM slide_documents');
    const seedDocument = createSeedSlideDocument();
    await insertOrUpdateSlideDocument(txDb, seedDocument.id, seedDocument.data);
  });
  const slides = await listSlides(db);
  return { ok: true, slides };
};

const dumpDatabaseSnapshot = async (db) => {
  const slides = await all(
    db,
    `
    SELECT id, data_json, created_at, updated_at
    FROM slide_documents
    ORDER BY created_at ASC, id ASC
    `,
  );
  const resources = await all(
    db,
    `
    SELECT id, type, data_text, data_bytes, created_at, updated_at
    FROM slide_resources
    ORDER BY created_at ASC, id ASC
    `,
  );
  return {
    dumpedAt: nowIso(),
    slides: slides.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      data: parseJson(row.data_json, {}),
    })),
    resources: resources.map((row) => ({
      id: row.id,
      type: row.type,
      created_at: row.created_at,
      updated_at: row.updated_at,
      data_text: row.data_text ?? '',
      data_bytes_base64: row.data_bytes ? Buffer.from(row.data_bytes).toString('base64') : '',
    })),
  };
};

export {
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
