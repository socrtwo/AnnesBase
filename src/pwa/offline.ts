interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export interface OfflinePlatform {
  events: EventTarget;
  workers?: ServiceWorkerContainer;
  secure: boolean;
  online: () => boolean;
  query: (worker: ServiceWorker) => Promise<boolean>;
  repair?: (worker: ServiceWorker) => Promise<boolean>;
}
export function queryOffline(worker: ServiceWorker, repair = false): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = () => { clearTimeout(timeout); channel.port1.close(); channel.port2.close(); };
    const timeout = setTimeout(() => { finish(); reject(new Error('Offline readiness could not be verified.')); }, repair ? 30000 : 5000);
    channel.port1.onmessage = event => { finish(); resolve(event.data?.type === 'ANNESBASE_OFFLINE_STATUS' && event.data.ready === true); };
    try { worker.postMessage({ type: repair ? 'ANNESBASE_REPAIR_OFFLINE' : 'ANNESBASE_OFFLINE_STATUS' }, [channel.port2]); }
    catch (error) { finish(); reject(error); }
  });
}
const browserPlatform = (): OfflinePlatform => ({
  events: window, secure: window.isSecureContext, workers: navigator.serviceWorker,
  online: () => navigator.onLine, query: queryOffline, repair: worker => queryOffline(worker, true),
});

/** No automatic reload or skipWaiting: updates cannot replace a running editor. */
export function mountOfflineStatus(host: HTMLElement, production: boolean, platform = browserPlatform()) {
  const region = document.createElement('aside'); region.className = 'app-availability'; region.setAttribute('aria-label', 'App installation and offline status');
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const install = document.createElement('button'); install.textContent = 'Install app'; install.hidden = true;
  const check = document.createElement('button'); check.textContent = 'Check for app updates';
  const retry = document.createElement('button'); retry.textContent = 'Retry offline setup'; retry.hidden = true;
  const help = document.createElement('p'); help.className = 'offline-help';
  help.textContent = 'Use your browser’s Install app or Add to Home Screen menu when available. Offline files and database recovery copies belong to this browser and site address; keep downloaded backups.';
  region.append(status, install, check, retry, help); host.append(region);
  let disposed = false, registration: ServiceWorkerRegistration | undefined, ready = false, working = false, error = '', generation = 0;
  let prompt: InstallPrompt | undefined;
  const cleanups: (() => void)[] = [];
  const watched = new WeakSet<ServiceWorker>();
  const listen = (target: EventTarget, name: string, handler: EventListener) => {
    target.addEventListener(name, handler); cleanups.push(() => target.removeEventListener(name, handler));
  };
  const supported = production && platform.secure && !!platform.workers;
  function render() {
    if (disposed) return;
    if (!production) status.textContent = 'Offline installation is available in the production build.';
    else if (!supported) status.textContent = 'Offline installation requires HTTPS or localhost and a browser that supports service workers.';
    else {
      const connection = platform.online() ? '' : ' You’re offline.';
      const base = ready ? 'Offline ready.' : 'Offline files are not ready yet.';
      status.textContent = working && !ready ? 'Saving the editor and SQLite for offline use…' : base;
      status.textContent += connection;
      if (registration?.waiting) status.textContent += ' App update ready. Save your work, then close all Anne’s Base windows and tabs and reopen to use it. This window will stay on its current version.';
      if (error) status.textContent += ` ${error}`;
    }
    check.hidden = !supported; check.disabled = working || !registration;
    retry.hidden = !supported || ready || !error; retry.disabled = working;
    install.hidden = !production || !prompt;
  }
  async function inspect() {
    const request = ++generation;
    try {
      const worker = registration?.active;
      const result = worker ? await platform.query(worker) : false;
      if (disposed || request !== generation) return;
      ready = result;
      if (result) error = '';
      if (worker && !result) error = 'Some offline files are missing. Reconnect and retry offline setup.';
    } catch (reason) { if (!disposed && request === generation) { ready = false; error = reason instanceof Error ? reason.message : String(reason); } }
    render();
  }
  function watch(worker: ServiceWorker | null) {
    if (!worker || watched.has(worker)) return; watched.add(worker);
    const changed = () => {
      if (disposed) return;
      if (worker.state === 'redundant') { working = false; error = 'The offline download failed. Reconnect and retry; the open database was kept.'; }
      else if (worker.state === 'activated' || worker.state === 'installed') {
        working = false; void inspect();
      }
      render();
    };
    listen(worker, 'statechange', changed); changed();
  }
  async function setup() {
    if (!supported || disposed || working) return;
    working = true; error = ''; render();
    try {
      const scope = new URL('./', window.location.href).href;
      const existing = await platform.workers!.getRegistration?.(scope);
      let next: ServiceWorkerRegistration;
      try {
        next = existing?.active && !platform.online() ? existing : await platform.workers!.register(new URL('./sw.js', window.location.href), { scope: './', updateViaCache: 'none' });
      } catch (reason) {
        if (!existing?.active) throw reason;
        next = existing;
      }
      if (disposed) return;
      if (registration !== next) {
        registration = next;
        listen(next, 'updatefound', () => { if (disposed) return; working = !ready; watch(next.installing); render(); });
      }
      watch(next.installing);
      await inspect();
      if (!ready && next.active && !next.installing && platform.repair) {
        await platform.repair(next.active); await inspect();
      }
      // Keep an in-flight installation visible; repairs never clear IndexedDB.
      if (!next.installing) working = false;
    } catch (reason) { if (!disposed) { working = false; error = `Offline setup failed: ${reason instanceof Error ? reason.message : String(reason)}`; } }
    render();
  }
  retry.addEventListener('click', () => { void setup(); });
  check.addEventListener('click', () => {
    if (!registration || working || disposed) return;
    working = true; error = ''; render();
    void registration.update().then(async () => { if (!disposed) await inspect(); }).catch(reason => {
      if (!disposed) error = `Could not check for app updates: ${reason instanceof Error ? reason.message : String(reason)}`;
    }).finally(() => { working = false; render(); });
  });
  install.addEventListener('click', () => {
    const request = prompt; if (!request || disposed) return;
    prompt = undefined; render();
    void request.prompt().then(() => request.userChoice).catch(reason => { if (!disposed) { error = `Installation could not start: ${reason instanceof Error ? reason.message : String(reason)}`; render(); } });
  });
  listen(platform.events, 'beforeinstallprompt', event => {
    if (!production || !supported) return;
    event.preventDefault(); prompt = event as InstallPrompt; render();
  });
  listen(platform.events, 'appinstalled', () => { prompt = undefined; render(); });
  for (const name of ['online', 'offline']) listen(platform.events, name, () => { render(); void inspect(); });
  if (supported) listen(platform.workers!, 'controllerchange', () => { void inspect(); });
  render(); void setup();
  return { dispose: () => { disposed = true; generation++; cleanups.splice(0).forEach(cleanup => cleanup()); region.remove(); } };
}
