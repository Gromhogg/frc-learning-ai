import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

// The Cloudflare plugin runs the Worker (server/worker.ts) inside the Vite dev
// server, with a local D1 database and R2 bucket — one `npm run dev` for all.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // CF_PERSIST lets a test run keep its local database somewhere else.
    cloudflare(process.env.CF_PERSIST ? { persistState: { path: process.env.CF_PERSIST } } : {}),
  ],
  resolve: {
    alias: [
      // Load only the Claude part of the Pi AI kit (see server/ai/pi-shim.js).
      {
        find: /^@mariozechner\/pi-ai$/,
        replacement: fileURLToPath(new URL('./server/ai/pi-shim.js', import.meta.url)),
      },
    ],
  },
})
