# End-to-end tests + coverage

Playwright E2E suite that drives the real UI against a real server, enforcing
**≥75% line coverage on both** `client/src` and `server/src`.

## Run

```bash
npm run test:e2e
```

This (`tests/run.mjs`) orchestrates everything:

1. Builds the client with **inline** sourcemaps.
2. Starts the Express server on port **3901** under [`c8`](https://github.com/bcoe/c8)
   (server coverage), in `NODE_ENV=development` with `SERVE_CLIENT=1` (serves the
   built client on the same origin) and `AUTH_RATE_MAX` raised so the auth rate
   limiter doesn't block the run.
3. Seeds a fresh throwaway SQLite DB (`tests/seed.mjs`) with staff, teams,
   divers, and generates the xlsx import fixtures.
4. Runs Playwright (Chromium). Each test's V8 coverage is collected via
   [`monocart-coverage-reports`](https://github.com/cenfun/monocart-coverage-reports)
   and mapped back to `client/src` through the inline sourcemaps.
5. Stops the server (so c8 flushes), then fails unless **both** client and
   server line coverage are ≥ 75%.

All artifacts (`tests/.tmp-data`, `.server-coverage`, `.client-coverage`,
`tests/fixtures`, `test-results`) are git-ignored.

## Layout

- `run.mjs` — orchestrator + coverage gate
- `fixtures.ts` — Playwright fixture that auto-collects client coverage
- `global-teardown.ts` — merges client coverage, writes the pct
- `seed.mjs` — DB seed + xlsx fixtures
- `helpers.ts` — login helpers, table/row locators
- `e2e/*.spec.ts` — the specs
