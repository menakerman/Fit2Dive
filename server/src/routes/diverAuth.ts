import { Router, Request, Response } from 'express';
import db from '../db';
import { signToken, authenticate, requireRole } from '../middleware/auth';
import { sendOtpEmail, isEmailConfigured } from '../email';
import { sendOtpSms, isSmsConfigured } from '../sms';
import { normalizePhone } from '../phone';
import { normalizePersonalNumber } from '../personalNumber';

function getConfig(key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value || fallback;
}

const router = Router();

// Request OTP - public endpoint
router.post('/request-otp', async (req: Request, res: Response) => {
  const { phone, personal_number } = req.body;
  if (!phone || !personal_number) {
    res.status(400).json({ error: 'יש להזין מספר טלפון ומספר אישי' });
    return;
  }

  // Divers identify with phone + personal number (מספר אישי): the national ID
  // is optional, while the personal number is mandatory for every diver. The
  // phone is normalized to its canonical form so any valid format the diver
  // types matches the stored number.
  const diver = db.prepare(`
    SELECT id, first_name, last_name, personal_number, email, phone
    FROM divers
    WHERE phone = ? AND personal_number = ?
  `).get(normalizePhone(phone), normalizePersonalNumber(personal_number)) as any;

  if (!diver) {
    res.status(404).json({ error: 'פרטים לא נמצאו. יש לפנות למיכאל חמדי לברור הפרטים' });
    return;
  }

  // Check lockout
  const attempts = db.prepare(
    'SELECT * FROM diver_otp_attempts WHERE diver_id = ?'
  ).get(diver.id) as any;

  if (attempts?.locked_until && new Date(attempts.locked_until + 'Z') > new Date()) {
    const unlockTime = new Date(attempts.locked_until + 'Z');
    res.status(403).json({
      error: `החשבון נעול. נסה שוב אחרי ${unlockTime.toLocaleString('he-IL')}`,
    });
    return;
  }

  // Invalidate previous unused OTPs
  db.prepare(
    'UPDATE diver_otp_codes SET used = 1 WHERE diver_id = ? AND used = 0'
  ).run(diver.id);

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  const otpExpiry = getConfig('otp_expiry_minutes', '5');
  db.prepare(`
    INSERT INTO diver_otp_codes (diver_id, code, expires_at)
    VALUES (?, ?, datetime('now', '+${parseInt(otpExpiry)} minutes'))
  `).run(diver.id, code);

  console.log(`[OTP] ${diver.first_name} ${diver.last_name} (${diver.personal_number}): ${code}`);

  const orgName = getConfig('org_name', 'Fit2Dive');
  const diverPhone = diver.phone || normalizePhone(phone);

  // Deliver the code by SMS first (the diver logs in with their phone), then
  // fall back to email, then to returning it on screen for testing.
  let smsSent = false;
  if (diverPhone && isSmsConfigured()) {
    const result = await sendOtpSms(diverPhone, code, orgName);
    smsSent = result.ok;
    if (!result.ok) {
      console.error(`[OTP] SMS to ${diverPhone} failed: ${result.error}`);
    }
  }

  // Try to email the code to the diver, when they have an address and
  // SendGrid is configured.
  let emailSent = false;
  if (!smsSent && diver.email && isEmailConfigured()) {
    const result = await sendOtpEmail(diver.email, code, orgName);
    emailSent = result.ok;
    if (!result.ok) {
      console.error(`[OTP] email to ${diver.email} failed: ${result.error}`);
    }
  }

  // The code is delivered by SMS/email and never returned in production. The
  // on-screen fallback exists only for local development without SMS/email.
  const delivered = smsSent || emailSent;
  const isProduction = process.env.NODE_ENV === 'production';
  if (!delivered && isProduction) {
    res.status(502).json({ error: 'לא ניתן לשלוח קוד אימות כרגע. נסה שוב מאוחר יותר.' });
    return;
  }
  res.json({
    success: true,
    diver_id: diver.id,
    sms_sent: smsSent,
    phone_hint: smsSent ? maskPhone(diverPhone) : undefined,
    email_sent: emailSent,
    email_hint: emailSent ? maskEmail(diver.email) : undefined,
    otp_code: (!delivered && !isProduction) ? code : undefined,
  });
});

// Masks a phone for display, e.g. "0501234567" -> "050****567".
function maskPhone(phone: string): string {
  const p = phone.replace(/[\s-]/g, '');
  if (p.length < 6) return p;
  return `${p.slice(0, 3)}${'*'.repeat(p.length - 6)}${p.slice(-3)}`;
}

// Masks an email for display, e.g. "john.doe@gmail.com" -> "jo***@gmail.com".
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const shown = local.slice(0, 2);
  return `${shown}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

// Verify OTP - public endpoint
router.post('/verify-otp', (req: Request, res: Response) => {
  const { diver_id, code } = req.body;
  if (!diver_id || !code) {
    res.status(400).json({ error: 'קוד אימות נדרש' });
    return;
  }

  // Check lockout
  const attempts = db.prepare(
    'SELECT * FROM diver_otp_attempts WHERE diver_id = ?'
  ).get(diver_id) as any;

  if (attempts?.locked_until && new Date(attempts.locked_until + 'Z') > new Date()) {
    const unlockTime = new Date(attempts.locked_until + 'Z');
    res.status(403).json({
      error: `החשבון נעול. נסה שוב אחרי ${unlockTime.toLocaleString('he-IL')}`,
    });
    return;
  }

  // Find valid OTP
  const otp = db.prepare(`
    SELECT * FROM diver_otp_codes
    WHERE diver_id = ? AND used = 0 AND expires_at > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(diver_id) as any;

  if (!otp) {
    res.status(400).json({ error: 'קוד לא תקף או פג תוקף' });
    return;
  }

  if (otp.code !== code.trim()) {
    const maxAttempts = parseInt(getConfig('otp_max_attempts', '3'));
    const lockoutHours = parseInt(getConfig('lockout_hours', '12'));

    // Wrong code - increment attempts
    if (attempts) {
      const newCount = attempts.failed_attempts + 1;
      if (newCount >= maxAttempts) {
        db.prepare(
          `UPDATE diver_otp_attempts SET failed_attempts = ?, locked_until = datetime('now', '+${lockoutHours} hours'), last_attempt_at = datetime('now') WHERE diver_id = ?`
        ).run(newCount, diver_id);
        db.prepare('UPDATE diver_otp_codes SET used = 1 WHERE id = ?').run(otp.id);
        res.status(403).json({ error: `החשבון ננעל ל-${lockoutHours} שעות עקב ${maxAttempts} ניסיונות כושלים` });
        return;
      }
      db.prepare(
        `UPDATE diver_otp_attempts SET failed_attempts = ?, last_attempt_at = datetime('now') WHERE diver_id = ?`
      ).run(newCount, diver_id);
      res.status(401).json({ error: `קוד שגוי. נותרו ${maxAttempts - newCount} ניסיונות` });
    } else {
      db.prepare(
        `INSERT INTO diver_otp_attempts (diver_id, failed_attempts) VALUES (?, 1)`
      ).run(diver_id);
      res.status(401).json({ error: `קוד שגוי. נותרו ${maxAttempts - 1} ניסיונות` });
    }
    return;
  }

  // Code correct
  db.prepare('UPDATE diver_otp_codes SET used = 1 WHERE id = ?').run(otp.id);

  // Reset attempts
  if (attempts) {
    db.prepare(
      'UPDATE diver_otp_attempts SET failed_attempts = 0, locked_until = NULL WHERE diver_id = ?'
    ).run(diver_id);
  }

  // Log access
  db.prepare(
    'INSERT INTO diver_access_log (diver_id, ip_address) VALUES (?, ?)'
  ).run(diver_id, req.ip || '');

  // Get diver data
  const diver = db.prepare('SELECT * FROM divers WHERE id = ?').get(diver_id) as any;

  // Issue token (1 hour for OTP sessions)
  const token = signToken(
    { userId: 0, role: 'diver', teamId: null, diverId: diver_id },
    '1h'
  );

  res.json({ token, diver });
});

// Access log - manager only
router.get('/access-log', authenticate, requireRole('manager'), (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const offset = parseInt(req.query.offset as string) || 0;
  const diverId = req.query.diver_id as string;

  let query = `
    SELECT dal.id, dal.diver_id, dal.ip_address, dal.accessed_at,
           d.first_name, d.last_name, d.id_number
    FROM diver_access_log dal
    JOIN divers d ON dal.diver_id = d.id
  `;
  const params: any[] = [];

  if (diverId) {
    query += ' WHERE dal.diver_id = ?';
    params.push(parseInt(diverId));
  }

  query += ' ORDER BY dal.accessed_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.prepare(query).all(...params);
  const total = db.prepare(
    `SELECT COUNT(*) as count FROM diver_access_log${diverId ? ' WHERE diver_id = ?' : ''}`
  ).get(...(diverId ? [parseInt(diverId)] : [])) as { count: number };

  res.json({ rows, total: total.count });
});

export default router;
