require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');
const { errorHandler, requestLogger } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Voice Lead OS', version: '1.0.0', timestamp: new Date().toISOString() });
});

// API routes — must come before static files
app.use('/', routes);

// Dashboard static files — Next.js export
const dashOut = path.join(__dirname, 'dashboard', 'out');
app.use(express.static(dashOut));

// Dashboard page routes
app.get('/overview',     (req, res) => res.sendFile(path.join(dashOut, 'overview', 'index.html')));
app.get('/leads',        (req, res) => res.sendFile(path.join(dashOut, 'leads', 'index.html')));
app.get('/calls',        (req, res) => res.sendFile(path.join(dashOut, 'calls', 'index.html')));
app.get('/appointments', (req, res) => res.sendFile(path.join(dashOut, 'appointments', 'index.html')));
app.get('/settings',     (req, res) => res.sendFile(path.join(dashOut, 'settings', 'index.html')));
app.get('/',             (req, res) => res.redirect('/overview'));

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅ Voice Lead OS running on port ${PORT}`);
  console.log(`   Dashboard: https://voice-os-0er9.onrender.com/overview`);
});
