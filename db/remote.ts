type Query = { sql: string; args: (string | number | null)[] };
type Result<T = Record<string, unknown>> = {
  success: true;
  results: T[];
  meta: { changes: number; [key: string]: unknown };
};

/** A D1 batch crosses the network once and executes as one database transaction.
 * Never retry a write: a disconnected request may already have committed. */
export class RemoteDatabase {
  constructor(
    private readonly configuration: () => { url?: string; token?: string },
    private readonly transport: typeof fetch = fetch,
  ) {}

  prepare(sql: string) {
    return new RemoteStatement(this, { sql, args: [] });
  }

  async batch<T = Record<string, unknown>>(
    statements: RemoteStatement[],
  ): Promise<Result<T>[]> {
    const { url, token } = this.configuration();
    if (!url || !token || !/^[a-f0-9]{64}$/.test(token))
      throw new Error('Persistent storage is not configured.');
    const endpoint = new URL(url);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    )
      throw new Error('Persistent storage requires a private HTTPS endpoint.');
    if (
      !statements.length ||
      statements.length > 10 ||
      statements.some((s) => s.database !== this)
    )
      throw new Error('Invalid database batch.');
    const response = await this.transport(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ statements: statements.map((s) => s.query) }),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Persistent storage is unavailable.');
    const data = (await response.json()) as { results?: Result<T>[] };
    if (
      !Array.isArray(data.results) ||
      data.results.length !== statements.length ||
      data.results.some(
        (r) =>
          r?.success !== true ||
          !Array.isArray(r.results) ||
          !Number.isSafeInteger(r.meta?.changes),
      )
    )
      throw new Error('Persistent storage returned an invalid result.');
    return data.results;
  }
}

class RemoteStatement {
  constructor(
    readonly database: RemoteDatabase,
    readonly query: Query,
  ) {}
  bind(...args: Query['args']) {
    if (
      args.some(
        (arg) =>
          arg !== null &&
          typeof arg !== 'string' &&
          (typeof arg !== 'number' || !Number.isFinite(arg)),
      )
    )
      throw new Error('Unsupported database parameter.');
    return new RemoteStatement(this.database, { sql: this.query.sql, args });
  }
  async all<T = Record<string, unknown>>() {
    return (await this.database.batch<T>([this]))[0];
  }
  run<T = Record<string, unknown>>() {
    return this.all<T>();
  }
  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = (await this.all<Record<string, unknown>>()).results[0];
    return (row ? (column ? row[column] : row) : null) as T | null;
  }
}
