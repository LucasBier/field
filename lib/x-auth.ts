export const X_SCOPES = [
  'tweet.read',
  'users.read',
  'tweet.write',
  'media.write',
  'offline.access',
];
export type XConfig = {
  clientId: string;
  clientSecret: string;
  ownerKey: string;
  encryptionKey: string;
  userId: string;
  origin: string;
};
export class XError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export function xConfig(env: Record<string, unknown>): XConfig {
  const value = (key: string) =>
    typeof env[key] === 'string' ? (env[key] as string) : '';
  const c = {
    clientId: value('FIELD_X_CLIENT_ID'),
    clientSecret: value('FIELD_X_CLIENT_SECRET'),
    ownerKey: value('FIELD_X_OWNER_KEY'),
    encryptionKey: value('FIELD_X_ENCRYPTION_KEY'),
    userId: value('FIELD_X_USER_ID'),
    origin: value('FIELD_X_ORIGIN'),
  };
  if (
    !c.clientId ||
    !c.clientSecret ||
    !/^[a-f0-9]{64}$/.test(c.ownerKey) ||
    !/^[a-f0-9]{64}$/.test(c.encryptionKey) ||
    !/^\d{1,25}$/.test(c.userId)
  )
    throw new XError('not_configured', 503);
  try {
    if (
      new URL(c.origin).origin !== c.origin ||
      !c.origin.startsWith('https://')
    )
      throw new Error();
  } catch {
    throw new XError('not_configured', 503);
  }
  return c;
}
const bytes = (s: string) => new TextEncoder().encode(s);
export function b64(data: Uint8Array) {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function unb64(s: string) {
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0),
  );
}
export function randomToken() {
  return b64(crypto.getRandomValues(new Uint8Array(32)));
}
export async function digest(value: string) {
  return b64(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(value))),
  );
}
export async function equalSecret(a: string, b: string) {
  const left = await digest(a),
    right = await digest(b);
  let diff = 0;
  for (let i = 0; i < left.length; i++)
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
async function key(c: XConfig) {
  return crypto.subtle.importKey(
    'raw',
    Uint8Array.from(c.encryptionKey.match(/../g)!, (x) => parseInt(x, 16)),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function seal(c: XConfig, purpose: string, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: bytes('field:x:v1:' + purpose) },
    await key(c),
    bytes(JSON.stringify(value)),
  );
  return 'v1.' + b64(iv) + '.' + b64(new Uint8Array(encrypted));
}
export async function unseal<T>(
  c: XConfig,
  purpose: string,
  value: string,
): Promise<T> {
  try {
    const [version, iv, data, ...extra] = value.split('.');
    if (version !== 'v1' || extra.length) throw new Error();
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: unb64(iv),
        additionalData: bytes('field:x:v1:' + purpose),
      },
      await key(c),
      unb64(data),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    throw new XError('reconnect_required', 409);
  }
}
export function authorizeUrl(c: XConfig, state: string, challenge: string) {
  const url = new URL('https://x.com/i/oauth2/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: c.clientId,
    redirect_uri: c.origin + '/api/social/x/callback',
    scope: X_SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.href;
}
export type XTokens = {
  access_token: string;
  refresh_token: string;
  expiresAt: number;
  scope: string;
};
export class XClient {
  constructor(
    private c: XConfig,
    private transport: typeof fetch = fetch,
  ) {}
  async tokens(parameters: Record<string, string>): Promise<XTokens> {
    let r: Response;
    try {
      r = await this.transport('https://api.x.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' +
            btoa(
              encodeURIComponent(this.c.clientId) +
                ':' +
                encodeURIComponent(this.c.clientSecret),
            ),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(parameters).toString(),
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new XError('authorization_unconfirmed', 502);
    }
    if (!r.ok)
      throw new XError(
        r.status === 400 || r.status === 401
          ? 'reconnect_required'
          : 'x_unavailable',
        502,
      );
    const v = (await r.json()) as Record<string, unknown>;
    if (
      typeof v.access_token !== 'string' ||
      typeof v.refresh_token !== 'string' ||
      typeof v.expires_in !== 'number' ||
      v.expires_in <= 0 ||
      v.expires_in > 31536000 ||
      v.token_type !== 'bearer' ||
      typeof v.scope !== 'string' ||
      !X_SCOPES.every((s) => (v.scope as string).split(' ').includes(s))
    )
      throw new XError('incomplete_authorization', 502);
    return {
      access_token: v.access_token,
      refresh_token: v.refresh_token,
      expiresAt: Date.now() + v.expires_in * 1000,
      scope: v.scope,
    };
  }
  exchange(code: string, verifier: string) {
    return this.tokens({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: this.c.origin + '/api/social/x/callback',
    });
  }
  refresh(token: string) {
    return this.tokens({ grant_type: 'refresh_token', refresh_token: token });
  }
  async uploadImage(token: string, image: Blob) {
    if (image.type !== 'image/png' || !image.size || image.size > 5_000_000)
      throw new XError('invalid_media');
    const body = new FormData();
    body.set('media', image, 'nia.png');
    body.set('media_category', 'tweet_image');
    body.set('media_type', 'image/png');
    const r = await this.transport('https://api.x.com/2/media/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new XError('x_media_unavailable', 502);
    const v = (await r.json()) as {
      data?: { id?: string; processing_info?: { state?: string } };
      errors?: unknown[];
    };
    if (
      !v.data?.id ||
      !/^\d{1,25}$/.test(v.data.id) ||
      v.errors?.length ||
      (v.data.processing_info && v.data.processing_info.state !== 'succeeded')
    )
      throw new XError('x_media_unavailable', 502);
    return v.data.id;
  }
  async post(token: string, text: string, mediaIds: string[] = []) {
    if (mediaIds.length > 4 || mediaIds.some((id) => !/^\d{1,25}$/.test(id)))
      throw new XError('invalid_media');
    const r = await this.transport('https://api.x.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}),
      }),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new XError('x_publication_unconfirmed', 502);
    const v = (await r.json()) as { data?: { id?: string } };
    if (!v.data?.id || !/^\d{1,25}$/.test(v.data.id))
      throw new XError('x_publication_unconfirmed', 502);
    return v.data.id;
  }
  async me(token: string) {
    let r: Response;
    try {
      r = await this.transport('https://api.x.com/2/users/me', {
        headers: { Authorization: 'Bearer ' + token },
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new XError('x_unavailable', 502);
    }
    if (!r.ok)
      throw new XError(
        r.status === 401 ? 'reconnect_required' : 'x_unavailable',
        502,
      );
    const { data } = (await r.json()) as {
      data?: { id: string; username: string; name: string };
    };
    if (!data || data.id !== this.c.userId)
      throw new XError('wrong_account', 403);
    if (typeof data.username !== 'string' || typeof data.name !== 'string')
      throw new XError('x_unavailable', 502);
    return { id: data.id, username: data.username, name: data.name };
  }
}
