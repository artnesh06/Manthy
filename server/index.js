const express = require('express');
const cors = require('cors');
const path = require('path');

// Load .env file if dotenv is available
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch(e) {}

const { initDB } = require('./db');
const { startCronJobs } = require('./cron');

const app = express();
const PORT = process.env.PORT || 3001;

// === CREDENTIALS — NO DEFAULTS, MUST BE SET IN .env ===
const ADMIN_KEY = process.env.ADMIN_KEY;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
if (!ADMIN_KEY || !ADMIN_USER || !ADMIN_PASS) {
  console.error('FATAL: ADMIN_KEY, ADMIN_USER, and ADMIN_PASS must be set in .env');
  process.exit(1);
}

// === CORS — production only, no localhost ===
const allowedOrigins = process.env.NODE_ENV === 'development'
  ? ['https://manthy.fun', 'https://www.manthy.fun', 'https://manthy.vercel.app', 'http://localhost:3001', 'http://localhost:3000']
  : ['https://manthy.fun', 'https://www.manthy.fun', 'https://manthy.vercel.app'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// === SECURITY HEADERS ===
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '100kb' }));

// === RATE LIMITING (improved in-memory with per-route support) ===
const rateMap = new Map();
function rateLimit(maxReqs, windowMs) {
  return (req, res, next) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : (req.ip || 'unknown');
    const now = Date.now();
    if (!rateMap.has(ip)) rateMap.set(ip, []);
    const hits = rateMap.get(ip).filter(t => t > now - windowMs);
    if (hits.length >= maxReqs) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }
    hits.push(now);
    rateMap.set(ip, hits);
    next();
  };
}

// Strict rate limit for admin login — 5 attempts per 15 minutes
const adminLoginLimit = rateLimit(5, 15 * 60 * 1000);

// Clean rate map every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of rateMap) {
    const valid = hits.filter(t => t > now - 15 * 60 * 1000);
    if (valid.length === 0) rateMap.delete(ip);
    else rateMap.set(ip, valid);
  }
}, 300000);

// === ADMIN AUTH MIDDLEWARE ===
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Invalid admin key.' });
  }
  next();
}

// Admin HTML — served normally (has its own login page)
// Admin login endpoint — rate limited, validates credentials, returns admin key
app.post('/api/admin-login', adminLoginLimit, express.json(), (req, res) => {
  const { id, pw } = req.body;
  if (!id || !pw) {
    return res.status(400).json({ error: 'ID and password required' });
  }
  // Constant-time comparison to prevent timing attacks
  const idMatch = id.length === ADMIN_USER.length && require('crypto').timingSafeEqual(Buffer.from(id), Buffer.from(ADMIN_USER));
  const pwMatch = pw.length === ADMIN_PASS.length && require('crypto').timingSafeEqual(Buffer.from(pw), Buffer.from(ADMIN_PASS));
  if (idMatch && pwMatch) {
    return res.json({ success: true, key: ADMIN_KEY });
  }
  // Delay response on failure to slow brute force
  setTimeout(() => {
    res.status(401).json({ error: 'Invalid credentials' });
  }, 1000);
});
// API endpoints still protected by X-Admin-Key header
app.use(express.static(path.join(__dirname, '..'), {
  index: 'index.html'
}));

// Rate limit: 60 requests per minute for write APIs
const writeLimit = rateLimit(60, 60000);
// Rate limit: 120 requests per minute for read APIs
const readLimit = rateLimit(120, 60000);

app.use('/api/auth', readLimit, require('./routes/auth'));
app.use('/api/stake', writeLimit, require('./routes/stake'));
app.use('/api/feed', writeLimit, require('./routes/feed'));
app.use('/api/catch', writeLimit, require('./routes/catch'));
app.use('/api/claim', writeLimit, require('./routes/claim'));
app.use('/api/leaderboard', readLimit, require('./routes/leaderboard'));
app.use('/api/museum', readLimit, require('./routes/museum'));
app.use('/api/admin', adminAuth, require('./routes/admin'));
app.use('/api/winners', readLimit, require('./routes/winners'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Init DB then start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Manthy server on port ${PORT}`);
    console.log(`Admin panel: /admin.html`);
    startCronJobs();
  });
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
