import { defineConfig, createServer, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const EMPTY_ROOT = '<div id="root"></div>'

/**
 * The pages whose first screen is written into their HTML at build time, and
 * the function in src/prerender.tsx that renders each one. Both plugins below
 * work from this list, so a page is either pre-rendered with its CSS inlined
 * or neither: inlining alone would save a request nobody is waiting on, and
 * pre-rendering alone would paint the shell unstyled.
 *
 * /debt-consolidation/ joined the homepage on 8 Oct (revamp phase 0). It is an
 * ad destination from its first day, so it gets what the homepage needed
 * three audit rounds to reach.
 */
const PRERENDERED: Record<string, string> = {
  '/index.html': 'renderHomeShell',
  '/debt-consolidation/index.html': 'renderDebtShell',
  '/home-equity/index.html': 'renderEquityShell',
}

/**
 * Writes the homepage's nav and hero into index.html at build time, so they
 * paint with the first frame instead of after the app's JavaScript has run
 * (audit, "Homepage LCP", Option A). The markup comes from src/prerender.tsx,
 * which renders the real Nav and Hero components.
 *
 * Build only, and only the pages in PRERENDERED: /mortgage-calculator/ opens on
 * the calculator, which is not pre-rendered. A throwaway Vite server in SSR mode
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
      const render = PRERENDERED[ctx.path]
      if (!render) return html
      if (!html.includes(EMPTY_ROOT)) {
        console.warn(`prerender-home-shell: ${EMPTY_ROOT} not found in ${ctx.path}; page not pre-rendered`)
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
        const shell: string = mod[render]()
        if (!shell.includes('<h1')) throw new Error('rendered shell has no <h1>')
        return html.replace(EMPTY_ROOT, `<div id="root">${shell}</div>`)
      } catch (err) {
        console.warn(`prerender-home-shell: FAILED, ${ctx.path} ships without its pre-rendered shell: ${String(err)}`)
        return html
      } finally {
        await server.close()
      }
    },
  }
}

/**
 * Inlines the homepage's stylesheet into index.html (audit L10, 7 Oct).
 *
 * PSI listed /assets/Footer-*.css as render-blocking on / (7 KB gzipped,
 * ~360 ms): with the nav and hero pre-rendered, the first paint still waited
 * for a second request to fetch the CSS they need. Loading it without blocking
 * instead would paint the hero unstyled and then jump, so it goes inside the
 * HTML. The file is still emitted, because /mortgage-calculator/ links it
 * normally. The cost is that / no longer caches its CSS between visits; at
 * ~7 KB gzipped against a whole round trip on a phone, that is the better
 * trade for the page people land on.
 *
 * Runs after Vite has written the <link> tags (order: 'post'), on the
 * pre-rendered pages only (PRERENDERED above). Fails open like the
 * pre-render: if the link or the asset is
 * not where expected, the page keeps its normal <link> and the build warns.
 */
function inlineHomeCss(): Plugin {
  return {
    name: 'inline-home-css',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!PRERENDERED[ctx.path] || !ctx.bundle) return html
        const links = [...html.matchAll(/<link rel="stylesheet" crossorigin href="\/(assets\/[^"]+\.css)">/g)]
        if (links.length === 0) {
          console.warn(`inline-home-css: no stylesheet <link> found in ${ctx.path}; CSS left linked`)
          return html
        }
        for (const [tag, fileName] of links) {
          const asset = ctx.bundle[fileName]
          if (!asset || asset.type !== 'asset') {
            console.warn(`inline-home-css: ${fileName} not in the bundle; left linked`)
            continue
          }
          const css = typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source)
          // A literal "</style" inside the CSS would end the element early.
          if (/<\/style/i.test(css)) {
            console.warn(`inline-home-css: ${fileName} contains "</style"; left linked`)
            continue
          }
          html = html.replace(tag, () => `<style>${css}</style>`)
        }
        return html
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), prerenderHomeShell(), inlineHomeCss()],
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
    // Three real pages, no client router: the homepage sells one CTA (debt
    // consolidation), the amortization calculator has its own URL at
    // /mortgage-calculator/, and /debt-consolidation/ serves the homepage's
    // calculator on a URL that will outlive the homepage revamp. Each gets its
    // own HTML entry, so an unknown path still 404s instead of being rewritten
    // to the homepage.
    rollupOptions: {
      input: {
        // Relative to the Vite root; @types/node is not installed, so no
        // path.resolve/__dirname here.
        main: 'index.html',
        mortgageCalculator: 'mortgage-calculator/index.html',
        debtConsolidation: 'debt-consolidation/index.html',
        homeEquity: 'home-equity/index.html',
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
