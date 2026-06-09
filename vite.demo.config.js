import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Separate Vite config for the demo site.
 *
 * Dev mode:  `npx vite --config vite.demo.config.js`
 *            Serves all demo pages with HMR. mds-section-i.html loads
 *            pcc-demo-entry.jsx directly (Vite transforms it on the fly).
 *
 * Build mode: `npm run demo:build`
 *             Builds pcc-demo-entry.jsx → demo/pcc-demo-entry.built.{js,css}
 *             Then `npm run demo:bundle` copies everything to demo-dist/.
 */

/**
 * Serve captured PCC page assets (CSS/JS/images) as raw static files.
 * Vite's dev server tries to process CSS through PostCSS which fails on
 * captured PCC stylesheets. This plugin intercepts those requests and
 * serves the files directly from disk.
 */
function serveCapturedAssets() {
  const MIME = {
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.ico': 'image/x-icon',
  };

  return {
    name: 'serve-captured-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.includes('_files/')) return next();

        const urlPath = req.url.split('?')[0];
        const filePath = resolve(process.cwd(), urlPath.replace(/^\//, ''));

        try {
          const content = readFileSync(filePath);
          const ext = urlPath.substring(urlPath.lastIndexOf('.'));
          const mime = MIME[ext] || 'application/octet-stream';
          res.setHeader('Content-Type', mime);
          res.setHeader('Cache-Control', 'no-cache');
          res.end(content);
        } catch {
          next();
        }
      });
    }
  };
}

// DEMO_ENTRY=legacy rebuilds demo-entry.built.{js,css} (used by
// medical-diagnosis.html, index.html, mds-summary.html). Default is pcc.
const entryKey = process.env.DEMO_ENTRY === 'legacy' ? 'demo-entry' : 'pcc-demo-entry';

export default defineConfig(({ command }) => ({
  plugins: [
    serveCapturedAssets(),
    preact(),
  ],
  root: '.',
  define: {
    // Demo doesn't ship analytics — provide stubs so analytics.js loads.
    __POSTHOG_KEY__: JSON.stringify(''),
    __ANALYTICS_FORCE_ON__: JSON.stringify(false),
    __DEV_MODE__: true,
  },
  build: {
    outDir: 'demo',
    emptyOutDir: false,
    lib: {
      entry: `demo/${entryKey}.jsx`,
      formats: ['es'],
      fileName: () => `${entryKey}.built.js`,
    },
    rollupOptions: {
      output: {
        assetFileNames: `${entryKey}.built[extname]`,
      }
    },
    cssCodeSplit: false,
  },
  resolve: {
    alias: {
      'react': 'preact/compat',
      'react-dom': 'preact/compat'
    }
  },
  server: {
    open: '/demo/mds-section-i.html',
    hmr: {
      overlay: false
    }
  }
}));
