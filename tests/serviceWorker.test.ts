import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker(version = 'one', shared = new Map<string, Map<string, unknown>>()) {
  const scope = 'https://example.test/annes-base/';
  const prefix = `annesbase.shell.v1:${scope}:`;
  const handlers = new Map<string, (event: any) => void>();
  const key = (request: string | { url: string }) => typeof request === 'string' ? request : request.url;
  const caches = {
    open: vi.fn(async (name: string) => {
      if (!shared.has(name)) shared.set(name, new Map());
      const store = shared.get(name)!;
      return { put: async (request: Request, response: unknown) => { store.set(key(request), response); }, match: async (request: string | Request) => store.get(key(request)) };
    }),
    keys: async () => [...shared.keys()], delete: vi.fn(async (name: string) => shared.delete(name)),
  };
  const fetch = vi.fn(async (_request: Request) => ({ ok: true, body: 'asset' }));
  const claim = vi.fn(async () => {}), skipWaiting = vi.fn();
  const source = readFileSync('src/pwa/service-worker.js', 'utf8')
    .replace('__OFFLINE_VERSION__', JSON.stringify(version))
    .replace('__OFFLINE_ASSETS__', JSON.stringify(['index.html', 'assets/main.js', 'assets/sql.wasm'].map(url => ({ url, integrity: 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }))));
  vm.runInNewContext(source, { self: { registration: { scope }, clients: { claim }, skipWaiting, addEventListener: (name: string, handler: (event: any) => void) => handlers.set(name, handler) }, caches, fetch, Request, URL, Set });
  async function dispatch(name: string, extra = {}) {
    let work: Promise<unknown> = Promise.resolve(), response: Promise<unknown> | undefined;
    handlers.get(name)!({ ...extra, waitUntil: (promise: Promise<unknown>) => { work = promise; }, respondWith: (promise: Promise<unknown>) => { response = promise; } });
    await work; return response;
  }
  return { scope, prefix, name: prefix + version, shared, fetch, caches, claim, skipWaiting, dispatch };
}
describe('offline service worker', () => {
  it('caches every integrity-checked asset before readiness and never forces activation', async () => {
    const w = worker(); await w.dispatch('install');
    expect(w.fetch).toHaveBeenCalledTimes(3);
    for (const [request] of w.fetch.mock.calls) { expect(request.integrity).toMatch(/^sha256-/); expect(request.cache).toBe('no-store'); expect(request.redirect).toBe('error'); }
    const reply = vi.fn(); await w.dispatch('message', { data: { type: 'ANNESBASE_OFFLINE_STATUS' }, ports: [{ postMessage: reply }] });
    expect(reply).toHaveBeenCalledWith({ type: 'ANNESBASE_OFFLINE_STATUS', ready: true, version: 'one' });
    expect(w.skipWaiting).not.toHaveBeenCalled(); expect(w.claim).not.toHaveBeenCalled();
  });
  it('cleans a partial install without deleting an old version, another scope or user data', async () => {
    const w = worker(); w.shared.set(w.prefix + 'older', new Map()); w.shared.set('unrelated-app', new Map());
    w.fetch.mockRejectedValueOnce(new Error('Disconnected'));
    await expect(w.dispatch('install')).rejects.toThrow('Disconnected');
    expect([...w.shared.keys()]).toEqual([w.prefix + 'older', 'unrelated-app']);
    await w.dispatch('install');
    w.shared.set('annesbase.shell.v1:https://example.test/other/:one', new Map());
    await w.dispatch('activate'); expect(w.claim).toHaveBeenCalledOnce();
    expect([...w.shared.keys()].sort()).toEqual(['unrelated-app', w.name, 'annesbase.shell.v1:https://example.test/other/:one'].sort());
  });
  it('serves only the cached app entry and known assets, leaving APIs, databases and other methods alone', async () => {
    const w = worker(); await w.dispatch('install'); w.fetch.mockClear();
    const request = (url: string, method = 'GET', mode = 'cors') => ({ url: new URL(url, w.scope).href, method, mode });
    expect(await w.dispatch('fetch', { request: request('./?source=home', 'GET', 'navigate') })).toMatchObject({ body: 'asset' });
    expect(await w.dispatch('fetch', { request: request('assets/sql.wasm') })).toMatchObject({ body: 'asset' });
    for (const req of [request('private.qbase'), request('api/records'), request('assets/sql.wasm', 'POST'), request('https://external.test/file'), request('nested/route', 'GET', 'navigate')]) {
      expect(await w.dispatch('fetch', { request: req })).toBeUndefined();
    }
    expect(w.fetch).not.toHaveBeenCalled();
  });
  it('reports eviction and repairs missing files without clearing good cached files when repair fails', async () => {
    const w = worker(); await w.dispatch('install');
    w.shared.get(w.name)!.delete(new URL('assets/sql.wasm', w.scope).href);
    const reply = vi.fn(); const ports = [{ postMessage: reply }];
    await w.dispatch('message', { data: { type: 'ANNESBASE_OFFLINE_STATUS' }, ports });
    expect(reply.mock.lastCall![0].ready).toBe(false);
    w.fetch.mockRejectedValueOnce(new Error('Offline'));
    await w.dispatch('message', { data: { type: 'ANNESBASE_REPAIR_OFFLINE' }, ports });
    expect(reply.mock.lastCall![0].ready).toBe(false); expect(w.shared.get(w.name)!.size).toBe(2);
    await w.dispatch('message', { data: { type: 'ANNESBASE_REPAIR_OFFLINE' }, ports });
    expect(reply.mock.lastCall![0].ready).toBe(true);
  });
});
