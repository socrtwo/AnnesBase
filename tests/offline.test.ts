// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountOfflineStatus, type OfflinePlatform } from '../src/pwa/offline';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); });
function setup(production = true, secure = true, offlineExisting = false) {
  const root = document.createElement('div'); document.body.append(root);
  const worker = Object.assign(new EventTarget(), { state: 'activated' });
  const registration = Object.assign(new EventTarget(), { active: worker, installing: null as typeof worker | null, waiting: null as typeof worker | null, update: vi.fn(async () => {}) });
  const workers = Object.assign(new EventTarget(), { register: vi.fn(async () => registration), getRegistration: vi.fn(async () => offlineExisting ? registration : undefined) });
  const events = new EventTarget(); let online = !offlineExisting;
  const query = vi.fn(async () => true), repair = vi.fn(async () => true);
  const platform = { events, workers, secure, online: () => online, query, repair } as unknown as OfflinePlatform;
  const controller = mountOfflineStatus(root, production, platform); cleanups.push(controller.dispose);
  const button = (name: string) => [...root.querySelectorAll('button')].find(button => button.textContent === name)!;
  return { root, worker, registration, workers, events, query, repair, button, controller, offline: () => { online = false; events.dispatchEvent(new Event('offline')); } };
}
describe('offline and installation status', () => {
  it('verifies readiness, reports offline mode and waits for updates without a reload', async () => {
    const { root, query, registration, workers, events, offline } = setup();
    await vi.waitFor(() => expect(root.textContent).toContain('Offline ready.'));
    expect(workers.register).toHaveBeenCalledWith(expect.any(URL), { scope: './', updateViaCache: 'none' });
    offline(); expect(root.textContent).toContain('You’re offline.');
    registration.waiting = Object.assign(new EventTarget(), { state: 'installed' });
    events.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(root.textContent).toContain('close all Anne’s Base windows and tabs'));
    expect(query).toHaveBeenCalled();
  });
  it('recognizes an already installed worker on offline reload without a network registration', async () => {
    const { root, workers } = setup(true, true, true);
    await vi.waitFor(() => expect(root.textContent).toContain('Offline ready. You’re offline.'));
    expect(workers.register).not.toHaveBeenCalled();
  });
  it('keeps production-only and insecure setups unavailable without registering a worker', () => {
    for (const [production, secure] of [[false, true], [true, false]]) {
      const { root, workers, button } = setup(production, secure);
      expect(workers.register).not.toHaveBeenCalled(); expect(button('Check for app updates').hidden).toBe(true);
      expect(root.textContent).toContain(production ? 'requires HTTPS or localhost' : 'production build');
    }
  });
  it('reports update failures without losing the offline-ready state', async () => {
    const { root, registration, button } = setup(); await vi.waitFor(() => expect(root.textContent).toContain('Offline ready.'));
    registration.update.mockRejectedValueOnce(new Error('Disconnected'));
    button('Check for app updates').click();
    await vi.waitFor(() => expect(root.textContent).toContain('Could not check for app updates: Disconnected'));
    expect(root.textContent).toContain('Offline ready.');
  });
  it('offers repair for missing files and reports a failed installation', async () => {
    const { root, worker, registration, button, query } = setup();
    await vi.waitFor(() => expect(root.textContent).toContain('Offline ready.'));
    query.mockResolvedValue(false); button('Check for app updates').click();
    await vi.waitFor(() => expect(button('Retry offline setup').hidden).toBe(false));
    expect(root.textContent).toContain('Some offline files are missing');
    const installing = Object.assign(new EventTarget(), { state: 'installing' }); registration.installing = installing;
    registration.dispatchEvent(new Event('updatefound')); installing.state = 'redundant'; installing.dispatchEvent(new Event('statechange'));
    expect(root.textContent).toContain('offline download failed'); expect(worker.state).toBe('activated');
  });
  it('shows the install button only for a browser prompt and invokes it on a user click', async () => {
    const { events, button, controller, root } = setup();
    const prompt = vi.fn(async () => {});
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    events.dispatchEvent(event); expect(event.defaultPrevented).toBe(true); expect(prompt).not.toHaveBeenCalled();
    expect(button('Install app').hidden).toBe(false); button('Install app').click(); expect(prompt).toHaveBeenCalledOnce();
    expect(button('Install app').hidden).toBe(true);
    controller.dispose(); events.dispatchEvent(event); expect(root.children).toHaveLength(0);
  });
});
