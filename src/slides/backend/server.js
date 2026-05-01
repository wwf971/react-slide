import express from 'express';
import cors from 'cors';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, close } from './db.js';
import {
  createSlide,
  createResource,
  deleteComponent,
  deleteContainer,
  deletePage,
  deleteResource,
  deleteSlide,
  getSlideSnapshot,
  getResourceBytes,
  getResourceText,
  initBackendStore,
  listSlides,
  reinitDatabase,
  renameSlide,
  saveDirtySlide,
  dumpDatabaseSnapshot,
  updateResourceBytes,
  updateResourceText,
} from './store.js';

const currentFilePath = fileURLToPath(import.meta.url);
const backendDir = dirname(currentFilePath);
const projectRootDir = resolve(backendDir, '../../..');
const frontendDistDir = resolve(projectRootDir, 'dist');
const frontendIndexPath = resolve(frontendDistDir, 'index.html');
const backendDumpDir = resolve(projectRootDir, 'data-dumps');

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
  const db = await openDatabase();
  await initBackendStore(db);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/slide/health', (_req, res) => {
    res.json({ ok: true, db: db.info });
  });

  app.get('/api/slide/slides', async (_req, res) => {
    try {
      const slides = await listSlides(db);
      res.json({ ok: true, slides });
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'failed to list slides',
      });
    }
  });

  app.post('/api/slide/slides', async (req, res) => {
    try {
      const slide = await createSlide(db, req.body?.name ?? '');
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
      const result = await deleteSlide(db, req.params.slideId);
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
      const result = await renameSlide(db, req.params.slideId, req.body?.name ?? '');
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
      const result = await getSlideSnapshot(db, req.params.slideId);
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
      const result = await saveDirtySlide(db, req.params.slideId, req.body ?? {});
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
      const result = await deletePage(db, req.params.slideId, req.params.pageId);
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
      const result = await deleteContainer(db, req.params.slideId, req.params.containerId);
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
      const result = await deleteComponent(db, req.params.slideId, req.params.compId);
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
      const result = await createResource(db, req.body?.kind ?? '');
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
      const result = await updateResourceBytes(db, req.params.resourceId, req.body?.base64 ?? '');
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
      const result = await getResourceBytes(db, req.params.resourceId);
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
      const result = await updateResourceText(db, req.params.resourceId, req.body?.text ?? '');
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
      const result = await getResourceText(db, req.params.resourceId);
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
      const result = await deleteResource(db, req.params.resourceId);
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
      const result = await reinitDatabase(db);
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
      const payload = await dumpDatabaseSnapshot(db);
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

  if (existsSync(frontendIndexPath)) {
    app.use(express.static(frontendDistDir));
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/slide')) {
        next();
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      res.sendFile(frontendIndexPath);
    });
  } else {
    app.get('/', (_req, res) => {
      res.status(503).json({
        ok: false,
        message: 'frontend build missing, run pnpm build',
      });
    });
  }

  app.closeBackendDb = async () => {
    await close(db);
  };

  return app;
};

const startSlideBackendServer = async () => {
  const runtimeProcess = globalThis.process;
  const port = Number(runtimeProcess?.env?.SLIDE_BACKEND_PORT ?? 5174);
  const host = runtimeProcess?.env?.SLIDE_BACKEND_HOST ?? '0.0.0.0';
  const app = await createSlideBackendApp();
  const server = app.listen(port, host);
  server.on('listening', () => {
    console.info(`[slide-backend] listening on http://${host}:${port}`);
    console.info(`[slide-backend] local access: http://127.0.0.1:${port}`);
    if (existsSync(frontendIndexPath)) {
      console.info(`[slide-backend] page: http://127.0.0.1:${port}/`);
    } else {
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
