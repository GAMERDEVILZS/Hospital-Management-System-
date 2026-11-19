import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { db } from './server/db.ts';
import { apiRouter } from './server/routes.ts';

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

async function startServer(): Promise<void> {
  await db.init();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.use('/api', apiRouter);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Meridian Clinical] Full-stack server running on http://0.0.0.0:${PORT} (${db.getMode()})`);
  });
}

startServer().catch((err) => {
  console.error('[Meridian Clinical] Fatal startup error:', err);
  process.exit(1);
});
