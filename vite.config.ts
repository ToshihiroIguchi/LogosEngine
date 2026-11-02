import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'child_process'
import pkg from './package.json'

// A source archive or shallow checkout has no git metadata; the build must still work.
function readCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'unknown'
  }
}

// Cross-origin isolation enables SharedArrayBuffer, which the engine uses to stop running
// code without losing variables. Hosts that cannot send these headers (GitHub Pages) get the
// same effect from public/coi-serviceworker.js.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_HASH__: JSON.stringify(readCommitHash()),
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: {
    format: 'es',
  },
})
