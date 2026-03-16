'use strict';

require('./config/environment');

const http    = require('http');
const path    = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');

const { testConnection: dbTest }   = require('./config/database');
const { testConnection: redisTest } = require('./config/redis');
const socketServer  = require('./websocket/socketServer');
const { registerEvents } = require('./websocket/socketEvents');
const tableManager  = require('./game/tableManager');
const authController = require('./auth/authController');
const { authenticateToken } = require('./auth/jwtMiddleware');
const depositRouter = require('./payment/paymentDemo');
const verifyRouter  = require('./routes/verifyRoute');
const { port, nodeEnv } = require('./config/environment');
const logger = require('./utils/logger');

async function bootstrap() {
  const app = express();

  // ── CORS ─────────────────────────────────────────────
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: '16kb' })); // reject huge payloads

  // ── Serve web client (static, no auth needed) ────────
  // Static client serving removed for production API deployment


  // ── Public health check ──────────────────────────────
  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', env: nodeEnv, time: new Date().toISOString() })
  );

  // ── Rate limiter for auth endpoints ──────────────────
  // 10 attempts per IP per 15 minutes — prevents brute force
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again after 15 minutes.' },
  });

  // ── PUBLIC endpoints (no token required) ─────────────
  app.post('/register', authLimiter, authController.register);
  app.post('/login',    authLimiter, authController.login);

  // ── PRIVATE endpoints — must be authenticated ────────
  // All routes below this line require a valid JWT
  app.use(authenticateToken);

  app.use('/deposit', depositRouter);
  app.use('/verify',  verifyRouter);  // fairness data — only for logged-in users

  // Catch-all for unknown authenticated routes
  app.use('/api/*', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // ── Socket.io (JWT enforced in socketServer handshake) ──
  const httpServer = http.createServer(app);
  const io = socketServer.init(httpServer);
  io.on('connection', (socket) => registerEvents(socket));

  // ── Infrastructure ────────────────────────────────────
  await dbTest();
  await redisTest();

  // ── Game ──────────────────────────────────────────────
  tableManager.init(io);
  logger.info('Table manager ready', { tables: tableManager.listTables() });

  // ── Listen ────────────────────────────────────────────
  httpServer.listen(port, '0.0.0.0', () => {
    logger.info(`Dragon Tiger server → http://0.0.0.0:${port}`, { nodeEnv });
  });

  // ── Graceful shutdown ─────────────────────────────────
  const shutdown = (signal) => {
    logger.info(`${signal} — shutting down`);
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException',  (err) => logger.error('Uncaught exception',  { stack: err.stack }));
  process.on('unhandledRejection', (r)   => logger.error('Unhandled rejection', { reason: String(r) }));
}

bootstrap().catch((err) => {
  console.error('Server failed to start:', err.stack || err.message);
  process.exit(1);
});
