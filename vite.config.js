import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { crx } from '@crxjs/vite-plugin';
import { copyFileSync, mkdirSync, readdirSync, renameSync, readFileSync, writeFileSync } from 'fs';
import manifest from './manifest.json';

// Plugin to copy content CSS into dist (crx plugin doesn't handle static CSS in content_scripts)
function copyStaticAssets(outDir) {
  return {
    name: 'copy-static-assets',
    writeBundle() {
      // Copy all content CSS files
      mkdirSync(`${outDir}/content/css`, { recursive: true });
      readdirSync('content/css').filter(f => f.endsWith('.css')).forEach(f => {
        copyFileSync(`content/css/${f}`, `${outDir}/content/css/${f}`);
      });
      copyFileSync('content/styles.css', `${outDir}/content/styles.css`);
      copyFileSync('content/chatbot.css', `${outDir}/content/chatbot.css`);
      // Copy popup assets (not bundled since popup.html uses non-module script)
      mkdirSync(`${outDir}/popup`, { recursive: true });
      copyFileSync('popup/popup.js', `${outDir}/popup/popup.js`);
      copyFileSync('popup/popup.css', `${outDir}/popup/popup.css`);
      // Copy auth callback content script
      copyFileSync('content/auth-callback.js', `${outDir}/content/auth-callback.js`);
      // Copy PDF.js library (loaded dynamically by content script)
      mkdirSync(`${outDir}/lib`, { recursive: true });
      copyFileSync('lib/pdf.min.js', `${outDir}/lib/pdf.min.js`);
      copyFileSync('lib/pdf.worker.min.js', `${outDir}/lib/pdf.worker.min.js`);
      // Copy privacy policy (accessible from popup)
      copyFileSync('privacy-policy.html', `${outDir}/privacy-policy.html`);
      // Copy Windows auto-updater scripts so they ship in the release zip.
      // The PS1 also lives at $installDir at runtime so the updater can
      // self-update its own copy in %LOCALAPPDATA%\SuperLTC.
      copyFileSync('update-super-ltc-silent.ps1', `${outDir}/update-super-ltc-silent.ps1`);
      copyFileSync('update-super-ltc-launcher.vbs', `${outDir}/update-super-ltc-launcher.vbs`);
      copyFileSync('install-auto-updater.bat', `${outDir}/install-auto-updater.bat`);
      copyFileSync('uninstall-auto-updater.bat', `${outDir}/uninstall-auto-updater.bat`);
      copyFileSync('update-super-ltc.bat', `${outDir}/update-super-ltc.bat`);
    }
  };
}

// The crx plugin emits the content-script loader with a hashed filename
// (content.js-loader-<hash>.js) and writes that hashed name into the
// manifest. That breaks the auto-updater flow: after the updater swaps
// files on disk, Chrome's loaded manifest still references the OLD
// hashed loader name — every new PCC navigation 404s on the loader fetch
// until the user clicks the banner and the extension fully reloads.
// Renaming the loader to a stable name after build means each new
// navigation reads the latest loader from disk and silently picks up the
// newly-hashed inner bundle. The inner content.js bundle stays hashed
// for cache-busting; only the thin shim is renamed.
function stableLoaderName(outDir) {
  return {
    name: 'stable-loader-name',
    writeBundle: {
      sequential: true,
      order: 'post',
      handler() {
        const assetsDir = `${outDir}/assets`;
        const loaders = readdirSync(assetsDir).filter(f => /^content\.js-loader.*\.js$/.test(f));
        if (loaders.length !== 1) {
          console.warn(`[stable-loader-name] expected 1 loader file, found ${loaders.length}; skipping`);
          return;
        }
        const oldName = loaders[0];
        const stableName = 'content-loader.js';
        renameSync(`${assetsDir}/${oldName}`, `${assetsDir}/${stableName}`);
        const manifestPath = `${outDir}/manifest.json`;
        const updated = readFileSync(manifestPath, 'utf-8').split(`assets/${oldName}`).join(`assets/${stableName}`);
        writeFileSync(manifestPath, updated);
      }
    }
  };
}

// Plugin to replace the posthog-js import with an empty stub for Chrome
// Web Store builds. analytics.js already early-returns when ENABLED is
// false, so every posthog.* call site is dead code under the placeholder
// key — stubbing the import lets Rollup tree-shake the entire library
// out of the bundle so reviewers see no third-party tracking code.
function stubPosthogInStore(mode) {
  const isStore = mode === 'store';
  return {
    name: 'stub-posthog',
    enforce: 'pre',
    resolveId(source) {
      if (isStore && source.startsWith('posthog-js')) {
        return '\0empty-posthog';
      }
    },
    load(id) {
      if (id === '\0empty-posthog') {
        return 'export default {};';
      }
    }
  };
}

// Plugin to strip mock data files from production builds
function stripMocksInProduction(mode) {
  const mockFiles = ['mockData.js', 'icd10-mock-data.js'];
  const isProduction = mode === 'production';
  return {
    name: 'strip-mocks',
    enforce: 'pre',
    resolveId(source) {
      if (isProduction && mockFiles.some(f => source.endsWith(f))) {
        return '\0empty-mock';
      }
    },
    load(id) {
      if (id === '\0empty-mock') {
        return '// Mock data stripped from production build';
      }
    }
  };
}

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  const isStore = mode === 'store';

  // Customize manifest per environment
  const buildManifest = JSON.parse(JSON.stringify(manifest));
  if (isDev) {
    buildManifest.name = 'Super LTC DEV';
  } else {
    buildManifest.host_permissions = buildManifest.host_permissions.filter(
      p => !p.includes('localhost')
    );
    // Strip localhost from content_scripts matches in production
    buildManifest.content_scripts = buildManifest.content_scripts.map(cs => ({
      ...cs,
      matches: cs.matches.filter(m => !m.includes('localhost'))
    }));
  }

  // Chrome Web Store build: strip permissions reviewers scrutinize and
  // narrow <all_urls> down to the hosts the extension actually touches.
  // PostHog disables itself when POSTHOG_KEY is the placeholder (see
  // content/utils/analytics.js).
  if (isStore) {
    buildManifest.permissions = (buildManifest.permissions || []).filter(
      p => p !== 'tabs'
    );
    buildManifest.host_permissions = [
      '*://*.pointclickcare.com/*',
      'https://superltc.com/*',
    ];
  }

  const outDir = isDev ? 'dist' : isStore ? 'dist-store' : 'dist-prod';

  return {
    plugins: [
      stubPosthogInStore(mode),
      stripMocksInProduction(mode),
      preact(),
      crx({ manifest: buildManifest }),
      copyStaticAssets(outDir),
      stableLoaderName(outDir)
    ],
    define: {
      // Replaced at build time in background.js
      // dev → true (localhost), prod → false (superltc.com)
      __DEV_MODE__: isDev,
      // PostHog public project key (project 247257, Super LTC org).
      // Public client key — designed to ship in extension bundles, not a
      // secret. Hardcoded so it's preserved across builds without depending
      // on an env var being set. POSTHOG_KEY env var still overrides if set
      // (e.g. for staging/test projects).
      __POSTHOG_KEY__: JSON.stringify(
        process.env.POSTHOG_KEY || 'phc_AG0ZtYzdQ5ewwDw4XYba67cGgtTsY1Z3qeFQBgBZGWB'
      ),
    },
    build: {
      outDir,
      // Disable <link rel="modulepreload"> tags — they resolve against the
      // host page in a content script context.
      modulePreload: false,
      rollupOptions: {
        input: {
          background: 'background/background.js',
          popup: 'popup/popup.html'
        }
      }
    },
    // Force every chunk/asset URL in JS to be resolved via chrome.runtime.getURL
    // at runtime. Without this, Vite's __vitePreload helper builds URLs as
    // "/" + path, which a content script resolves against the HOST PAGE
    // (e.g. login.pointclickcare.com/assets/MDSCommandCenter-XXX.js → 404).
    // PCC's server logs would otherwise see chunk filenames before any user
    // logs in — leaking which features our extension has.
    experimental: {
      renderBuiltUrl(filename, { hostType }) {
        if (hostType === 'js') {
          return { runtime: `chrome.runtime.getURL(${JSON.stringify(filename)})` };
        }
        return { relative: true };
      },
    },
    resolve: {
      alias: {
        'react': 'preact/compat',
        'react-dom': 'preact/compat'
      }
    }
  };
});
