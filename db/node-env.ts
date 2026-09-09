import { RemoteDatabase } from './remote';

const database = new RemoteDatabase(() => ({
  url: process.env.FIELD_DATABASE_URL,
  token: process.env.FIELD_DATABASE_TOKEN,
}));

// Only the Vercel server bundle aliases cloudflare:workers to this module.
// Runtime secrets are read on the server, never inlined in browser assets.
export const env = new Proxy({} as Record<string, unknown>, {
  get: (_, key) => (key === 'DB' ? database : process.env[String(key)]),
  ownKeys: () => Object.keys(process.env),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});
