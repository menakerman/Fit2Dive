import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../db';
import { signToken, authenticate, requireRole } from '../middleware/auth';
import { sendOtpSms, isSmsConfigured } from '../sms';
import { sendOtpEmail, isEmailConfigured } from '../email';

const MAX_ATTEMPTS = 3;
const LOCKOUT_HOURS = 12;

const router = Router();

function getConfig(key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value || fallback;
}

// One-time codes are stored hashed, never in plaintext.
function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(String(code).trim()).digest('hex');
}

function maskPhone(phone: string): string {
  const p = (phone || '').replace(/[\s-]/g, '');
  if (p.length < 6) return p;
  return `${p.slice(0, 3)}${'*'.repeat(p.length - 6)}${p.slice(-3)}`;
}

function maskEmail(email: string): string {
  const [local, domain] = (email || '').split('@');
  if (!domain) return email || '';
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

function logLoginAttempt(username: string, fullName: string, success: boolean, ip: string, reason: string) {
  db.prepare(
    'INSERT INTO user_login_log (username, full_name, success, ip_address, reason) VALUES (?, ?, ?, ?, ?)'
  ).run(username, fullName, success ? 1 : 0, ip, reason);
}

function checkLockout(username: string): string | null {
  const attempts = db.prepare(
    'SELECT * FROM user_login_attempts WHERE username = ?'
  ).get(username) as any;

  if (attempts?.locked_until && new Date(attempts.locked_until + 'Z') > new Date()) {
    const unlockTime = new Date(attempts.locked_until + 'Z');
    return `החשבון נעול. נסה שוב אחרי ${unlockTime.toLocaleString('he-IL')}`;
  }
  return null;
}

function recordFailedAttempt(username: string): { locked: boolean; remaining: number } {
  const attempts = db.prepare(
    'SELECT * FROM user_login_attempts WHERE username = ?'
  ).get(username) as any;

  if (attempts) {
    const newCount = attempts.failed_attempts + 1;
    if (newCount >= MAX_ATTEMPTS) {
      db.prepare(
        `UPDATE user_login_attempts SET failed_attempts = ?, locked_until = datetime('now', '+${LOCKOUT_HOURS} hours'), last_attempt_at = datetime('now') WHERE username = ?`
      ).run(newCount, username);
      return { locked: true, remaining: 0 };
    }
    db.prepare(
      `UPDATE user_login_attempts SET failed_attempts = ?, last_attempt_at = datetime('now') WHERE username = ?`
    ).run(newCount, username);
    return { locked: false, remaining: MAX_ATTEMPTS - newCount };
  } else {
    db.prepare(
      'INSERT INTO user_login_attempts (username, failed_attempts) VALUES (?, 1)'
    ).run(username);
    return { locked: false, remaining: MAX_ATTEMPTS - 1 };
  }
}

function resetAttempts(username: string) {
  db.prepare(
    'UPDATE user_login_attempts SET failed_attempts = 0, locked_until = NULL WHERE username = ?'
  ).run(username);
}

// Step 1: verify username + password, then send a one-time code to the user's
// phone (SMS) or email. The code is never returned in the response.
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'שם משתמש וסיסמה נדרשים' });
    return;
  }

  const ip = req.ip || '';

  const lockMsg = checkLockout(username);
  if (lockMsg) {
    logLoginAttempt(username, '', false, ip, 'חשבון נעול');
    res.status(403).json({ error: lockMsg });
    return;
  }

  const user = db.prepare(
    'SELECT id, username, password_hash, full_name, role, team_id, diver_id, phone, email FROM users WHERE username = ?'
  ).get(username) as any;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    const result = recordFailedAttempt(username);
    const reason = result.locked
      ? `ננעל אחרי ${MAX_ATTEMPTS} ניסיונות כושלים`
      : 'סיסמה שגויה';
    logLoginAttempt(username, user?.full_name || '', false, ip, reason);

    if (result.locked) {
      res.status(403).json({ error: `החשבון ננעל ל-${LOCKOUT_HOURS} שעות עקב ${MAX_ATTEMPTS} ניסיונות כושלים` });
    } else {
      res.status(401).json({ error: `שם משתמש או סיסמה שגויים. נותרו ${result.remaining} ניסיונות` });
    }
    return;
  }

  // Password correct — reset attempts, generate and deliver a one-time code.
  resetAttempts(username);

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  db.prepare('UPDATE user_otp_codes SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);
  const otpExpiry = getConfig('otp_expiry_minutes', '5');
  db.prepare(`
    INSERT INTO user_otp_codes (user_id, code_hash, expires_at)
    VALUES (?, ?, datetime('now', '+${parseInt(otpExpiry)} minutes'))
  `).run(user.id, hashOtp(code));

  const orgName = getConfig('org_name', 'Fit2Dive');
  let smsSent = false;
  let emailSent = false;
  if (user.phone && isSmsConfigured()) {
    const r = await sendOtpSms(user.phone, code, orgName);
    smsSent = r.ok;
    if (!r.ok) console.error(`[Staff OTP] SMS to ${user.username} failed: ${r.error}`);
  }
  if (!smsSent && user.email && isEmailConfigured()) {
    const r = await sendOtpEmail(user.email, code, orgName);
    emailSent = r.ok;
    if (!r.ok) console.error(`[Staff OTP] email to ${user.username} failed: ${r.error}`);
  }

  if (!smsSent && !emailSent) {
    res.status(502).json({ error: 'לא ניתן לשלוח קוד אימות. ודא שמוגדר טלפון או אימייל למשתמש, או פנה למנהל המערכת.' });
    return;
  }

  res.json({
    pending_user_id: user.id,
    full_name: user.full_name,
    sent_to: smsSent ? maskPhone(user.phone) : maskEmail(user.email),
  });
});

// Step 2: verify the one-time code and issue a token.
router.post('/verify-otp', (req: Request, res: Response) => {
  const { pending_user_id, code } = req.body;
  if (!pending_user_id || !code) {
    res.status(400).json({ error: 'קוד אימות נדרש' });
    return;
  }

  const ip = req.ip || '';

  const user = db.prepare(
    'SELECT id, username, full_name, role, team_id, diver_id, phone, email FROM users WHERE id = ?'
  ).get(pending_user_id) as any;

  if (!user) {
    res.status(404).json({ error: 'משתמש לא נמצא' });
    return;
  }

  const lockMsg = checkLockout(user.username);
  if (lockMsg) {
    logLoginAttempt(user.username, user.full_name, false, ip, 'חשבון נעול');
    res.status(403).json({ error: lockMsg });
    return;
  }

  const otp = db.prepare(`
    SELECT * FROM user_otp_codes
    WHERE user_id = ? AND used = 0 AND expires_at > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(pending_user_id) as any;

  if (!otp || hashOtp(code) !== otp.code_hash) {
    const result = recordFailedAttempt(user.username);
    const reason = result.locked
      ? `ננעל אחרי ${MAX_ATTEMPTS} ניסיונות כושלים`
      : 'קוד OTP שגוי';
    logLoginAttempt(user.username, user.full_name, false, ip, reason);
    if (result.locked) {
      res.status(403).json({ error: `החשבון ננעל ל-${LOCKOUT_HOURS} שעות עקב ${MAX_ATTEMPTS} ניסיונות כושלים` });
    } else {
      res.status(401).json({ error: `קוד אימות שגוי. נותרו ${result.remaining} ניסיונות` });
    }
    return;
  }

  // Success — consume the code, reset attempts, issue token.
  db.prepare('UPDATE user_otp_codes SET used = 1 WHERE id = ?').run(otp.id);
  resetAttempts(user.username);
  logLoginAttempt(user.username, user.full_name, true, ip, 'התחברות מוצלחת');

  const token = signToken({
    userId: user.id,
    role: user.role,
    teamId: user.team_id,
    diverId: user.diver_id,
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      team_id: user.team_id,
      diver_id: user.diver_id,
      phone: user.phone,
      email: user.email,
      created_at: '',
    },
  });
});

// Get user login log - manager only
router.get('/login-log', authenticate, requireRole('manager'), (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const offset = parseInt(req.query.offset as string) || 0;

  const rows = db.prepare(
    'SELECT * FROM user_login_log ORDER BY attempted_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM user_login_log').get() as { count: number };

  res.json({ rows, total: total.count });
});

router.get('/me', authenticate, (req: Request, res: Response) => {
  const user = db.prepare(
    'SELECT id, username, full_name, role, team_id, diver_id, phone, email, created_at FROM users WHERE id = ?'
  ).get(req.auth!.userId) as any;
  if (!user) {
    res.status(404).json({ error: 'משתמש לא נמצא' });
    return;
  }
  res.json(user);
});

export default router;
