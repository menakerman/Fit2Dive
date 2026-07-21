// End-to-end coverage orchestrator.
// 1. starts the Express server under c8 (server coverage) + the Vite dev server
// 2. seeds the DB, 3. runs Playwright (client coverage via monocart),
// 4. tears down and enforces >= THRESHOLD line coverage on BOTH client & server.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const THRESHOLD = 75;

const DATA_DIR = path.join(__dirname, '.tmp-data');
const SERVER_COV = path.join(__dirname, '.server-coverage');
const CLIENT_COV = path.join(__dirname, '.client-coverage');
for (const d of [DATA_DIR, SERVER_COV, CLIENT_COV]) fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

// Uncommon port so a concurrent dev server on 3001 doesn't collide. The server
// serves the built client on the same origin, so there is no separate client port.
const SERVER_PORT = '3901';
const BASE = `http://localhost:${SERVER_PORT}`;
const env = {
  ...process.env, NODE_ENV: 'development', DATA_DIR, PORT: SERVER_PORT,
  JWT_SECRET: 'test-secret', SMS_019_TOKEN: '', SENDGRID_API_KEY: '',
  SERVE_CLIENT: '1', AUTH_RATE_MAX: '100000',
};

const procs = [];
const kill = (p, sig = 'SIGTERM') => { try { p.kill(sig); } catch {} };
const cleanup = () => procs.forEach((p) => kill(p, 'SIGKILL'));
process.on('exit', cleanup);

function waitFor(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => { res.resume(); resolve(); });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('timeout waiting for ' + url));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    p.on('error', reject);
  });
}

async function main() {
  // Build the client with sourcemaps so monocart can map the served bundle back
  // to client/src. The server serves this build (SERVE_CLIENT=1).
  // Inline sourcemaps so monocart reads them straight from the served bundle
  // (external .map files are not auto-fetched by the V8 coverage mapper).
  console.log('[run] building client (inline sourcemaps)...');
  await run('npx', ['vite', 'build', '--sourcemap', 'inline'], { cwd: path.join(root, 'client'), env: process.env });

  // Server under c8 (json-summary for the gate). tsx runs the TS directly.
  const server = spawn('npx', [
    'c8', '--reporter=json-summary', '--reporter=text-summary', `--report-dir=${SERVER_COV}`,
    '--include=server/src/**/*.ts', '--all', '--extension=.ts',
    '--exclude=server/src/sms.ts', '--exclude=server/src/email.ts', '--exclude=**/*.d.ts',
    'npx', 'tsx', 'server/src/index.ts',
  ], { cwd: root, env, stdio: 'inherit' });
  procs.push(server);
  let serverExited = null;
  const serverDone = new Promise((r) => server.on('exit', () => { serverExited = true; r(); }));

  console.log('[run] waiting for server...');
  await waitFor(`${BASE}/api/divers`);
  await waitFor(`${BASE}/`);

  console.log('[run] seeding...');
  await run('node', ['tests/seed.mjs'], { cwd: root, env });

  console.log('[run] running playwright...');
  let pwFailed = false;
  try {
    await run('npx', ['playwright', 'test', '--config', 'tests/playwright.config.ts'], {
      cwd: root, env: { ...process.env, BASE_URL: BASE },
    });
  } catch (e) {
    pwFailed = true;
    console.error('[run] playwright reported failures:', e.message);
  }

  // Stop server so c8 flushes its report.
  console.log('[run] stopping server for coverage flush...');
  kill(server, 'SIGINT');
  await Promise.race([serverDone, new Promise((r) => setTimeout(r, 15000))]);
  if (!serverExited) kill(server, 'SIGTERM');

  // Read summaries.
  const readPct = (p, pick) => { try { return pick(JSON.parse(fs.readFileSync(p, 'utf8'))); } catch (e) { console.error('cannot read', p, e.message); return null; } };
  const serverPct = readPct(path.join(SERVER_COV, 'coverage-summary.json'), (j) => j.total.lines.pct);
  const clientPct = readPct(path.join(CLIENT_COV, 'pct.json'), (j) => j.pct);

  console.log('\n================ COVERAGE ================');
  console.log(`  client (client/src): ${clientPct}%`);
  console.log(`  server (server/src): ${serverPct}%`);
  console.log(`  threshold: ${THRESHOLD}%`);
  console.log('=========================================\n');

  const ok = clientPct >= THRESHOLD && serverPct >= THRESHOLD;
  if (pwFailed) { console.error('FAIL: playwright tests failed'); process.exit(1); }
  if (!ok) { console.error('FAIL: coverage below threshold'); process.exit(1); }
  console.log('PASS: both client and server >= ' + THRESHOLD + '%');
  process.exit(0);
}

main().catch((e) => { console.error(e); cleanup(); process.exit(1); });
