// Seeds the test database (DATA_DIR/fit2dive.db) with staff, teams and divers,
// and writes the xlsx import fixtures. Run after the server has booted (so the
// schema and default admin already exist).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR;
if (!DATA_DIR) throw new Error('DATA_DIR required');
const db = new Database(path.join(DATA_DIR, 'fit2dive.db'));

const hash = bcrypt.hashSync('Test12345!', 10);

// Teams
const teamId = (name) => {
  const ex = db.prepare('SELECT id FROM teams WHERE name = ?').get(name);
  if (ex) return ex.id;
  return db.prepare('INSERT INTO teams (name) VALUES (?)').run(name).lastInsertRowid;
};
const teamA = teamId('צוות אלפא');
const teamB = teamId('צוות בראבו');

// Staff users (in addition to the dev default admin/admin123 manager)
const upsertUser = (u) => {
  const ex = db.prepare('SELECT id FROM users WHERE username = ?').get(u.username);
  if (ex) return ex.id;
  return db.prepare(
    'INSERT INTO users (username, password_hash, full_name, role, team_id, phone, email) VALUES (?,?,?,?,?,?,?)'
  ).run(u.username, hash, u.full_name, u.role, u.team_id ?? null, u.phone ?? '', u.email ?? '').lastInsertRowid;
};
upsertUser({ username: 'sec', full_name: 'מזכירה בדיקה', role: 'secretary', phone: '0521000001' });
upsertUser({ username: 'madar1', full_name: 'מדר בדיקה', role: 'madar', team_id: teamA, phone: '0521000002' });

// Give the dev default admin a phone so the OTP step has a delivery target label.
db.prepare("UPDATE users SET phone = COALESCE(NULLIF(phone,''),'0521000000') WHERE username = 'admin'").run();

// Divers
const insDiver = db.prepare(`
  INSERT INTO divers (first_name, last_name, personal_number, id_number, phone, email,
    fitness_status, fitness_status_date, fitness_expiry_date, unfit_days, last_exam_date,
    notes, last_update_source)
  VALUES (@first_name,@last_name,@personal_number,@id_number,@phone,@email,
    @fitness_status,@fitness_status_date,@fitness_expiry_date,@unfit_days,@last_exam_date,
    @notes,@last_update_source)
`);
const addDiver = (d) => {
  const ex = db.prepare('SELECT id FROM divers WHERE personal_number = ?').get(d.personal_number);
  const params = {
    first_name: d.first_name, last_name: d.last_name, personal_number: d.personal_number,
    id_number: d.id_number ?? '', phone: d.phone ?? '', email: d.email ?? '',
    fitness_status: d.fitness_status ?? 'טרם נבדק',
    fitness_status_date: d.fitness_status_date ?? null,
    fitness_expiry_date: d.fitness_expiry_date ?? null,
    unfit_days: d.unfit_days ?? null,
    last_exam_date: d.last_exam_date ?? null,
    notes: d.notes ?? '', last_update_source: d.last_update_source ?? 'file_create',
  };
  const id = ex ? ex.id : insDiver.run(params).lastInsertRowid;
  if (d.team_id) db.prepare('INSERT OR IGNORE INTO diver_teams (diver_id, team_id) VALUES (?,?)').run(id, d.team_id);
  if (d.exams) {
    db.prepare('DELETE FROM diver_required_exams WHERE diver_id = ?').run(id);
    d.exams.forEach((e, i) => db.prepare('INSERT INTO diver_required_exams (diver_id, exam, sort_order) VALUES (?,?,?)').run(id, e, i));
  }
  return id;
};

const soon = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
addDiver({ first_name: 'אורי', last_name: 'כהן', personal_number: '1000001', id_number: '111111111', phone: '0501110001', fitness_status: 'כשיר', fitness_expiry_date: '2027-12-31', team_id: teamA });
addDiver({ first_name: 'נועה', last_name: 'לוי', personal_number: '1000002', phone: '' }); // phone-less (claim target)
addDiver({ first_name: 'דן', last_name: 'חדד', personal_number: '1000003', phone: '0501110003', fitness_status: 'בלתי כשיר זמנית', fitness_expiry_date: soon, unfit_days: 40, last_exam_date: '2026-01-01', exams: ['בדיקת דם', 'א.ק.ג'], team_id: teamA });
addDiver({ first_name: 'רות', last_name: 'מזרחי', personal_number: '1000004', phone: '0501110004', fitness_status: 'טרם נבדק' });
addDiver({ first_name: 'גיל', last_name: 'בר', personal_number: '1000005', phone: '0501110005', fitness_status: 'כשיר זמני', team_id: teamB });

// xlsx fixtures
const fixturesDir = path.join(__dirname, 'fixtures');
fs.mkdirSync(fixturesDir, { recursive: true });

const diversHeaders = ['מספר אישי', 'שם פרטי', 'שם משפחה', 'סטטוס כשירות', 'הערה 1', 'הערה 2', 'תאריך סטטוס כשירות', 'תאריך סיום תוקף כשירות', 'ימי אי כשירות', 'תאריך בדיקה אחרון'];
const diversRows = [
  ['1000001', 'אורי', 'כהן', 'כשיר', '', '', '19/09/2025', '31/12/2028', '0', '2025-09-19'],       // update existing
  ['2000001', 'מיכל', 'שרון', 'בלתי כשיר זמנית', 'בדיקת שתן', 'א.ק.ג', '20/09/2025', '19/07/2027', '120', '2025-07-20'], // new
];
const wb1 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb1, XLSX.utils.aoa_to_sheet([diversHeaders, ...diversRows]), 'כשירות');
XLSX.writeFile(wb1, path.join(fixturesDir, 'divers.xlsx'));

const actHeaders = ['תאריך', 'תעודת זהות', 'שם פעילות'];
const actRows = [['2026-04-10', '111111111', 'צלילת אימון']];
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([actHeaders, ...actRows]), 'פעילויות');
XLSX.writeFile(wb2, path.join(fixturesDir, 'activities.xlsx'));

const userHeaders = ['שם משתמש', 'סיסמה', 'שם מלא', 'תפקיד'];
const userRows = [
  ['impuser1', 'Pass12345!', 'משתמש מיובא', 'secretary'],
  ['impuser2', 'Pass12345!', 'מיובא שני', 'madar'],
];
const wb3 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb3, XLSX.utils.aoa_to_sheet([userHeaders, ...userRows]), 'משתמשים');
XLSX.writeFile(wb3, path.join(fixturesDir, 'users.xlsx'));

const counts = {
  divers: db.prepare('SELECT COUNT(*) c FROM divers').get().c,
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
  teams: db.prepare('SELECT COUNT(*) c FROM teams').get().c,
};
console.log('[seed] done', JSON.stringify(counts), '| teamA', teamA, 'teamB', teamB);
