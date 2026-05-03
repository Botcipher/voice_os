require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { errorHandler, requestLogger } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// ─── Health check ─────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Voice Lead OS',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ───────────────────────────────────
app.use('/', routes);

// ─── Error Handler ────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Voice Lead OS running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});
