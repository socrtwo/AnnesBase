import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let loading: Promise<SqlJsStatic> | undefined;
export function loadSqlite(): Promise<SqlJsStatic> {
  // Vite emits the WASM alongside the application; no runtime CDN is needed.
  loading ??= initSqlJs({ locateFile: () => wasmUrl }).catch(error => {
    loading = undefined;
    throw error;
  });
  return loading;
}
