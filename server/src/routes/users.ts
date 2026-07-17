import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import * as XLSX from 'xlsx';
import db from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { normalizePhone } from '../phone';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();
router.use(authenticate);
router.use(requireRole('manager'));

router.get('/', (_req: Request, res: Response) => {
  res.json(
    db.prepare('SELECT id, username, full_name, role, team_id, diver_id, phone, email, created_at FROM users ORDER BY full_name').all()
  );
});

router.post('/', (req: Request, res: Response) => {
  const { username, password, full_name, role, team_id, diver_id, phone, email } = req.body;
  if (!username || !password || !full_name || !role) {
    res.status(400).json({ error: 'כל השדות נדרשים' });
    return;
  }

  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, full_name, role, team_id, diver_id, phone, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(username, hash, full_name, role, team_id || null, diver_id || null, normalizePhone(phone), email || '');
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'שם משתמש כבר קיים' });
      return;
    }
    throw e;
  }
});

router.put('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { username, password, full_name, role, team_id, diver_id, phone, email } = req.body;
  const normPhone = normalizePhone(phone);

  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(
      'UPDATE users SET username = ?, password_hash = ?, full_name = ?, role = ?, team_id = ?, diver_id = ?, phone = ?, email = ? WHERE id = ?'
    ).run(username, hash, full_name, role, team_id || null, diver_id || null, normPhone, email || '', id);
  } else {
    db.prepare(
      'UPDATE users SET username = ?, full_name = ?, role = ?, team_id = ?, diver_id = ?, phone = ?, email = ? WHERE id = ?'
    ).run(username, full_name, role, team_id || null, diver_id || null, normPhone, email || '', id);
  }

  res.json({ success: true });
});

router.delete('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (id === req.auth!.userId) {
    res.status(400).json({ error: 'לא ניתן למחוק את המשתמש הנוכחי' });
    return;
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

// Download sample users Excel
router.get('/import/sample', (_req: Request, res: Response) => {
  const headers = ['שם משתמש', 'סיסמה', 'שם מלא', 'תפקיד'];
  const sampleRows = [
    ['moshe', '123456', 'משה כהן', 'secretary'],
    ['david', '123456', 'דוד לוי', 'madar'],
    ['sara', '123456', 'שרה אברהם', 'diver'],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  ws['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, 'משתמשים');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=sample_users.xlsx');
  res.send(buf);
});

// Preview users Excel
router.post('/import/preview', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'קובץ נדרש' }); return; }
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) as Record<string, any>[];
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    res.json({ headers, rows: rows.slice(0, 50), totalRows: rows.length });
  } catch {
    res.status(400).json({ error: 'שגיאה בקריאת הקובץ' });
  }
});

// Import users from Excel
router.post('/import', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'קובץ נדרש' }); return; }

  const mapping = JSON.parse(req.body.mapping || '{}') as Record<string, string>;
  const validRoles = ['manager', 'secretary', 'madar', 'diver'];

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) as Record<string, any>[];

    const upsert = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        full_name = excluded.full_name,
        role = excluded.role
    `);

    let imported = 0;
    const errors: string[] = [];

    const importAll = db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const getValue = (field: string) => {
            const col = mapping[field];
            return col ? String(row[col] || '').trim() : '';
          };

          const username = getValue('username');
          const password = getValue('password');
          const fullName = getValue('full_name');
          let role = getValue('role').toLowerCase();

          if (!username || !fullName) {
            errors.push(`שורה ${i + 2}: שם משתמש ושם מלא נדרשים`);
            continue;
          }

          // Map Hebrew role names
          const roleMap: Record<string, string> = {
            'מנהל': 'manager', 'מזכירה': 'secretary', 'מד"ר': 'madar', 'צולל': 'diver',
            'manager': 'manager', 'secretary': 'secretary', 'madar': 'madar', 'diver': 'diver',
          };
          role = roleMap[role] || role;

          if (!validRoles.includes(role)) {
            errors.push(`שורה ${i + 2}: תפקיד "${getValue('role')}" לא תקין (manager/secretary/madar/diver)`);
            continue;
          }

          // Check if user exists
          const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as any;
          if (existing) {
            // Update without changing password
            db.prepare('UPDATE users SET full_name = ?, role = ? WHERE id = ?').run(fullName, role, existing.id);
          } else {
            if (!password) {
              errors.push(`שורה ${i + 2}: סיסמה נדרשת למשתמש חדש "${username}"`);
              continue;
            }
            const hash = bcrypt.hashSync(password, 10);
            upsert.run(username, hash, fullName, role);
          }
          imported++;
        } catch (e: any) {
          errors.push(`שורה ${i + 2}: ${e.message}`);
        }
      }
    });

    importAll();
    res.json({ imported, errors, total: rows.length });
  } catch {
    res.status(400).json({ error: 'שגיאה בעיבוד הקובץ' });
  }
});

export default router;
