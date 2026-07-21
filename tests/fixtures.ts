import { test as base, expect } from '@playwright/test';
import { CoverageReport } from 'monocart-coverage-reports';
import path from 'path';

const OUTPUT_DIR = path.resolve(__dirname, '.client-coverage');

// Keep only our own client source (drop node_modules, vite deps, injected HMR).
const coverageOptions = {
  name: 'Fit2Dive client',
  outputDir: OUTPUT_DIR,
  cleanCache: false,
  logging: 'error' as const,
  entryFilter: (entry: { url: string }) =>
    entry.url.includes('/assets/') && entry.url.endsWith('.js'),
  sourceFilter: (sourcePath: string) =>
    /(^|\/)src\//.test(sourcePath) && !sourcePath.includes('node_modules') && !sourcePath.includes('/@'),
};

// Every test collects Chromium V8 coverage for the page and appends it to the
// shared monocart cache; the Playwright globalTeardown merges + reports it.
export const test = base.extend<{ autoCoverage: void }>({
  autoCoverage: [async ({ page }, use) => {
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await use();
    const coverage = await page.coverage.stopJSCoverage();
    const mcr = new CoverageReport(coverageOptions);
    await mcr.add(coverage);
  }, { auto: true }],
});

export { expect };
