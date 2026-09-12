import { RemoteDatabase } from './remote';
import { DatabaseMedia } from './media-store';

const database = new RemoteDatabase(() => ({
  url: process.env.FIELD_DATABASE_URL,
  token: process.env.FIELD_DATABASE_TOKEN,
}));
const media = new DatabaseMedia(database);

// Only the Vercel server bundle aliases cloudflare:workers to this module.
// Runtime secrets are read on the server, never inlined in browser assets.
export const env = new Proxy({} as Record<string, unknown>, {
  get: (_, key) =>
    key === 'DB'
      ? database
      : key === 'DESK_MEDIA'
        ? media
        : process.env[String(key)],
  ownKeys: () => Object.keys(process.env),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});
