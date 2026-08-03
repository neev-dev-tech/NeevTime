import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

// Dev API target overridable for local setups where 3001 is taken
const target = process.env.VITE_PROXY_TARGET || 'http://localhost:3001'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Icons moved from lucide (outline-only, thin) to Phosphor rendered solid.
      // Aliasing here means the ~63 files already importing from 'lucide-react'
      // keep working untouched — src/icons re-exports every glyph they use under
      // the same name. Import from 'lucide-react' anywhere and you get the solid
      // set; see src/icons/index.jsx to add one.
      'lucide-react': path.resolve(here, 'src/icons/index.jsx')
    }
  },
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
