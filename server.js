require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const routes = require('./routes');
const authRoutes = require('./authRoutes');
const { errorHandler, requestLogger } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 10000;
const NEXT_PORT = process.env.NEXT_PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(requestLogger);

// ── Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Voice Lead OS', timestamp: new Date().toISOString() });
});

// ── Auth API routes
app.use('/auth', authRoutes);

// ── API routes (webhooks, dashboard data, settings)
app.use('/', routes);

// ── Everything else → proxy to Next.js
// Next.js handles all dashboard pages (/, /overview, /leads, /calls etc)
app.use('/', createProxyMiddleware({
  target: `http://localhost:${NEXT_PORT}`,
  changeOrigin: true,
  ws: true,
  on: {
    error: (err, req, res) => {
      console.error('[Proxy Error]', err.message);
      if (res.writeHead) {
        res.writeHead(502);
        res.end('Dashboard starting up — please refresh in a moment.');
      }
    }
  }
}));

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅ Voice Lead OS API running on port ${PORT}`);
  console.log(`   Proxying dashboard from Next.js on port ${NEXT_PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});
