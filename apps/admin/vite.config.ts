import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const securityHeaders = {
  'Content-Security-Policy':
    "base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

export default defineConfig({
  plugins: [react()],
  preview: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
    headers: securityHeaders,
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    headers: securityHeaders,
  },
})
