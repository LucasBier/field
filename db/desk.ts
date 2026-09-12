import { env } from 'cloudflare:workers';
import { DeskStore } from './desk-store';
export const deskStore = () =>
  new DeskStore((env as unknown as { DB: D1Database }).DB);
