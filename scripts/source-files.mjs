import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Shared by the downloadable source and isolated verification. Never walk the
// checkout root: local secrets, databases and model weights do not belong here.
export function sourceFiles(root) {
  const entries = [];
  function visit(path) {
    if (path === 'public/downloads') return;
    const stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const name of readdirSync(join(root, path)).sort((a, b) =>
        a.localeCompare(b, 'en'),
      )) {
        if (!name.startsWith('.')) visit(`${path}/${name}`);
      }
    } else if (stat.isFile()) entries.push(path);
  }
  for (const path of [
    'app',
    'components',
    'db',
    'drizzle',
    'hooks',
    'lib',
    'public',
    'scripts',
    'tests',
    'docs',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'next.config.ts',
    'vite.config.ts',
    'drizzle.config.ts',
    'wrangler.local.json',
    'README.md',
    'PRODUCT.md',
    'SETUP.md',
    'ARCHITECTURE.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    '.gitignore',
    '.dev.vars.example',
    '.oxfmtrc.json',
    '.oxlintrc.json',
    'components.json',
    '.github/workflows/check.yml',
  ])
    visit(path);
  return entries.sort((a, b) => a.localeCompare(b, 'en'));
}

export const localHosting = { d1: 'DB', r2: null };
