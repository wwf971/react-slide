import express from 'express';
import cors from 'cors';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKEND_PORT,
  OBJECT_STORAGE_LIST,
  OBJECT_STORAGE_INDEX,
  findObjectStoragePresetByKey,
  AUTH_USERNAME,
  AUTH_PASSWORD,
} from './config.js';
import { createSlideAuth } from './auth.js';
import {
  createObjectStorageContext,
  ensureBackendStoreReady,
  createSlide,
  createSlideGroup,
  createResource,
  deleteComponent,
  deleteContainer,
  deletePage,
  deleteResource,
  deleteSlideGroup,
  deleteSlide,
  getSlideGroupsOverview,
  listSlideGroups,
  getSlideSnapshot,
  getResourceBytes,
  getResourceText,
  initBackendStore,
  listSlides,
  renameSlideGroup,
  reinitDatabase,
  renameSlide,
  saveDirtySlide,
  dumpDatabaseSnapshot,
  updateSlideGroupSlides,
  updateResourceBytes,
  updateResourceText,
} from './store.js';

const currentFilePath = fileURLToPath(import.meta.url);
const backendDir = dirname(currentFilePath);
const projectRootDir = resolve(backendDir, '..');
const frontendDistDir = resolve(projectRootDir, 'frontend', 'build');
const frontendIndexPath = resolve(frontendDistDir, 'index.html');
const backendDumpDir = resolve(projectRootDir, 'data-dumps');
const FRONTEND_ROUTE_PATTERNS = [
  /^\/overview\/?$/,
  /^\/group\/?$/,
  /^\/group\/[^/]+\/?$/,
  /^\/slide\/?$/,
  /^\/slide\/[^/]+\/?$/,
];

const getFrontendRouteErrorPayload = () => {
  return {
    code: -404,
    message: 'route not found',
    data: {
      guide: {
        overview: '/overview/',
        group: '/group?groupId={groupId}',
        slide: '/slide?slideId={slideId}',
      },
    },
  };
};

const getIsFrontendRoutePath = (pathValue = '') => {
  const pathText = `${pathValue ?? ''}`.trim();
  if (!pathText) return false;
  return FRONTEND_ROUTE_PATTERNS.some((pattern) => pattern.test(pathText));
};

const getTimestampToken = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  const hour = `${now.getHours()}`.padStart(2, '0');
  const minute = `${now.getMinutes()}`.padStart(2, '0');
  const second = `${now.getSeconds()}`.padStart(2, '0');
  return `${year}${month}${day}-${hour}${minute}${second}`;
};

const toErrorCode = () => {
  return -1;
};

const sendSuccess = (res, data = undefined, message = '', statusCode = 200) => {
  const body = { code: 0 };
  if (data !== undefined) body.data = data;
  const messageText = `${message ?? ''}`.trim();
  if (messageText) body.message = messageText;
  res.status(statusCode).json(body);
};

const sendError = (res, statusCode = 500, message = '', data = undefined) => {
  const body = { code: toErrorCode(statusCode) };
  const messageText = `${message ?? ''}`.trim();
  if (messageText) body.message = messageText;
  if (data !== undefined) body.data = data;
  res.status(statusCode).json(body);
};

const sendStoreResult = (
  res,
  result,
  {
    successStatus = 200,
    errorStatus = 400,
  } = {},
) => {
  const isSuccess = result?.ok === true;
  const { ok: _unusedOk, message, ...rest } = result ?? {};
  const hasData = Object.keys(rest).length > 0;
  if (isSuccess) {
    sendSuccess(res, hasData ? rest : undefined, message, successStatus);
    return;
  }
  sendError(
    res,
    errorStatus,
    `${message ?? ''}`.trim() || 'request failed',
    hasData ? rest : undefined,
  );
};

const createSlideBackendApp = async () => {
  let currentObjectStorageIndex = OBJECT_STORAGE_INDEX;
  let storeContext = createObjectStorageContext(
    OBJECT_STORAGE_LIST[currentObjectStorageIndex] ?? OBJECT_STORAGE_LIST[0],
  );
  let startupErrorText = '';
  const slideAuth = createSlideAuth({
    username: AUTH_USERNAME,
    password: AUTH_PASSWORD,
  });

  const getCurrentPreset = () => {
    return OBJECT_STORAGE_LIST[currentObjectStorageIndex] ?? OBJECT_STORAGE_LIST[0] ?? null;
  };

  const resetStoreContext = (preset) => {
    storeContext = createObjectStorageContext(preset);
    startupErrorText = '';
    return storeContext;
  };

  const initializeStoreContext = async (ctx) => {
    await initBackendStore(ctx);
    startupErrorText = '';
  };

  try {
    await initializeStoreContext(storeContext);
  } catch (error) {
    startupErrorText = error instanceof Error ? error.message : 'failed to initialize object-storage backend';
  }

  const toObjectStorageItem = (preset, options = {}) => {
    const errorMessage = `${options.errorMessage ?? ''}`.trim();
    const currentPreset = getCurrentPreset();
    const presetKey = `${preset?.KEY ?? ''}`.trim();
    return {
      key: presetKey,
      label: `${preset?.LABEL ?? presetKey}`,
      databaseName: `${preset?.SPACE_NAME ?? ''}`,
      host: `${preset?.SERVICE_URL ?? ''}`,
      port: 0,
      isCurrent: presetKey === `${currentPreset?.KEY ?? ''}`,
      isConnected: options.isConnected === true,
      isInError: Boolean(errorMessage),
      errorMessage,
    };
  };

  const testObjectStoragePreset = async (preset) => {
    const testContext = createObjectStorageContext(preset);
    await ensureBackendStoreReady(testContext);
    return toObjectStorageItem(preset, { isConnected: true });
  };

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  slideAuth.registerAuthRoutes(app);
  app.use('/api/slide', slideAuth.requireAuth);

  app.get('/api/slide/health', async (_req, res) => {
    try {
      await ensureBackendStoreReady(storeContext);
      sendSuccess(res, { db: storeContext.info });
    } catch (error) {
      sendError(
        res,
        503,
        startupErrorText || (error instanceof Error ? error.message : 'failed to reach object-storage service'),
        { db: storeContext.info },
      );
    }
  });

  app.get('/api/slide/database/presets', async (_req, res) => {
    const currentPreset = getCurrentPreset();
    const databaseItems = await Promise.all(
      OBJECT_STORAGE_LIST.map(async (preset) => {
        if (preset.KEY === currentPreset?.KEY) {
          try {
            await ensureBackendStoreReady(storeContext);
            return toObjectStorageItem(preset, { isConnected: true });
          } catch (error) {
            return toObjectStorageItem(preset, {
              isConnected: false,
              errorMessage: startupErrorText || (error instanceof Error ? error.message : 'failed to reach object-storage'),
            });
          }
        }
        try {
          return await testObjectStoragePreset(preset);
        } catch (error) {
          return toObjectStorageItem(preset, {
            isConnected: false,
            errorMessage: error instanceof Error ? error.message : 'failed to reach object-storage',
          });
        }
      }),
    );
    sendSuccess(res, {
      endpointKeyCurrent: `${currentPreset?.KEY ?? ''}`,
      databaseItems,
    });
  });

  app.post('/api/slide/database/test', async (req, res) => {
    const presetKey = `${req.body?.databaseKey ?? ''}`.trim();
    const preset = findObjectStoragePresetByKey(presetKey) ?? getCurrentPreset();
    if (!preset) {
      sendError(res, 400, 'object-storage preset not found');
      return;
    }
    try {
      const databaseItem = await testObjectStoragePreset(preset);
      sendSuccess(res, { databaseItem });
    } catch (error) {
      sendError(
        res,
        400,
        error instanceof Error ? error.message : 'failed to reach object-storage',
        {
          databaseItem: toObjectStorageItem(preset, {
            isConnected: false,
            errorMessage: error instanceof Error ? error.message : 'failed to reach object-storage',
          }),
        },
      );
    }
  });

  app.post('/api/slide/database/switch', async (req, res) => {
    const presetKey = `${req.body?.databaseKey ?? ''}`.trim();
    const preset = findObjectStoragePresetByKey(presetKey);
    if (!preset) {
      sendError(res, 400, 'object-storage preset not found');
      return;
    }
    const nextIndex = OBJECT_STORAGE_LIST.findIndex((entry) => entry.KEY === preset.KEY);
    if (nextIndex < 0) {
      sendError(res, 400, 'object-storage preset not found');
      return;
    }
    if (nextIndex === currentObjectStorageIndex) {
      try {
        await ensureBackendStoreReady(storeContext);
        sendSuccess(res, {
          endpointKeyCurrent: preset.KEY,
          databaseItem: toObjectStorageItem(preset, { isConnected: true }),
        });
      } catch (error) {
        sendError(
          res,
          400,
          error instanceof Error ? error.message : 'failed to reach object-storage',
          {
            databaseItem: toObjectStorageItem(preset, {
              isConnected: false,
              errorMessage: error instanceof Error ? error.message : 'failed to reach object-storage',
            }),
          },
        );
      }
      return;
    }
    const nextContext = createObjectStorageContext(preset);
    try {
      await initializeStoreContext(nextContext);
      currentObjectStorageIndex = nextIndex;
      storeContext = nextContext;
      sendSuccess(res, {
        endpointKeyCurrent: preset.KEY,
        databaseItem: toObjectStorageItem(preset, { isConnected: true }),
      });
    } catch (error) {
      startupErrorText = error instanceof Error ? error.message : 'failed to initialize object-storage backend';
      currentObjectStorageIndex = nextIndex;
      storeContext = nextContext;
      sendError(res, 400, startupErrorText, {
        endpointKeyCurrent: `${getCurrentPreset()?.KEY ?? ''}`,
        databaseItem: toObjectStorageItem(preset, {
          isConnected: false,
          errorMessage: startupErrorText,
        }),
      });
    }
  });

  app.get('/api/slide/slides', async (_req, res) => {
    try {
      const slides = await listSlides(storeContext);
      sendSuccess(res, { slides });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to list slides');
    }
  });

  app.get('/api/slide/groups/overview', async (_req, res) => {
    try {
      const data = await getSlideGroupsOverview(storeContext);
      sendSuccess(res, data);
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to load slide-group overview');
    }
  });

  app.get('/api/slide/groups', async (_req, res) => {
    try {
      const groups = await listSlideGroups(storeContext);
      sendSuccess(res, {
        groups: groups.map((group) => ({
          id: group.id,
          name: group.name,
          slides: group.slides,
          folderPaths: group.folderPaths,
          slideNum: group.slideNum,
        })),
      });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to list slide-groups');
    }
  });

  app.post('/api/slide/groups', async (req, res) => {
    try {
      const group = await createSlideGroup(storeContext, req.body?.name ?? '');
      sendSuccess(res, { group });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to create slide-group');
    }
  });

  app.patch('/api/slide/groups/:groupId', async (req, res) => {
    try {
      const result = await renameSlideGroup(storeContext, req.params.groupId, req.body?.name ?? '');
      sendStoreResult(res, result, { errorStatus: 400 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to rename slide-group');
    }
  });

  app.put('/api/slide/groups/:groupId/slides', async (req, res) => {
    try {
      const result = await updateSlideGroupSlides(
        storeContext,
        req.params.groupId,
        req.body?.slides ?? [],
        req.body?.folderPaths
      );
      sendStoreResult(res, result, { errorStatus: 400 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to update slide-group slides');
    }
  });

  app.delete('/api/slide/groups/:groupId', async (req, res) => {
    try {
      const result = await deleteSlideGroup(storeContext, req.params.groupId);
      sendStoreResult(res, result, { errorStatus: 400 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to delete slide-group');
    }
  });

  app.post('/api/slide/slides', async (req, res) => {
    try {
      const slide = await createSlide(storeContext, req.body?.name ?? '');
      sendSuccess(res, { slide });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to create slide');
    }
  });

  app.delete('/api/slide/slides/:slideId', async (req, res) => {
    try {
      const result = await deleteSlide(storeContext, req.params.slideId);
      sendStoreResult(res, result, { errorStatus: 400 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to delete slide');
    }
  });

  app.patch('/api/slide/slides/:slideId', async (req, res) => {
    try {
      const result = await renameSlide(storeContext, req.params.slideId, req.body?.name ?? '');
      sendStoreResult(res, result, { errorStatus: 400 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to rename slide');
    }
  });

  app.get('/api/slide/slides/:slideId/data', async (req, res) => {
    try {
      const result = await getSlideSnapshot(storeContext, req.params.slideId);
      sendStoreResult(res, result, { errorStatus: 404 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to load slide data');
    }
  });

  app.post('/api/slide/slides/:slideId/save-dirty', async (req, res) => {
    try {
      const result = await saveDirtySlide(storeContext, req.params.slideId, req.body ?? {});
      sendStoreResult(res, result, { errorStatus: 400 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to save dirty slide');
    }
  });

  app.delete('/api/slide/slides/:slideId/pages/:pageId', async (req, res) => {
    try {
      const result = await deletePage(storeContext, req.params.slideId, req.params.pageId);
      sendStoreResult(res, result, { errorStatus: 400 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to delete page');
    }
  });

  app.delete('/api/slide/slides/:slideId/containers/:containerId', async (req, res) => {
    try {
      const result = await deleteContainer(storeContext, req.params.slideId, req.params.containerId);
      sendStoreResult(res, result, { errorStatus: 400 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to delete container');
    }
  });

  app.delete('/api/slide/slides/:slideId/components/:compId', async (req, res) => {
    try {
      const result = await deleteComponent(storeContext, req.params.slideId, req.params.compId);
      sendStoreResult(res, result, { errorStatus: 400 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to delete component');
    }
  });

  app.post('/api/slide/resources', async (req, res) => {
    try {
      const result = await createResource(storeContext, req.body?.kind ?? '');
      sendStoreResult(res, result, { errorStatus: 400 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to create resource');
    }
  });

  app.post('/api/slide/resources/:resourceId/bytes', async (req, res) => {
    try {
      const result = await updateResourceBytes(storeContext, req.params.resourceId, req.body?.base64 ?? '');
      sendStoreResult(res, result, { errorStatus: 400 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to update resource bytes');
    }
  });

  app.get('/api/slide/resources/:resourceId/bytes', async (req, res) => {
    try {
      const result = await getResourceBytes(storeContext, req.params.resourceId);
      sendStoreResult(res, result, { errorStatus: 404 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to load resource bytes');
    }
  });

  app.post('/api/slide/resources/:resourceId/text', async (req, res) => {
    try {
      const result = await updateResourceText(storeContext, req.params.resourceId, req.body?.text ?? '');
      sendStoreResult(res, result, { errorStatus: 400 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to update resource text');
    }
  });

  app.get('/api/slide/resources/:resourceId/text', async (req, res) => {
    try {
      const result = await getResourceText(storeContext, req.params.resourceId);
      sendStoreResult(res, result, { errorStatus: 404 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to load resource text');
    }
  });

  app.delete('/api/slide/resources/:resourceId', async (req, res) => {
    try {
      const result = await deleteResource(storeContext, req.params.resourceId);
      sendStoreResult(res, result, { errorStatus: 400 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to delete resource');
    }
  });

  app.post('/api/slide/admin/reinit-database', async (_req, res) => {
    try {
      const result = await reinitDatabase(storeContext);
      sendStoreResult(res, result, { errorStatus: 500 });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to reinit database');
    }
  });

  app.post('/api/slide/admin/dump-database', async (_req, res) => {
    try {
      const timestamp = getTimestampToken();
      const fileName = `slide-db-dump-${timestamp}.json`;
      const filePath = resolve(backendDumpDir, fileName);
      const payload = await dumpDatabaseSnapshot(storeContext);
      mkdirSync(backendDumpDir, { recursive: true });
      writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
      sendSuccess(res, {
        fileName,
        filePath,
        dumpedAt: payload.dumpedAt,
      });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'failed to dump database');
    }
  });

  const sendFrontendIndexHtml = (res) => {
    try {
      const frontendIndexHtml = readFileSync(frontendIndexPath, 'utf8');
      res.type('html').send(frontendIndexHtml);
      return;
    } catch {
      sendError(res, 503, 'frontend build missing, run pnpm build');
    }
  };
  app.get(['/overview', '/overview/'], (_req, res) => {
    sendFrontendIndexHtml(res);
  });
  app.get(['/slide', '/slide/'], (_req, res) => {
    sendFrontendIndexHtml(res);
  });
  app.get('/slide/:slideId', (req, res) => {
    const slideId = `${req.params?.slideId ?? ''}`.trim();
    if (!slideId) {
      sendError(res, 404, 'slide not found');
      return;
    }
    res.redirect(302, `/slide?slideId=${encodeURIComponent(slideId)}`);
  });
  app.get(['/group', '/group/'], (_req, res) => {
    sendFrontendIndexHtml(res);
  });
  app.get('/group/:groupId', async (req, res) => {
    const groupId = `${req.params.groupId ?? ''}`.trim();
    if (!groupId) {
      sendError(res, 404, 'slide-group not found');
      return;
    }
    const selectedSlide = `${req.query?.selectedSlide ?? ''}`.trim();
    const queryText = selectedSlide
      ? `groupId=${encodeURIComponent(groupId)}&selectedSlide=${encodeURIComponent(selectedSlide)}`
      : `groupId=${encodeURIComponent(groupId)}`;
    res.redirect(302, `/group?${queryText}`);
  });
  app.use(express.static(frontendDistDir, {
    index: false,
    fallthrough: true,
  }));
  app.use(async (req, res, next) => {
    if (req.path.startsWith('/api/slide')) {
      next();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    if (getIsFrontendRoutePath(req.path)) {
      sendFrontendIndexHtml(res);
      return;
    }
    res.status(404).json(getFrontendRouteErrorPayload());
  });

  app.closeBackendDb = async () => {};

  return app;
};

const startSlideBackendServer = async () => {
  const runtimeProcess = globalThis.process;
  const port = Number(runtimeProcess?.env?.SLIDE_BACKEND_PORT ?? BACKEND_PORT);
  const host = runtimeProcess?.env?.SLIDE_BACKEND_HOST ?? '0.0.0.0';
  const app = await createSlideBackendApp();
  const server = app.listen(port, host);
  server.on('listening', () => {
    console.info(`[slide-backend] listening on http://${host}:${port}`);
    console.info(`[slide-backend] local access: http://127.0.0.1:${port}`);
    try {
      readFileSync(frontendIndexPath, 'utf8');
      console.info(`[slide-backend] overview: http://127.0.0.1:${port}/overview/`);
      console.info(`[slide-backend] slide: http://127.0.0.1:${port}/slide?slideId={slideId}`);
      console.info(`[slide-backend] note: '/' returns JSON error`);
    } catch {
      console.info('[slide-backend] frontend build missing, run: pnpm build');
    }
    console.info(`[slide-backend] health: http://127.0.0.1:${port}/api/slide/health`);
  });
  const closeServer = async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(undefined);
      });
    });
    await app.closeBackendDb();
  };

  if (runtimeProcess?.on) {
    runtimeProcess.on('SIGINT', () => {
      closeServer().finally(() => runtimeProcess.exit(0));
    });
    runtimeProcess.on('SIGTERM', () => {
      closeServer().finally(() => runtimeProcess.exit(0));
    });
  }
  return { app, server, closeServer };
};

const runtimeProcess = globalThis.process;
const isRunAsEntry =
  runtimeProcess?.argv?.[1] && runtimeProcess.argv[1].endsWith('/server.js');
if (isRunAsEntry) {
  startSlideBackendServer();
}

export { createSlideBackendApp, startSlideBackendServer };
