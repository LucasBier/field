import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: {
    alias: {
      'cloudflare:workers': fileURLToPath(
        new URL('./db/node-env.ts', import.meta.url),
      ),
      tailwindcss: fileURLToPath(
        new URL('./node_modules/tailwindcss/index.css', import.meta.url),
      ),
      'tw-animate-css': fileURLToPath(
        new URL(
          './node_modules/tw-animate-css/dist/tw-animate.css',
          import.meta.url,
        ),
      ),
      'shadcn/tailwind.css': fileURLToPath(
        new URL('./node_modules/shadcn/dist/tailwind.css', import.meta.url),
      ),
    },
  },
  plugins: [
    vinext(),
    nitro({ preset: 'vercel', vercel: { functions: { maxDuration: 180 } } }),
  ],
});
