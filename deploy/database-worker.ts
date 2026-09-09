import { readBoundedJson } from '../lib/validation';

type Environment = { DB: D1Database; FIELD_DATABASE_TOKEN?: string };
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

async function authorized(request: Request, token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const provided = request.headers.get('authorization') || '';
  if (!/^Bearer [a-f0-9]{64}$/.test(provided)) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(token),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const message = encoder.encode('field-database');
  const signatureKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(provided.slice(7)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', signatureKey, message);
  return crypto.subtle.verify('HMAC', key, signature, message);
}

const databaseWorker = {
  async fetch(request: Request, env: Environment) {
    if (new URL(request.url).pathname !== '/batch')
      return json({ error: 'Not found.' }, 404);
    if (request.method !== 'POST')
      return json({ error: 'Method not allowed.' }, 405);
    if (!(await authorized(request, env.FIELD_DATABASE_TOKEN)))
      return json({ error: 'Unauthorized.' }, 401);
    let statements: { sql: string; args: (string | number | null)[] }[];
    try {
      const value = (await readBoundedJson(request, 2_100_000)) as Record<
        string,
        unknown
      >;
      if (
        !value ||
        !Array.isArray(value.statements) ||
        !value.statements.length ||
        value.statements.length > 10
      )
        return json({ error: 'Invalid batch.' }, 400);
      statements = value.statements;
      if (
        statements.some(
          (s) =>
            !s ||
            typeof s.sql !== 'string' ||
            s.sql.length > 16000 ||
            !Array.isArray(s.args) ||
            s.args.length > 64 ||
            s.args.some(
              (arg) =>
                arg !== null &&
                typeof arg !== 'string' &&
                (typeof arg !== 'number' || !Number.isFinite(arg)),
            ),
        )
      )
        return json({ error: 'Invalid statement.' }, 400);
    } catch {
      return json({ error: 'Invalid body.' }, 400);
    }
    try {
      const results = await env.DB.batch(
        statements.map((s) => env.DB.prepare(s.sql).bind(...s.args)),
      );
      return json({ results });
    } catch {
      return json({ error: 'Database operation failed.' }, 503);
    }
  },
};

export default databaseWorker;
