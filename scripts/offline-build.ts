import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

/** Hash the final on-disk output, including lazy chunks, WASM and public files. */
export function offlineBundle(): Plugin {
  let root: string, output: string;
  return {
    name: 'annesbase-offline', apply: 'build',
    configResolved(config) { root = config.root; output = resolve(root, config.build.outDir); },
    async writeBundle() {
      const files: string[] = [];
      async function walk(directory: string) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const path = resolve(directory, entry.name);
          if (entry.isDirectory()) await walk(path);
          else if (entry.isFile() && entry.name !== 'sw.js') files.push(relative(output, path).split(sep).join('/'));
        }
      }
      await walk(output); files.sort();
      const assets = await Promise.all(files.map(async url => ({ url, integrity: 'sha256-' + createHash('sha256').update(await readFile(resolve(output, url))).digest('base64') })));
      if (!files.includes('index.html') || !files.some(file => file.endsWith('.wasm'))) throw new Error('Offline bundle requires the HTML entry and SQLite WASM.');
      const template = await readFile(resolve(root, 'src/pwa/service-worker.js'), 'utf8');
      const version = createHash('sha256').update(template).update(JSON.stringify(assets)).digest('hex').slice(0, 24);
      await writeFile(resolve(output, 'sw.js'), template.replace('__OFFLINE_VERSION__', JSON.stringify(version)).replace('__OFFLINE_ASSETS__', JSON.stringify(assets)));
    },
  };
}
