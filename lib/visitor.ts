export type Visitor = {
  workspaceId: string;
  cookie?: string;
  mode: 'guest' | 'local';
};
const TOKEN = /^[a-f0-9]{64}$/;
const secureCookie = '__Host-field_visitor';
const localCookie = 'field_visitor';

function cookieValue(request: Request, name: string) {
  const values = (request.headers.get('cookie') || '')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${name}=`));
  // Ambiguous credentials are rejected rather than choosing an attacker-controlled duplicate.
  return values.length === 1 ? values[0].slice(name.length + 1) : undefined;
}
export async function digestToken(token: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
export async function resolveVisitor(
  request: Request,
  options: {
    create?: boolean;
    localWorkspace?: boolean;
    development?: boolean;
  } = {},
): Promise<Visitor | null> {
  const url = new URL(request.url);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  // Explicit development compatibility only; production cannot expose the old shared row.
  if (options.development && options.localWorkspace && loopback)
    return { workspaceId: 'workspace', mode: 'local' };
  if (url.protocol !== 'https:' && !loopback) return null;
  const secure = url.protocol === 'https:';
  const name = secure ? secureCookie : localCookie;
  let token = cookieValue(request, name);
  let cookie: string | undefined;
  if (!token || !TOKEN.test(token)) {
    if (!options.create) return null;
    token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    cookie = `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=15552000${secure ? '; Secure' : ''}`;
  }
  return {
    workspaceId: `guest:${await digestToken(token)}`,
    mode: 'guest',
    ...(cookie ? { cookie } : {}),
  };
}

export function visitorHeaders(visitor?: Visitor | null) {
  return {
    'Cache-Control': 'private, no-store',
    Vary: 'Cookie',
    ...(visitor?.cookie ? { 'Set-Cookie': visitor.cookie } : {}),
  };
}
