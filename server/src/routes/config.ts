import { Router, Request, Response } from 'express';
import db from '../db';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// When a כשירות file was last imported. Available to all staff (shown in the
// header), so it is registered before the manager-only guard below.
router.get('/last-fitness-import', requireRole('manager', 'secretary', 'madar'), (_req: Request, res: Response) => {
  const row = db.prepare("SELECT value FROM config WHERE key = 'last_fitness_import_at'").get() as { value: string } | undefined;
  res.json({ last_fitness_import_at: row?.value || null });
});

router.use(requireRole('manager'));

// Get all config
router.get('/', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT key, value, updated_at FROM config ORDER BY key').all() as { key: string; value: string; updated_at: string }[];
  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }
  res.json(config);
});

// Update config (accepts partial updates)
router.put('/', (req: Request, res: Response) => {
  const updates = req.body as Record<string, string>;

  const upsert = db.prepare(`
    INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);

  const updateAll = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      upsert.run(key, String(value));
    }
  });

  updateAll();
  res.json({ success: true });
});

// Apply default cert levels and teams from config
router.post('/apply-defaults', (req: Request, res: Response) => {
  const certLevelsStr = db.prepare("SELECT value FROM config WHERE key = 'default_certification_levels'").get() as { value: string } | undefined;
  const teamsStr = db.prepare("SELECT value FROM config WHERE key = 'default_teams'").get() as { value: string } | undefined;

  let certsAdded = 0;
  let teamsAdded = 0;

  if (certLevelsStr?.value) {
    const names = certLevelsStr.value.split(',').map(s => s.trim()).filter(Boolean);
    const insert = db.prepare(
      'INSERT OR IGNORE INTO certification_levels (name, sort_order) VALUES (?, ?)'
    );
    names.forEach((name, i) => {
      const result = insert.run(name, i);
      if (result.changes > 0) certsAdded++;
    });
  }

  if (teamsStr?.value) {
    const names = teamsStr.value.split(',').map(s => s.trim()).filter(Boolean);
    const insert = db.prepare(
      'INSERT INTO teams (name) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM teams WHERE name = ?)'
    );
    names.forEach(name => {
      const result = insert.run(name, name);
      if (result.changes > 0) teamsAdded++;
    });
  }

  res.json({ certsAdded, teamsAdded });
});

export default router;
