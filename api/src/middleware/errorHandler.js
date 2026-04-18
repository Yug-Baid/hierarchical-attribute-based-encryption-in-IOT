/**
 * src/middleware/errorHandler.js
 * Centralized error handler — keeps route handlers clean.
 */
'use strict';

function errorHandler(err, req, res, _next) {
  const status  = err.status || 500;
  const message = err.message || 'Internal server error';
  console.error(`[error] ${req.method} ${req.path} →`, message);
  res.status(status).json({ ok: false, error: message });
}

function asyncWrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, asyncWrap };