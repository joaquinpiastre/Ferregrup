import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const api = env.VITE_API_URL || 'http://localhost:3001'
  return {
    plugins: [react(), tailwindcss()],
    server: {
      // En producción las fotos de la tienda pasan por Vercel (vercel.json); en desarrollo, por acá.
      proxy: {
        '/img': { target: api, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/img/, '/store/img') },
      },
    },
  }
})
