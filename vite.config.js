import { defineConfig } from 'vite';
import { getIss } from './api/iss.js';

export default defineConfig({
  build: {
    target: 'es2020',
  },
  plugins: [
    {
      // dev only: serve /api/iss with the same code the Vercel function runs
      name: 'iss-dev-api',
      configureServer(server) {
        server.middlewares.use('/api/iss', async (_req, res) => {
          try {
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(await getIss()));
          } catch {
            res.statusCode = 502;
            res.end('{"error":"unavailable"}');
          }
        });
      },
    },
  ],
});
