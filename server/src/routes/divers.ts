import { Router, Request, Response } from 'express';
import db from '../db';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate);

function enrichDiver(diver: any) {
  const certs = db.prepare(`
    SELECT dc.*, cl.name as level_name FROM diver_certifications dc
    JOIN certification_levels cl ON dc.certification_level_id = cl.id
    WHERE dc.diver_id = ? ORDER BY cl.sort_order
  `).all(diver.id) as any[];

  const teams = db.prepare(`
    SELECT t.id, t.name FROM diver_teams dt
    JOIN teams t ON dt.team_id = t.id
    WHERE dt.diver_id = ? ORDER BY t.name
  `).all(diver.id) as any[];

  const exams = db.prepare(
    'SELECT exam FROM diver_required_exams WHERE diver_id = ? ORDER BY sort_order, id'
  ).all(diver.id) as { exam: string }[];

  return {
    ...diver,
    certifications: certs,
    certification_names: certs.map((c: any) => c.level_name).join(', ') || '-',
    teams,
    team_names: teams.map((t: any) => t.name).join(', ') || '-',
    required_exams: exams.map(e => e.exam),
  };
}

// Replaces a diver's required-exam list with the given exams (trimmed,
// non-empty). Used by create/update so the form and importer stay in sync.
function syncRequiredExams(diverId: number, exams: unknown) {
  if (!Array.isArray(exams)) return;
  db.prepare('DELETE FROM diver_required_exams WHERE diver_id = ?').run(diverId);
  const insert = db.prepare('INSERT INTO diver_required_exams (diver_id, exam, sort_order) VALUES (?, ?, ?)');
  exams
    .map(e => String(e ?? '').trim())
    .filter(Boolean)
    .forEach((exam, i) => insert.run(diverId, exam, i));
}

function diverIsInTeam(diverId: number, teamId: number | null): boolean {
  if (!teamId) return false;
  const row = db.prepare('SELECT 1 FROM diver_teams WHERE diver_id = ? AND team_id = ?').get(diverId, teamId);
  return !!row;
}

// Get all divers (filtered by role)
router.get('/', (req: Request, res: Response) => {
  const { role, teamId, diverId } = req.auth!;

  let baseQuery = 'SELECT d.* FROM divers d';
  let rows: any[];

  if (role === 'diver') {
    if (!diverId) { res.json([]); return; }
    rows = [db.prepare(baseQuery + ' WHERE d.id = ?').get(diverId)].filter(Boolean);
  } else if (role === 'madar') {
    rows = db.prepare(
      baseQuery + ' WHERE d.id IN (SELECT diver_id FROM diver_teams WHERE team_id = ?) ORDER BY d.last_name, d.first_name'
    ).all(teamId) as any[];
  } else {
    const search = req.query.search as string;
    if (search) {
      const s = `%${search}%`;
      rows = db.prepare(
        baseQuery + ' WHERE d.first_name LIKE ? OR d.last_name LIKE ? OR d.personal_number LIKE ? OR d.id_number LIKE ? ORDER BY d.last_name, d.first_name'
      ).all(s, s, s, s) as any[];
    } else {
      rows = db.prepare(baseQuery + ' ORDER BY d.last_name, d.first_name').all() as any[];
    }
  }

  res.json(rows.map(enrichDiver));
});

// Get single diver
router.get('/:id', (req: Request, res: Response) => {
  const { role, teamId, diverId } = req.auth!;
  const id = parseInt(req.params.id as string);

  const diver = db.prepare('SELECT * FROM divers WHERE id = ?').get(id) as any;
  if (!diver) { res.status(404).json({ error: 'צולל לא נמצא' }); return; }

  if (role === 'diver' && diver.id !== diverId) { res.status(403).json({ error: 'אין הרשאה' }); return; }
  if (role === 'madar' && !diverIsInTeam(diver.id, teamId)) { res.status(403).json({ error: 'אין הרשאה' }); return; }

  res.json(enrichDiver(diver));
});

// Lookup diver by ID number
router.get('/lookup/:idNumber', (req: Request, res: Response) => {
  const diver = db.prepare('SELECT * FROM divers WHERE id_number = ?').get(req.params.idNumber) as any;
  if (!diver) { res.status(404).json({ error: 'צולל לא נמצא' }); return; }
  if (req.auth!.role === 'diver' && diver.id !== req.auth!.diverId) { res.status(403).json({ error: 'אין הרשאה' }); return; }
  res.json(enrichDiver(diver));
});

// Create diver
router.post('/', requireRole('manager', 'secretary', 'madar'), (req: Request, res: Response) => {
  const {
    first_name, last_name, personal_number, id_number, phone, email,
    fitness_status, fitness_status_date, fitness_expiry_date, unfit_days,
    last_exam_date, notes, team_ids, required_exams,
  } = req.body;

  if (!first_name || !last_name || !personal_number) {
    res.status(400).json({ error: 'שם פרטי, שם משפחה ומספר אישי נדרשים' });
    return;
  }
  if (!phone) {
    res.status(400).json({ error: 'מספר טלפון הוא שדה חובה' });
    return;
  }

  // A madar may only create divers within their own team. Ignore any submitted
  // team_ids and pin the new diver to the madar's team, matching the team
  // scoping enforced on update/delete.
  let teamIds = team_ids;
  if (req.auth!.role === 'madar') {
    if (!req.auth!.teamId) {
      res.status(403).json({ error: 'אין הרשאה' });
      return;
    }
    teamIds = [req.auth!.teamId];
  }

  try {
    const result = db.prepare(`
      INSERT INTO divers (
        first_name, last_name, personal_number, id_number, phone, email,
        fitness_status, fitness_status_date, fitness_expiry_date, unfit_days,
        last_exam_date, medical_last_updated, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `).run(
      first_name, last_name, personal_number, id_number || '', phone || '', email || '',
      fitness_status || 'טרם נבדק', fitness_status_date || null, fitness_expiry_date || null,
      unfit_days ?? null, last_exam_date || null, notes || ''
    );

    const diverId = result.lastInsertRowid as number;

    // Insert teams
    if (Array.isArray(teamIds)) {
      const insertTeam = db.prepare('INSERT OR IGNORE INTO diver_teams (diver_id, team_id) VALUES (?, ?)');
      for (const tid of teamIds) {
        if (tid) insertTeam.run(diverId, tid);
      }
    }

    syncRequiredExams(diverId, required_exams);

    res.status(201).json({ id: diverId });
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      if (e.message.includes('personal_number')) res.status(409).json({ error: 'מספר אישי כבר קיים במערכת' });
      else if (e.message.includes('phone')) res.status(409).json({ error: 'מספר טלפון כבר קיים במערכת' });
      else if (e.message.includes('email')) res.status(409).json({ error: 'כתובת אימייל כבר קיימת במערכת' });
      else res.status(409).json({ error: 'תעודת זהות כבר קיימת במערכת' });
      return;
    }
    throw e;
  }
});

// Update diver
router.put('/:id', requireRole('manager', 'secretary', 'madar'), (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);

  if (req.auth!.role === 'madar' && !diverIsInTeam(id, req.auth!.teamId)) {
    res.status(403).json({ error: 'אין הרשאה' });
    return;
  }

  const {
    first_name, last_name, personal_number, id_number, phone, email,
    fitness_status, fitness_status_date, fitness_expiry_date, unfit_days,
    last_exam_date, notes, team_ids, required_exams,
  } = req.body;

  if (!phone) {
    res.status(400).json({ error: 'מספר טלפון הוא שדה חובה' });
    return;
  }

  try {
    const result = db.prepare(`
      UPDATE divers SET
        first_name = ?, last_name = ?, personal_number = ?, id_number = ?, phone = ?, email = ?,
        fitness_status = ?, fitness_status_date = ?, fitness_expiry_date = ?, unfit_days = ?,
        last_exam_date = ?, medical_last_updated = datetime('now'),
        notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      first_name, last_name, personal_number || '', id_number || '', phone || '', email || '',
      fitness_status || 'טרם נבדק', fitness_status_date || null, fitness_expiry_date || null,
      unfit_days ?? null, last_exam_date || null, notes || '', id
    );

    if (result.changes === 0) { res.status(404).json({ error: 'צולל לא נמצא' }); return; }

    // Sync teams. A madar may not reassign team memberships — doing so could
    // move the diver out of their own team or into teams they don't manage — so
    // their existing memberships are left untouched. Only manager/secretary can
    // change a diver's teams.
    if (req.auth!.role !== 'madar' && Array.isArray(team_ids)) {
      db.prepare('DELETE FROM diver_teams WHERE diver_id = ?').run(id);
      const insertTeam = db.prepare('INSERT OR IGNORE INTO diver_teams (diver_id, team_id) VALUES (?, ?)');
      for (const tid of team_ids) {
        if (tid) insertTeam.run(id, tid);
      }
    }

    syncRequiredExams(id, required_exams);

    res.json({ success: true });
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      if (e.message.includes('personal_number')) res.status(409).json({ error: 'מספר אישי כבר קיים במערכת' });
      else if (e.message.includes('phone')) res.status(409).json({ error: 'מספר טלפון כבר קיים במערכת' });
      else if (e.message.includes('email')) res.status(409).json({ error: 'כתובת אימייל כבר קיימת במערכת' });
      else res.status(409).json({ error: 'תעודת זהות כבר קיימת במערכת' });
      return;
    }
    throw e;
  }
});

// Delete diver
router.delete('/:id', requireRole('manager'), (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM divers WHERE id = ?').run(parseInt(req.params.id as string));
  if (result.changes === 0) { res.status(404).json({ error: 'צולל לא נמצא' }); return; }
  res.json({ success: true });
});

export default router;
