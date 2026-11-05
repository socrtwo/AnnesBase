import { defineConfig } from 'vite';
import { offlineBundle } from './scripts/offline-build.ts';

export default defineConfig({ base: './', plugins: [offlineBundle()] });
