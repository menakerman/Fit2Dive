import { CoverageReport } from 'monocart-coverage-reports';
import path from 'path';
import fs from 'fs';

const OUTPUT_DIR = path.resolve(__dirname, '.client-coverage');

// Merge every test's V8 coverage into a single report and record the line pct
// so the orchestrator (run.mjs) can enforce the threshold.
export default async function globalTeardown() {
  const mcr = new CoverageReport({
    name: 'Fit2Dive client coverage',
    outputDir: OUTPUT_DIR,
    cleanCache: false,
    logging: 'error',
    reports: ['v8', 'console-summary', 'json-summary'],
    sourceFilter: (sourcePath: string) =>
      /(^|\/)src\//.test(sourcePath) && !sourcePath.includes('node_modules') && !sourcePath.includes('/@'),
  });
  const results = await mcr.generate();
  const summary = (results && (results as any).summary) || {};
  const pct = summary?.lines?.pct ?? summary?.bytes?.pct ?? 0;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'pct.json'), JSON.stringify({ pct, summary }, null, 2));
}
