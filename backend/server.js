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
} from './config.js';
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
  /^\/group\/[^/]+\/?$/,
  /^\/slide\/[^/]+\/?$/,
];

const getFrontendRouteErrorPayload = () => {
  return {
    ok: false,
    message: 'route not found',
    guide: {
      overview: '/overview/',
      slide: '/slide/{slideId}',
    },
  };
};

const getIsFrontendRoutePath = (pathValue = '') => {
  const pathText = `${pathValue ?? ''}`.trim();
  if (!pathText) return false;
  return FRONTEND_ROUTE_PATTERNS.some((pattern) => pattern.test(pathText));
};

const getGroupIdFromFrontendPath = (pathValue = '') => {
  const pathText = `${pathValue ?? ''}`.trim();
  const match = pathText.match(/^\/group\/([^/]+)\/?$/);
  if (!match) return '';
  return `${match[1] ?? ''}`.trim();
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

const createSlideBackendApp = async () => {
  let currentObjectStorageIndex = OBJECT_STORAGE_INDEX;
  let storeContext = createObjectStorageContext(
    OBJECT_STORAGE_LIST[currentObjectStorageIndex] ?? OBJECT_STORAGE_LIST[0],
  );
  let startupErrorText = '';

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

  app.get('/api/slide/health', async (_req, res) => {
    try {
      await ensureBackendStoreReady(storeContext);
      res.json({ ok: true, db: storeContext.info });
    } catch (error) {
      res.status(503).json({
        ok: false,
        message: startupErrorText || (error instanceof Error ? error.message : 'failed to reach object-storage service'),
        db: storeContext.info,
      });
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
    res.json({
      ok: true,
      currentDatabaseKey: `${currentPreset?.KEY ?? ''}`,
      databaseItems,
    });
  });

  app.post('/api/slide/database/test', async (req, res) => {
    const presetKey = `${req.body?.databaseKey ?? ''}`.trim();
    const preset = findObjectStoragePresetByKey(presetKey) ?? getCurrentPreset();
    if (!preset) {
      res.status(400).json({
        ok: false,
        message: 'object-storage preset not found',
      });
      return;
    }
    try {
      const databaseItem = await testObjectStoragePreset(preset);
      res.json({
        ok: true,
        databaseItem,
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to reach object-storage',
        databaseItem: toObjectStorageItem(preset, {
          isConnected: false,
          errorMessage: error instanceof Error ? error.message : 'failed to reach object-storage',
        }),
      });
    }
  });

  app.post('/api/slide/database/switch', async (req, res) => {
    const presetKey = `${req.body?.databaseKey ?? ''}`.trim();
    const preset = findObjectStoragePresetByKey(presetKey);
    if (!preset) {
      res.status(400).json({
        ok: false,
        message: 'object-storage preset not found',
      });
      return;
    }
    const nextIndex = OBJECT_STORAGE_LIST.findIndex((entry) => entry.KEY === preset.KEY);
    if (nextIndex < 0) {
      res.status(400).json({
        ok: false,
        message: 'object-storage preset not found',
      });
      return;
    }
    if (nextIndex === currentObjectStorageIndex) {
      try {
        await ensureBackendStoreReady(storeContext);
        res.json({
          ok: true,
          currentDatabaseKey: preset.KEY,
          databaseItem: toObjectStorageItem(preset, { isConnected: true }),
        });
      } catch (error) {
        res.status(400).json({
          ok: false,
          message: error instanceof Error ? error.message : 'failed to reach object-storage',
          databaseItem: toObjectStorageItem(preset, {
            isConnected: false,
            errorMessage: error instanceof Error ? error.message : 'failed to reach object-storage',
          }),
        });
      }
      return;
    }
    currentObjectStorageIndex = nextIndex;
    const nextContext = resetStoreContext(preset);
    try {
      await initializeStoreContext(nextContext);
      res.json({
        ok: true,
        currentDatabaseKey: preset.KEY,
        databaseItem: toObjectStorageItem(preset, { isConnected: true }),
      });
    } catch (error) {
      startupErrorText = error instanceof Error ? error.message : 'failed to initialize object-storage backend';
      res.status(400).json({
        ok: false,
        message: startupErrorText,
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
      res.json({ ok: true, slides });
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to list slides',
      });
    }
  });

  app.get('/api/slide/groups/overview', async (_req, res) => {
    try {
      const data = await getSlideGroupsOverview(storeContext);
      res.json({
        ok: true,
        ...data,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to load slide-group overview',
      });
    }
  });

  app.get('/api/slide/groups', async (_req, res) => {
    try {
      const groups = await listSlideGroups(storeContext);
      res.json({
        ok: true,
        groups: groups.map((group) => ({
          id: group.id,
          name: group.name,
          slides: group.slides,
          folderPaths: group.folderPaths,
          slideNum: group.slideNum,
        })),
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to list slide-groups',
      });
    }
  });

  app.post('/api/slide/groups', async (req, res) => {
    try {
      const group = await createSlideGroup(storeContext, req.body?.name ?? '');
      res.json({
        ok: true,
        group,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to create slide-group',
      });
    }
  });

  app.patch('/api/slide/groups/:groupId', async (req, res) => {
    try {
      const result = await renameSlideGroup(storeContext, req.params.groupId, req.body?.name ?? '');
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to rename slide-group',
      });
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
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to update slide-group slides',
      });
    }
  });

  app.delete('/api/slide/groups/:groupId', async (req, res) => {
    try {
      const result = await deleteSlideGroup(storeContext, req.params.groupId);
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to delete slide-group',
      });
    }
  });

  app.post('/api/slide/slides', async (req, res) => {
    try {
      const slide = await createSlide(storeContext, req.body?.name ?? '');
      res.json({ ok: true, slide });
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to create slide',
      });
    }
  });

  app.delete('/api/slide/slides/:slideId', async (req, res) => {
    try {
      const result = await deleteSlide(storeContext, req.params.slideId);
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to delete slide',
      });
    }
  });

  app.patch('/api/slide/slides/:slideId', async (req, res) => {
    try {
      const result = await renameSlide(storeContext, req.params.slideId, req.body?.name ?? '');
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to rename slide',
      });
    }
  });

  app.get('/api/slide/slides/:slideId/data', async (req, res) => {
    try {
      const result = await getSlideSnapshot(storeContext, req.params.slideId);
      if (!result.ok) {
        res.status(404).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to load slide data',
      });
    }
  });

  app.post('/api/slide/slides/:slideId/save-dirty', async (req, res) => {
    try {
      const result = await saveDirtySlide(storeContext, req.params.slideId, req.body ?? {});
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to save dirty slide',
      });
    }
  });

  app.delete('/api/slide/slides/:slideId/pages/:pageId', async (req, res) => {
    try {
      const result = await deletePage(storeContext, req.params.slideId, req.params.pageId);
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to delete page',
      });
    }
  });

  app.delete('/api/slide/slides/:slideId/containers/:containerId', async (req, res) => {
    try {
      const result = await deleteContainer(storeContext, req.params.slideId, req.params.containerId);
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to delete container',
      });
    }
  });

  app.delete('/api/slide/slides/:slideId/components/:compId', async (req, res) => {
    try {
      const result = await deleteComponent(storeContext, req.params.slideId, req.params.compId);
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to delete component',
      });
    }
  });

  app.post('/api/slide/resources', async (req, res) => {
    try {
      const result = await createResource(storeContext, req.body?.kind ?? '');
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to create resource',
      });
    }
  });

  app.put('/api/slide/resources/:resourceId/bytes', async (req, res) => {
    try {
      const result = await updateResourceBytes(storeContext, req.params.resourceId, req.body?.base64 ?? '');
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to update resource bytes',
      });
    }
  });

  app.get('/api/slide/resources/:resourceId/bytes', async (req, res) => {
    try {
      const result = await getResourceBytes(storeContext, req.params.resourceId);
      if (!result.ok) {
        res.status(404).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to load resource bytes',
      });
    }
  });

  app.put('/api/slide/resources/:resourceId/text', async (req, res) => {
    try {
      const result = await updateResourceText(storeContext, req.params.resourceId, req.body?.text ?? '');
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to update resource text',
      });
    }
  });

  app.get('/api/slide/resources/:resourceId/text', async (req, res) => {
    try {
      const result = await getResourceText(storeContext, req.params.resourceId);
      if (!result.ok) {
        res.status(404).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to load resource text',
      });
    }
  });

  app.delete('/api/slide/resources/:resourceId', async (req, res) => {
    try {
      const result = await deleteResource(storeContext, req.params.resourceId);
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to delete resource',
      });
    }
  });

  app.post('/api/slide/admin/reinit-database', async (_req, res) => {
    try {
      const result = await reinitDatabase(storeContext);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to reinit database',
      });
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
      res.json({
        ok: true,
        fileName,
        filePath,
        dumpedAt: payload.dumpedAt,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to dump database',
      });
    }
  });

  const sendFrontendIndexHtml = (res) => {
    try {
      const frontendIndexHtml = readFileSync(frontendIndexPath, 'utf8');
      res.type('html').send(frontendIndexHtml);
      return;
    } catch {
      res.status(503).json({
        ok: false,
        message: 'frontend build missing, run pnpm build',
      });
    }
  };
  app.get(['/overview', '/overview/'], (_req, res) => {
    sendFrontendIndexHtml(res);
  });
  app.get('/slide/:slideId', (_req, res) => {
    sendFrontendIndexHtml(res);
  });
  app.get('/group/:groupId', async (req, res) => {
    const groupId = `${req.params.groupId ?? ''}`.trim();
    if (!groupId) {
      res.status(404).json({
        ok: false,
        message: 'slide-group not found',
      });
      return;
    }
    try {
      const groups = await listSlideGroups(storeContext);
      const isGroupFound = groups.some((group) => `${group?.id ?? ''}`.trim() === groupId);
      if (!isGroupFound) {
        res.status(404).json({
          ok: false,
          message: `slide-group not found: ${groupId}`,
        });
        return;
      }
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to validate slide-group route',
      });
      return;
    }
    sendFrontendIndexHtml(res);
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
      const groupId = getGroupIdFromFrontendPath(req.path);
      if (groupId) {
        try {
          const groups = await listSlideGroups(storeContext);
          const isGroupFound = groups.some((group) => `${group?.id ?? ''}`.trim() === groupId);
          if (!isGroupFound) {
            res.status(404).json({
              ok: false,
              message: `slide-group not found: ${groupId}`,
            });
            return;
          }
        } catch (error) {
          res.status(500).json({
            ok: false,
            message: error instanceof Error ? error.message : 'failed to validate slide-group route',
          });
          return;
        }
      }
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
      console.info(`[slide-backend] slide: http://127.0.0.1:${port}/slide/{slideId}`);
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
