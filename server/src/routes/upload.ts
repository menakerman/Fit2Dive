import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import db from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { normalizePhone } from '../phone';
import { normalizePersonalNumber } from '../personalNumber';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);
router.use(requireRole('manager', 'secretary'));

const DEFAULT_FITNESS_STATUS = 'טרם נבדק';

// Normalizes a date string to YYYY-MM-DD. Accepts DD/MM/YYYY (and . or - as
// separators) as well as YYYY-MM-DD. The sentinel year 9999 (e.g. 31/12/9999,
// used by the source system for "no expiry") is treated as no date. Returns
// null when the value is empty or unparseable.
function normalizeDate(value: string): string | null {
  const s = (value || '').trim();
  if (!s) return null;

  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    if (y === '9999') return null;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }

  return null;
}

// Returns the trimmed status, or the default when the cell is empty. Unknown
// values are preserved as-is so no source data is lost.
function normalizeStatus(value: string): string {
  return (value || '').trim() || DEFAULT_FITNESS_STATUS;
}

// Download a sample כשירות report matching the expected import format.
router.get('/sample', (_req: Request, res: Response) => {
  const headers = [
    'מספר אישי', 'שם פרטי', 'שם משפחה', 'סטטוס כשירות',
    'הערה 1', 'הערה 2', 'הערה 3',
    'תאריך סטטוס כשירות', 'תאריך סיום תוקף כשירות', 'ימי אי כשירות', 'תאריך בדיקה אחרון',
  ];
  const sampleRows = [
    ['03343780', 'ישראל', 'ישראלי', 'כשיר', '', '', '', '19/09/2023', '31/12/2027', '0', '2023-09-19'],
    ['03705865', 'דנה', 'כהן', 'בלתי כשיר זמנית', 'להשלים בדיקת שתן כללית', 'בדיקת שתן', '', '20/09/2025', '19/07/2027', '298', '2025-07-20'],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  ws['!cols'] = headers.map(() => ({ wch: 16 }));
  XLSX.utils.book_append_sheet(wb, ws, 'כשירות');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=sample_divers.xlsx');
  res.send(buf);
});

// Preview Excel data (headers + first rows) so the client can map columns.
router.post('/preview', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'קובץ נדרש' });
    return;
  }

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

// Import divers from the כשירות report. Creates new divers and updates existing
// ones, keyed on מספר אישי (personal_number). Any number of הערה columns are
// collected into each diver's required-exam list.
router.post('/import', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'קובץ נדרש' });
    return;
  }

  const mapping = JSON.parse(req.body.mapping || '{}') as Record<string, string>;
  // Column headers to treat as required-exam notes (הערה 1, הערה 2, ...).
  const examColumns = JSON.parse(req.body.exam_columns || '[]') as string[];

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) as Record<string, any>[];

    // Name of the staff member running this import, for change provenance.
    const importer = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.auth!.userId) as { full_name: string } | undefined;
    const importerName = importer?.full_name || '';

    const findByPersonal = db.prepare('SELECT id FROM divers WHERE personal_number = ?');
    const insertDiver = db.prepare(`
      INSERT INTO divers (
        first_name, last_name, personal_number, id_number, phone, email,
        fitness_status, fitness_status_date, fitness_expiry_date, unfit_days,
        last_exam_date, medical_last_updated, notes, last_update_source, last_updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, 'file_create', ?)
    `);
    // Updating an existing diver only touches fitness/status data. Identity and
    // contact fields (name, personal_number, id_number, phone, email) are left
    // exactly as they are — the import must not overwrite them.
    const updateDiver = db.prepare(`
      UPDATE divers SET
        fitness_status = ?, fitness_status_date = ?, fitness_expiry_date = ?,
        unfit_days = ?, last_exam_date = ?, medical_last_updated = datetime('now'),
        last_update_source = 'file_update', last_updated_by = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    const deleteExams = db.prepare('DELETE FROM diver_required_exams WHERE diver_id = ?');
    const insertExam = db.prepare('INSERT INTO diver_required_exams (diver_id, exam, sort_order) VALUES (?, ?, ?)');

    let imported = 0;
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    const importAll = db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const getValue = (field: string) => {
            const col = mapping[field];
            return col ? String(row[col] ?? '').trim() : '';
          };

          const personalNumber = normalizePersonalNumber(getValue('personal_number'));
          if (!personalNumber) {
            errors.push(`שורה ${i + 2}: מספר אישי חסר`);
            continue;
          }

          const existing = findByPersonal.get(personalNumber) as { id: number } | undefined;

          // Name is only needed to create a new diver; for an existing diver the
          // identity/contact fields are never overwritten by the import.
          const firstName = getValue('first_name');
          const lastName = getValue('last_name');
          if (!existing && (!firstName || !lastName)) {
            errors.push(`שורה ${i + 2}: שם פרטי ושם משפחה נדרשים לצולל חדש`);
            continue;
          }

          const fitnessStatus = normalizeStatus(getValue('fitness_status'));
          const statusDate = normalizeDate(getValue('fitness_status_date'));
          const expiryDate = normalizeDate(getValue('fitness_expiry_date'));
          const lastExamDate = normalizeDate(getValue('last_exam_date'));
          const unfitRaw = getValue('unfit_days');
          const unfitDays = unfitRaw && /^\d+$/.test(unfitRaw) ? parseInt(unfitRaw, 10) : null;

          // Collect required exams from every mapped הערה column.
          const exams = examColumns
            .map(col => String(row[col] ?? '').trim())
            .filter(Boolean);

          let diverId: number;
          if (existing) {
            updateDiver.run(
              fitnessStatus, statusDate, expiryDate,
              unfitDays, lastExamDate, importerName, existing.id
            );
            diverId = existing.id;
            updated++;
          } else {
            const result = insertDiver.run(
              firstName, lastName, personalNumber,
              getValue('id_number'), normalizePhone(getValue('phone')), getValue('email'),
              fitnessStatus, statusDate, expiryDate, unfitDays, lastExamDate,
              getValue('notes'), importerName
            );
            diverId = result.lastInsertRowid as number;
            created++;
          }

          // Replace the diver's required-exam list with this row's exams.
          deleteExams.run(diverId);
          exams.forEach((exam, idx) => insertExam.run(diverId, exam, idx));

          imported++;
        } catch (e: any) {
          errors.push(`שורה ${i + 2}: ${e.message}`);
        }
      }
    });

    importAll();

    // Record when a כשירות file was last imported (shown in the staff header).
    db.prepare(`
      INSERT INTO config (key, value, updated_at)
      VALUES ('last_fitness_import_at', datetime('now'), datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = datetime('now'), updated_at = datetime('now')
    `).run();

    res.json({ imported, created, updated, errors, total: rows.length });
  } catch {
    res.status(400).json({ error: 'שגיאה בעיבוד הקובץ' });
  }
});

export default router;
