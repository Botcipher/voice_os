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

module.exports = { errorHandler, requestLogger };
