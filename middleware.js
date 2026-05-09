const supabase = require('./supabase');

// Validates Bearer token against sessions table.
// Attaches req.tenant_id on success.
// Applied to all dashboard routes and PUT /settings.
// NOT applied to: POST /webhooks/retell, GET /settings/:id (used by n8n), /auth/*
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized — no token provided' });
  }

  const token = auth.slice(7);

  const { data: session, error } = await supabase
    .from('sessions')
    .select('*, users(*)')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !session) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.tenant_id = session.users.tenant_id;
  next();
}

// Global error handler — catches any unhandled errors in routes
function errorHandler(err, req, res, next) {
  console.error('[Error]', err.message);
  console.error(err.stack);

  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

// Request logger
function requestLogger(req, res, next) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
}

module.exports = { errorHandler, requestLogger, requireAuth };
