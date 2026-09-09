import {
  XClient,
  XError,
  authorizeUrl,
  digest,
  randomToken,
  seal,
  unseal,
  type XConfig,
  type XTokens,
} from '../lib/x-auth';
type Connection = {
  user_id: string;
  username: string;
  name: string;
  tokens: string;
  expires_at: number;
  revision: number;
  lease_until: number;
  updated_at: number;
};
export class XConnection {
  constructor(
    private db: D1Database,
    private c: XConfig,
    private client = new XClient(c),
  ) {}
  async begin() {
    const now = Date.now(),
      state = randomToken(),
      verifier = randomToken(),
      browser = randomToken();
    await this.db.batch([
      this.db
        .prepare('DELETE FROM x_oauth_states WHERE expires_at < ?')
        .bind(now),
      this.db
        .prepare(
          'INSERT INTO x_oauth_states (id,browser_hash,verifier,expires_at) VALUES (?,?,?,?)',
        )
        .bind(
          await digest(state),
          await digest(browser),
          await seal(this.c, 'pkce', verifier),
          now + 600000,
        ),
    ]);
    return {
      url: authorizeUrl(this.c, state, await digest(verifier)),
      browser,
    };
  }
  async callback(state: string, browser: string, code: string) {
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !/^[A-Za-z0-9_-]{43}$/.test(browser) ||
      !code ||
      code.length > 2048
    )
      throw new XError('invalid_authorization');
    // Consume before exchanging. A replay or uncertain exchange must start a new flow.
    const row = await this.db
      .prepare(
        'DELETE FROM x_oauth_states WHERE id=? AND browser_hash=? AND expires_at>? RETURNING verifier',
      )
      .bind(await digest(state), await digest(browser), Date.now())
      .first<{ verifier: string }>();
    if (!row) throw new XError('authorization_expired');
    const tokens = await this.client.exchange(
      code,
      await unseal<string>(this.c, 'pkce', row.verifier),
    );
    const user = await this.client.me(tokens.access_token);
    const encrypted = await seal(this.c, 'tokens:' + user.id, tokens);
    await this.db
      .prepare(
        'INSERT INTO x_connections (user_id,username,name,tokens,expires_at,revision,lease_until,updated_at) VALUES (?,?,?,?,?,1,0,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,name=excluded.name,tokens=excluded.tokens,expires_at=excluded.expires_at,revision=x_connections.revision+1,lease_until=0,updated_at=excluded.updated_at',
      )
      .bind(
        user.id,
        user.username,
        user.name,
        encrypted,
        tokens.expiresAt,
        Date.now(),
      )
      .run();
    return user;
  }
  private row() {
    return this.db
      .prepare('SELECT * FROM x_connections WHERE user_id=?')
      .bind(this.c.userId)
      .first<Connection>();
  }
  async status() {
    const row = await this.row();
    return row
      ? {
          connected: true,
          user: { id: row.user_id, username: row.username, name: row.name },
          expiresAt: row.expires_at,
          updatedAt: row.updated_at,
          automaticPosting: false,
        }
      : { connected: false, automaticPosting: false };
  }
  async accessToken() {
    const row = await this.row();
    if (!row) throw new XError('not_connected', 409);
    let tokens = await unseal<XTokens>(
      this.c,
      'tokens:' + row.user_id,
      row.tokens,
    );
    if (tokens.expiresAt > Date.now() + 120000) return tokens.access_token;
    // Expired leases are not reclaimed: a crashed refresh may already have rotated the token.
    const lock = await this.db
      .prepare(
        'UPDATE x_connections SET lease_until=? WHERE user_id=? AND revision=? AND lease_until=0',
      )
      .bind(Date.now() + 60000, row.user_id, row.revision)
      .run();
    if (!lock.meta.changes)
      throw new XError(
        row.lease_until && row.lease_until < Date.now()
          ? 'reconnect_required'
          : 'connection_busy',
        409,
      );
    tokens = await this.client.refresh(tokens.refresh_token);
    const result = await this.db
      .prepare(
        'UPDATE x_connections SET tokens=?,expires_at=?,revision=revision+1,lease_until=0,updated_at=? WHERE user_id=? AND revision=?',
      )
      .bind(
        await seal(this.c, 'tokens:' + row.user_id, tokens),
        tokens.expiresAt,
        Date.now(),
        row.user_id,
        row.revision,
      )
      .run();
    if (!result.meta.changes) throw new XError('reconnect_required', 409);
    return tokens.access_token;
  }
  async verify() {
    return {
      verified: true,
      user: await this.client.me(await this.accessToken()),
      automaticPosting: false,
    };
  }
  async disconnect() {
    await this.db.batch([
      this.db.prepare('DELETE FROM x_oauth_states'),
      this.db
        .prepare('DELETE FROM x_connections WHERE user_id=?')
        .bind(this.c.userId),
    ]);
    return { connected: false, automaticPosting: false };
  }
}
