/**
 * OpenAN Portal plugin bundle build for the Observation Center (观测中心).
 *
 * Output (dist-plugin/):
 *   index.js              ← UMD, sets window.__OPENAN_PLUGIN__observation_center
 *   index.css             ← plugin styles
 *   plugin.manifest.json  ← runtime metadata consumed by the Portal bundle-loader
 *
 * EXTERNAL (provided by the Portal host): react, react-dom, @openan/portal-sdk
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import path from 'path';

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const globalName = '__OPENAN_PLUGIN__observation_center';

function buildManifestJson() {
    return readFileSync(path.join(root, 'plugin.manifest.json'), 'utf-8');
}

export default defineConfig({
    define: {
        // Inline react/jsx-runtime references process.env.NODE_ENV at runtime;
        // browsers have no `process`, which would crash the UMD factory before
        // it registers window.__OPENAN_PLUGIN__observation_center.
        'process.env.NODE_ENV': JSON.stringify('production'),
    },
    plugins: [
        react(),
        {
            name: 'emit-plugin-manifest-json',
            generateBundle() {
                this.emitFile({ type: 'asset', fileName: 'plugin.manifest.json', source: buildManifestJson() });
            },
        },
    ],
    build: {
        outDir: 'dist-plugin',
        emptyOutDir: true,
        lib: {
            entry: path.join(root, 'src/index.jsx'),
            name: globalName,
            formats: ['umd'],
            fileName: () => 'index.js',
        },
        rollupOptions: {
            external: ['react', 'react-dom', '@openan/portal-sdk'],
            output: {
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM',
                    // The Portal bundle-loader exposes the host's SDK singleton
                    // as window.OpenANPortalSDK before plugin scripts load; the
                    // shared PortalContext instance is required for navigation.
                    '@openan/portal-sdk': 'OpenANPortalSDK',
                },
                assetFileNames: 'index.css',
            },
        },
        cssCodeSplit: false,
    },
});
