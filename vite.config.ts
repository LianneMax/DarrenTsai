import { defineConfig, createServer, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const EMPTY_ROOT = '<div id="root"></div>'

/**
 * Writes the homepage's nav and hero into index.html at build time, so they
 * paint with the first frame instead of after the app's JavaScript has run
 * (audit, "Homepage LCP", Option A). The markup comes from src/prerender.tsx,
 * which renders the real Nav and Hero components.
 *
 * Build only, and the homepage only: /mortgage-calculator/ opens on the
 * calculator, which is not pre-rendered. A throwaway Vite server in SSR mode
 * loads the components with the same TSX transform the app uses; it is created
 * without this config file, so it cannot recurse into this plugin.
 *
 * Fails open. If rendering throws, the page ships exactly as before (empty
 * #root, hero drawn by React) and the build says so loudly. A slower homepage
 * is a far smaller problem than a deploy that cannot go out. Tests render the
 * same function, so a break shows up in `npm test` before it reaches a build.
 */
function prerenderHomeShell(): Plugin {
  let root = process.cwd()
  return {
    name: 'prerender-home-shell',
    apply: 'build',
    configResolved(config) {
      root = config.root
    },
    async transformIndexHtml(html, ctx) {
      if (ctx.path !== '/index.html') return html
      if (!html.includes(EMPTY_ROOT)) {
        console.warn(`prerender-home-shell: ${EMPTY_ROOT} not found in index.html; homepage not pre-rendered`)
        return html
      }
      const server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        server: { middlewareMode: true, hmr: false, ws: false },
        optimizeDeps: { noDiscovery: true, include: [] },
      })
      try {
        const mod = await server.ssrLoadModule('/src/prerender.tsx')
        const shell: string = mod.renderHomeShell()
        if (!shell.includes('<h1')) throw new Error('rendered shell has no <h1>')
        return html.replace(EMPTY_ROOT, `<div id="root">${shell}</div>`)
      } catch (err) {
        console.warn(`prerender-home-shell: FAILED, homepage ships without its pre-rendered hero: ${String(err)}`)
        return html
      } finally {
        await server.close()
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), prerenderHomeShell()],
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
    // Two real pages, no client router: the homepage sells one CTA (debt
    // consolidation) and the amortization calculator has its own URL at
    // /mortgage-calculator/. Each gets its own HTML entry, so an unknown path
    // still 404s instead of being rewritten to the homepage.
    rollupOptions: {
      input: {
        // Relative to the Vite root; @types/node is not installed, so no
        // path.resolve/__dirname here.
        main: 'index.html',
        mortgageCalculator: 'mortgage-calculator/index.html',
      },
    },
    // recharts (~537KB) used to be forced into a named `charts` chunk here.
    // That is now counterproductive: AmortizationChart is imported lazily
    // (Calculator.tsx), which already splits recharts out on its own, and the
    // manualChunks entry promoted it back into the entry's preload graph as a
    // <link rel="modulepreload">. That downloads it at high priority during
    // page load, which is exactly what the lazy import was meant to avoid.
  },
})
