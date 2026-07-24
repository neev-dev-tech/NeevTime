import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev API target overridable for local setups where 3001 is taken
const target = process.env.VITE_PROXY_TARGET || 'http://localhost:3001'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': target,
      '/socket.io': {
        target,
        ws: true
      }
    }
  }
})
