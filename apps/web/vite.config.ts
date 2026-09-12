import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const securityHeaders = {
  'Content-Security-Policy':
    "base-uri 'self'; frame-ancestors 'self'; frame-src 'self'; object-src 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: {
    headers: securityHeaders,
  },
  server: {
    headers: securityHeaders,
  },
})
