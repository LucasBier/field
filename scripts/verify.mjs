import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { sourceFiles, localHosting } from './source-files.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'all';
if (!['all', 'unit', 'integration'].includes(mode))
  throw new Error('Use all, unit or integration.');
const environment = Object.fromEntries(
  [
    'PATH',
    'HOME',
    'USERPROFILE',
    'SystemRoot',
    'SYSTEMROOT',
    'TMPDIR',
    'TEMP',
    'TMP',
    'CI',
  ]
    .filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key]]),
);
Object.assign(environment, {
  WRANGLER_SEND_METRICS: 'false',
  WRANGLER_WRITE_LOGS: 'false',
  NO_COLOR: '1',
});
const children = new Set();
let scratch;
function start(args, cwd, extra = {}) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...environment, ...extra },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      output = (output + chunk).slice(-40000);
    });
  }
  child.output = () => output;
  child.done = new Promise((resolveDone) => {
    child.once('error', (error) => resolveDone({ code: -1, error }));
    child.once('exit', (code) => resolveDone({ code }));
  });
  children.add(child);
  return child;
}
async function stop(child) {
  if (!children.has(child)) return;
  function signal(value) {
    if (!child.pid) return;
    try {
      if (process.platform === 'win32') child.kill(value);
      else process.kill(-child.pid, value);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  signal('SIGTERM');
  await Promise.race([child.done, delay(2000)]);
  // A dev server can leave worker descendants after its parent exits.
  signal('SIGKILL');
  await child.done;
  children.delete(child);
}
async function cleanup() {
  await Promise.all([...children].map(stop));
  if (scratch) await rm(scratch, { recursive: true, force: true });
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  });
}
async function run(label, args, cwd = root, extra = {}) {
  console.log(`\n${label}`);
  const child = start(args, cwd, extra);
  const timeout = setTimeout(() => {
    void stop(child);
  }, 180000);
  try {
    const result = await child.done;
    process.stdout.write(child.output());
    if (result.code !== 0)
      throw new Error(`${label} failed (${result.code ?? 'interrupted'}).`);
  } finally {
    clearTimeout(timeout);
    await stop(child);
  }
}
async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}
async function ready(child, url, verify, announcement) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) break;
    if (!child.output().includes(announcement)) {
      await delay(250);
      continue;
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok && verify(await response.json())) return;
    } catch {
      /* Wait for this owned test process to compile. */
    }
    await delay(250);
  }
  throw new Error(
    `Isolated test service did not become ready.\n${child.output()}`,
  );
}
async function databasePath(directory) {
  const { DatabaseSync } = await import('node:sqlite');
  const candidates = await readdir(directory, { recursive: true });
  for (const name of candidates.filter((name) => name.endsWith('.sqlite'))) {
    const path = join(directory, name);
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      if (
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hosted_turns'",
          )
          .get()
      )
        return path;
    } finally {
      db.close();
    }
  }
  throw new Error(
    'The isolated database migration did not create hosted_turns.',
  );
}
async function integration() {
  if (process.platform === 'win32')
    throw new Error(
      'Isolated integration verification currently requires macOS, Linux or WSL.',
    );
  scratch = await mkdtemp(join(tmpdir(), 'field-hosted-verify-'));
  const project = join(scratch, 'field');
  for (const path of sourceFiles(root)) {
    await mkdir(dirname(join(project, path)), { recursive: true });
    await copyFile(join(root, path), join(project, path));
  }
  await mkdir(join(project, '.openai'), { recursive: true });
  await writeFile(
    join(project, '.openai/hosting.json'),
    JSON.stringify(localHosting),
  );
  await symlink(
    join(root, 'node_modules'),
    join(project, 'node_modules'),
    'dir',
  );
  await run(
    'Apply migrations to a fresh isolated database',
    [
      join(root, 'node_modules/wrangler/bin/wrangler.js'),
      'd1',
      'migrations',
      'apply',
      'DB',
      '--local',
      '--config',
      'wrangler.local.json',
    ],
    project,
    { CI: 'true' },
  );
  const database = await databasePath(join(project, '.wrangler/state'));
  const providerPort = await freePort();
  const providerUrl = `http://127.0.0.1:${providerPort}`;
  const provider = start(['tests/fixtures/provider.mjs'], project, {
    FIELD_FIXTURE_PORT: String(providerPort),
  });
  await ready(provider, `${providerUrl}/calls`, Array.isArray, 'Offline provider fixture ready.');
  const config = {
    FIELD_LOCAL_WORKSPACE: 'false',
    FIELD_AI_ENABLED: 'true',
    FIELD_AI_PROVIDER: 'deepseek',
    FIELD_AI_KEY: 'test-only-not-a-real-key',
    FIELD_AI_TEST_ENDPOINT: `${providerUrl}/chat/completions`,
    FIELD_AI_DAILY_USD: '100',
    FIELD_AI_INPUT_USD_PER_MILLION: '1',
    FIELD_AI_OUTPUT_USD_PER_MILLION: '2',
    FIELD_AI_VISITOR_TURNS: '3',
    FIELD_AI_SITE_TURNS: '200',
    FIELD_AI_CONCURRENCY: '2',
  };
  async function phase(label, overrides, tests, flags) {
    const vars = { ...config, ...overrides };
    await writeFile(
      join(project, '.dev.vars'),
      Object.entries(vars)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join('\n') + '\n',
    );
    const port = await freePort();
    const url = `http://127.0.0.1:${port}`;
    const server = start(
      [
        join(root, 'node_modules/vinext/dist/cli.js'),
        'dev',
        '--port',
        String(port),
        '--hostname',
        '127.0.0.1',
      ],
      project,
      { FIELD_VERIFY_PORT: String(port) },
    );
    try {
      await ready(
        server,
        `${url}/api/workspace`,
        (value) =>
          value.access === 'guest' && value.scope?.startsWith('guest:'),
        url,
      );
      await run(
        label,
        ['--import', 'tsx', '--test', '--test-timeout=120000', ...tests],
        project,
        {
          FIELD_TEST_URL: url,
          FIELD_TEST_PROVIDER: providerUrl,
          FIELD_TEST_D1: database,
          ...flags,
        },
      );
    } catch (error) {
      process.stderr.write(server.output());
      throw error;
    } finally {
      await stop(server);
    }
  }
  await phase(
    'HTTP, visitor isolation, persistence, streaming and expired-run recovery',
    {},
    [
      'tests/storage.test.ts',
      'tests/visitor.test.ts',
      'tests/hosted-storage.test.ts',
    ],
    { FIELD_TEST_GUESTS: '1', FIELD_TEST_HOSTED: '1' },
  );
  await phase(
    'Global cost allowance',
    { FIELD_AI_DAILY_USD: '0.000001' },
    ['tests/hosted-storage.test.ts'],
    { FIELD_TEST_QUOTA: '1' },
  );
  await phase(
    'Global turn allowance',
    { FIELD_AI_SITE_TURNS: '1' },
    ['tests/hosted-storage.test.ts'],
    { FIELD_TEST_QUOTA: '1' },
  );
  console.log(
    'All isolated integration phases passed. No live model or personal database was used.',
  );
}
try {
  if (mode === 'all') {
    await run('Type checking', ['node_modules/typescript/bin/tsc', '--noEmit']);
    await run('Lint', ['node_modules/oxlint/bin/oxlint']);
  }
  if (mode !== 'integration') {
    const files = (await readdir(join(root, 'tests'))).filter(
      (name) =>
        name.endsWith('.test.ts') &&
        ![
          'storage.test.ts',
          'hosted-storage.test.ts',
          'local-live.test.ts',
        ].includes(name),
    );
    await run('Unit tests (network integration is a separate phase)', [
      '--import',
      'tsx',
      '--test',
      ...files.map((file) => `tests/${file}`),
    ]);
  }
  if (mode !== 'unit') await integration();
  if (mode === 'all') {
    await run('Refresh downloadable source', ['scripts/package-source.mjs']);
    await run('Production build', ['node_modules/vinext/dist/cli.js', 'build']);
  }
  console.log(
    `\nVerification (${mode}) passed. Live-model and browser checks remain separate.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await cleanup();
}
