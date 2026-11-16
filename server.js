import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import apiApp from './api/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 9000;

// Mount the Express API
app.use(apiApp);

// Mount the compiled frontend build if available
const frontendDist = path.join(__dirname, 'dist');
app.use(express.static(frontendDist));

// SPA fallback for React router
app.get('*', (req, res) => {
  const indexHtml = path.join(frontendDist, 'index.html');
  res.sendFile(indexHtml, (err) => {
    if (err) {
      res.status(200).send(`
        <html>
          <body style="font-family:sans-serif; background:#121214; color:#eee; padding:40px; text-align:center;">
            <h2>SHMS Central Server (Node.js/Vercel) API Active</h2>
            <p>API endpoints are active at <code>/api/*</code>.</p>
            <p>To view the React dashboard, build the frontend: <code>npm run build</code></p>
          </body>
        </html>
      `);
    }
  });
});

app.listen(PORT, () => {
  console.log(`[SHMS Central Server] Running on http://localhost:${PORT}`);
  console.log(`[SHMS Central Server] Supabase integration active`);
});
