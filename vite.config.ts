import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // The /fred-api proxy that used to be here is gone. It made FRED work in
      // dev and only in dev, which is exactly why the production CORS failure
      // went unnoticed for so long: rates now go through /api/rates in both.
      //
      // Forms post to the /api/lead Netlify function. `vite dev` does not run
      // functions, so point it at `netlify dev` (run both, or just use
      // `netlify dev` on its own, which proxies Vite for you).
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    // recharts (~537KB) used to be forced into a named `charts` chunk here.
    // That is now counterproductive: AmortizationChart is imported lazily
    // (Calculator.tsx), which already splits recharts out on its own, and the
    // manualChunks entry promoted it back into the entry's preload graph as a
    // <link rel="modulepreload">. That downloads it at high priority during
    // page load, which is exactly what the lazy import was meant to avoid.
  },
})
