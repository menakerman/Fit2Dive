import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { initDb } from './db';
import authRoutes from './routes/auth';
import diverRoutes from './routes/divers';
import certRoutes from './routes/certifications';
import teamRoutes from './routes/teams';
import userRoutes from './routes/users';
import uploadRoutes from './routes/upload';
import diverAuthRoutes from './routes/diverAuth';
import configRoutes from './routes/config';
import activityRoutes from './routes/activities';
import diverCertRoutes from './routes/diverCerts';

const app = express();
const PORT = process.env.PORT || 3001;

const isProduction = process.env.NODE_ENV === 'production';

// Behind Railway's proxy — needed for correct client IPs (rate limiting, logs).
app.set('trust proxy', 1);

// Security headers. The CSP is permissive enough for the built SPA (self-hosted
// scripts, self + inline styles, data: images/fonts, same-origin API/XHR).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
    },
  },
}));

// The client is served from the same origin in production, so cross-origin
// requests are disallowed unless CORS_ORIGIN is explicitly configured.
app.use(cors(isProduction
  ? { origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : false }
  : { origin: ['http://localhost:5173', 'http://localhost:3000'] }));

app.use(express.json({ limit: '1mb' }));

// Rate-limit authentication / OTP endpoints (brute force, SMS-cost abuse,
// enumeration). Generous enough for legitimate use; keyed on the real client IP.
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' },
});

// Init database
initDb();

// API Routes
app.use('/api/diver-auth', authLimiter, diverAuthRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/divers', diverRoutes);
app.use('/api/certifications', certRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/config', configRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/diver-certs', diverCertRoutes);

// In production, serve the built client
if (isProduction) {
  // Resolve client dist path (fallback to cwd for Railway)
  const fs = require('fs');
  let clientDist = path.join(__dirname, '..', '..', '..', '..', 'client', 'dist');
  if (!fs.existsSync(clientDist)) {
    clientDist = path.join(process.cwd(), 'client', 'dist');
  }
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
