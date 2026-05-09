require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const path = require('path');

const routes = require('./routes');
const authRoutes = require('./authRoutes');
const { errorHandler, requestLogger } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 10000;

// ─────────────────────────────────────────────
// CORE MIDDLEWARE
// ─────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(requestLogger);

// ─────────────────────────────────────────────
// 🔥 GLOBAL REQUEST SANITIZER (BULLETPROOF)
// Blocks bot garbage like /settings/index.txt
// BEFORE it reaches static or API routes
// ─────────────────────────────────────────────

app.use((req, res, next) => {
  const path = req.path;

  // Block common static probing requests
  if (
    path.endsWith('.txt') ||
    path.endsWith('.map') ||
    path.endsWith('.css') ||
    path.endsWith('.js') ||
    path.endsWith('.ico')
  ) {
    return res.status(404).end();
  }

  // Block things like /settings/index.txt
  const lastPart = path.split('/').pop();

  if (
    lastPart &&
    lastPart.includes('.') &&   // has extension
    lastPart !== 'favicon.ico'  // allow favicon if needed
  ) {
    return res.status(404).end();
  }

  next();
});

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Voice Lead OS',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────
// AUTH ROUTES (PUBLIC)
// ─────────────────────────────────────────────

app.use('/auth', authRoutes);

// ─────────────────────────────────────────────
// DASHBOARD STATIC FILES
// ─────────────────────────────────────────────

const dashOut = path.join(__dirname, 'dashboard', 'out');

// 🔥 IMPORTANT: fallthrough: false prevents unknown files
// from leaking into API routes
app.use(express.static(dashOut, {
  fallthrough: false,
}));

// ─────────────────────────────────────────────
// DASHBOARD PAGE ROUTES
// ─────────────────────────────────────────────

app.get('/login',        (req, res) => res.sendFile(path.join(dashOut, 'login',        'index.html')));
app.get('/overview',     (req, res) => res.sendFile(path.join(dashOut, 'overview',     'index.html')));
app.get('/leads',        (req, res) => res.sendFile(path.join(dashOut, 'leads',        'index.html')));
app.get('/calls',        (req, res) => res.sendFile(path.join(dashOut, 'calls',        'index.html')));
app.get('/appointments', (req, res) => res.sendFile(path.join(dashOut, 'appointments', 'index.html')));
app.get('/settings',     (req, res) => res.sendFile(path.join(dashOut, 'settings',     'index.html')));
app.get('/',             (req, res) => res.redirect('/overview'));

// ─────────────────────────────────────────────
// API ROUTES
// (after static so bad file requests never reach here)
// ─────────────────────────────────────────────

app.use('/', routes);

// ─────────────────────────────────────────────
// ERROR HANDLER
// ─────────────────────────────────────────────

app.use(errorHandler);

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Voice Lead OS running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Dashboard: http://localhost:${PORT}/overview`);
});
