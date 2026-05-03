import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Embedded / Jetson: listen on all interfaces so you can open the UI from
  // another machine on the LAN (default Vite is localhost-only).
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
})
