import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';
import fs from 'fs';

// The SQLite database is the system's durable store, so it MUST live on
// persistent storage that survives restarts, redeploys and container
// recreation (project rule: persistence is mandatory). The container
// filesystem is ephemeral and must never hold it.
//
// The data directory MUST be configured explicitly via DATA_DIR in production
// (it points at the mounted persistent volume). In local dev it falls back to
// server/data.
const isProductionEnv = process.env.NODE_ENV === 'production';

// Hard-fail in production when DATA_DIR is not set. Defaulting to /app/data
// would silently persist to the container filesystem if no volume were mounted
// there, losing all data on the next redeploy — refuse to start instead of
// risking that (project rule: persistence is mandatory).
if (isProductionEnv && !process.env.DATA_DIR) {
  console.error(
    '[persistence] FATAL: DATA_DIR is not set in production. It must point at ' +
    'a mounted persistent volume (e.g. /app/data), otherwise data is lost on ' +
    'every restart/redeploy. Refusing to start. See docs/DEPLOYMENT.md.'
  );
  process.exit(1);
}

const DATA_DIR = process.env.DATA_DIR
  || (isProductionEnv ? '/app/data' : path.join(__dirname, '..', 'data'));
const DB_PATH = path.join(DATA_DIR, 'fit2dive.db');
// Previous database filename, kept so existing deployments can be migrated.
const LEGACY_DB_PATH = path.join(DATA_DIR, 'mery.db');

// Ensure data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true });
console.log(`[persistence] SQLite database path: ${DB_PATH}`);

// One-time migration: if the renamed database does not exist yet but the
// legacy one does, copy the legacy data into the new file so no data is lost.
// The legacy file is left in place as a backup.
if (!fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
  // Checkpoint the legacy WAL so all committed data lives in the main file,
  // then copy the main file to the new path.
  const legacy = new Database(LEGACY_DB_PATH);
  legacy.pragma('wal_checkpoint(TRUNCATE)');
  legacy.close();
  fs.copyFileSync(LEGACY_DB_PATH, DB_PATH);
  console.log(`Migrated database ${LEGACY_DB_PATH} -> ${DB_PATH}`);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS certification_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      madar_user_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('manager','secretary','madar','diver')),
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      diver_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS divers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      -- Personal (service) number — the primary unique identifier for a diver.
      personal_number TEXT DEFAULT '',
      -- National ID (תעודת זהות) — optional; may be empty for imported divers.
      id_number TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      certification_level_id INTEGER REFERENCES certification_levels(id) ON DELETE SET NULL,
      certification_expiry TEXT,
      -- Fitness (כשירות) status — one of the Hebrew status values, e.g. 'כשיר',
      -- 'כשיר זמני', 'טרם נבדק', 'בלתי כשיר מנהלתית/זמנית/תמידית'.
      fitness_status TEXT DEFAULT 'טרם נבדק',
      fitness_status_date TEXT,       -- date the status was set
      fitness_expiry_date TEXT,       -- date the fitness/medical validity expires
      unfit_days INTEGER,             -- days since the diver was last fit (כשיר)
      last_exam_date TEXT,            -- date of the last medical inspection
      medical_last_updated TEXT,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Medical exams a diver still needs to complete (from the כשירות report's
    -- הערה columns). Replaced wholesale whenever a diver is imported/updated.
    CREATE TABLE IF NOT EXISTS diver_required_exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diver_id INTEGER NOT NULL REFERENCES divers(id) ON DELETE CASCADE,
      exam TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS diver_teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diver_id INTEGER NOT NULL REFERENCES divers(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      UNIQUE(diver_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS diver_certifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diver_id INTEGER NOT NULL REFERENCES divers(id) ON DELETE CASCADE,
      certification_level_id INTEGER NOT NULL REFERENCES certification_levels(id) ON DELETE CASCADE,
      expiry_date TEXT,
      issued_date TEXT,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS diver_otp_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diver_id INTEGER NOT NULL REFERENCES divers(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS diver_otp_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diver_id INTEGER NOT NULL UNIQUE REFERENCES divers(id) ON DELETE CASCADE,
      failed_attempts INTEGER DEFAULT 0,
      locked_until TEXT,
      last_attempt_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS diver_access_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diver_id INTEGER NOT NULL REFERENCES divers(id) ON DELETE CASCADE,
      ip_address TEXT DEFAULT '',
      accessed_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS diver_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diver_id INTEGER NOT NULL REFERENCES divers(id) ON DELETE CASCADE,
      activity_date TEXT NOT NULL,
      activity_name TEXT NOT NULL,
      diver_role TEXT DEFAULT '',
      location TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      failed_attempts INTEGER DEFAULT 0,
      locked_until TEXT,
      last_attempt_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_login_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      full_name TEXT DEFAULT '',
      success INTEGER NOT NULL,
      ip_address TEXT DEFAULT '',
      reason TEXT DEFAULT '',
      attempted_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Bring an existing divers table (old medical-status schema) up to the new
  // fitness/personal-number schema. No-op on a freshly created database.
  migrateDiversSchema();

  // Diver unique indexes are created after the migration so they always apply
  // to the current table (a rebuild during migration would drop earlier ones).
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_divers_personal_number_unique
      ON divers(personal_number) WHERE personal_number != '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_divers_id_number_unique
      ON divers(id_number) WHERE id_number != '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_divers_phone_unique
      ON divers(phone) WHERE phone != '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_divers_email_unique
      ON divers(email) WHERE email != '';
  `);

  // Seed default manager if no users exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(
      `INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)`
    ).run('admin', hash, 'מנהל מערכת', 'manager');
    console.log('Default manager created: admin / admin123');
  } else {
    // Re-hash admin password to ensure compatibility after bcrypt library change
    const admin = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get('admin') as any;
    if (admin && !bcrypt.compareSync('admin123', admin.password_hash)) {
      const hash = bcrypt.hashSync('admin123', 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, admin.id);
      console.log('Admin password re-hashed for compatibility');
    }
  }

  // Seed default config values (only if missing)
  const seedConfig = db.prepare(
    `INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)`
  );
  seedConfig.run('org_name', 'Fit2Dive');
  seedConfig.run('otp_expiry_minutes', '5');
  seedConfig.run('otp_max_attempts', '3');
  seedConfig.run('lockout_hours', '12');
  seedConfig.run('medical_expiry_warning_days', '30');
  seedConfig.run('default_certification_levels', 'מדריך התאחדות, מדריך מכין התאחדות, מדריך בוחן התאחדות, מד"ר התאחדות, סטאז מכין');
  seedConfig.run('default_teams', '');

  // Seed default certification levels if none exist
  const certCount = db.prepare('SELECT COUNT(*) as count FROM certification_levels').get() as { count: number };
  if (certCount.count === 0) {
    const defaultLevels = [
      'מדריך התאחדות',
      'מדריך מכין התאחדות',
      'מדריך בוחן התאחדות',
      'מד"ר התאחדות',
      'סטאז מכין',
    ];
    const insertLevel = db.prepare('INSERT INTO certification_levels (name, sort_order) VALUES (?, ?)');
    defaultLevels.forEach((name, i) => insertLevel.run(name, i));
    console.log('Default certification levels created');
  }
}

// Rebuilds an existing `divers` table that still uses the legacy schema
// (medical_status + NOT NULL/UNIQUE id_number, no personal_number) into the new
// fitness/personal-number schema. Detected by the absence of the
// `personal_number` column, so it runs at most once per database.
function migrateDiversSchema() {
  const cols = db.prepare('PRAGMA table_info(divers)').all() as { name: string }[];
  if (cols.length === 0 || cols.some(c => c.name === 'personal_number')) {
    return; // fresh table (already new schema) or nothing to migrate
  }

  console.log('Migrating divers table to fitness/personal-number schema...');

  // SQLite cannot drop an inline UNIQUE/NOT NULL constraint, so rebuild the
  // table. Foreign keys must be disabled around the rebuild; child rows keep
  // referring to divers by the preserved id values.
  db.pragma('foreign_keys = OFF');
  const rebuild = db.transaction(() => {
    db.exec(`
      CREATE TABLE divers_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        personal_number TEXT DEFAULT '',
        id_number TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        certification_level_id INTEGER REFERENCES certification_levels(id) ON DELETE SET NULL,
        certification_expiry TEXT,
        fitness_status TEXT DEFAULT 'טרם נבדק',
        fitness_status_date TEXT,
        fitness_expiry_date TEXT,
        unfit_days INTEGER,
        last_exam_date TEXT,
        medical_last_updated TEXT,
        team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
        notes TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO divers_new (
        id, first_name, last_name, personal_number, id_number, phone, email,
        certification_level_id, certification_expiry, fitness_status,
        fitness_status_date, fitness_expiry_date, unfit_days, last_exam_date,
        medical_last_updated, team_id, notes, created_at, updated_at
      )
      SELECT
        id, first_name, last_name, '', COALESCE(id_number, ''), phone, email,
        certification_level_id, certification_expiry,
        CASE medical_status
          WHEN 'valid'   THEN 'כשיר'
          WHEN 'pending' THEN 'טרם נבדק'
          WHEN 'expired' THEN 'בלתי כשיר מנהלתית'
          ELSE 'טרם נבדק'
        END,
        NULL, medical_expiry_date, NULL, NULL,
        medical_last_updated, team_id, notes, created_at, updated_at
      FROM divers;
      DROP TABLE divers;
      ALTER TABLE divers_new RENAME TO divers;
    `);
  });
  rebuild();
  db.pragma('foreign_key_check');
  db.pragma('foreign_keys = ON');
  console.log('divers table migrated');
}

export default db;
