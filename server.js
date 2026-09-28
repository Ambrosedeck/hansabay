const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const config = require('./src/config');

// Initialise DB (runs migrations + seed on first start)
require('./src/db');

const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');
const mediaRoutes = require('./src/routes/media');

const app = express();
app.disable('x-powered-by');
if (config.isProduction) app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(
  cookieSession({
    name: 'packstream.sid',
    keys: [config.sessionSecret],
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
  })
);

// Basic hardening headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// API
app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/media', mediaRoutes);

// Static front-end
const publicDir = path.join(config.root, 'public');
app.use(express.static(publicDir, { extensions: ['html'] }));
app.get('/admin', (req, res) => res.sendFile(path.join(publicDir, 'admin.html')));

// 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong' });
});

app.listen(config.port, () => {
  console.log(`PackStream running at http://localhost:${config.port}`);
  console.log(`Admin panel:        http://localhost:${config.port}/admin`);
  console.log(`Storage driver:     ${config.storage.driver}`);
  if (config.sessionSecret === 'dev-insecure-secret-change-me') {
    console.warn('WARNING: SESSION_SECRET is not set. Set it in .env before going live.');
  }
});
