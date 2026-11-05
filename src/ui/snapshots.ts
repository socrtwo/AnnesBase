import type { DatabaseSession } from '../engine/database';
import type { PreferenceStorage } from '../prefs';
import { SnapshotQueue, type SnapshotInput, type SnapshotStore } from '../storage/snapshots';
import { loadSnapshotSettings, saveSnapshotSettings } from '../storage/snapshotPreferences';

interface Context { session?: DatabaseSession; documentId?: string; busy: boolean; draftChanged: boolean }
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); if (text !== undefined) element.textContent = text; return element;
}
export function mountSnapshots(
  host: HTMLElement, store: SnapshotStore, storage: PreferenceStorage | undefined,
  context: () => Context, restore: (bytes: Uint8Array, name: string) => Promise<void>,
  download: (bytes: Uint8Array, name: string) => void,
) {
  const queue = new SnapshotQueue(store);
  const settings = loadSnapshotSettings(storage);
  let disposed = false, working = false, listing = 0, lastCapture = 0, pending = 0;
  host.hidden = true; host.className = 'browser-snapshots'; host.setAttribute('aria-label', 'Snapshots');
  const heading = node('h3', 'Snapshots'); heading.tabIndex = -1;
  const status = node('p'); status.setAttribute('role', 'status');
  const error = node('p'); error.setAttribute('role', 'alert');
  const label = node('input'); label.value = 'Manual snapshot'; label.maxLength = 80; label.setAttribute('aria-label', 'Snapshot label');
  const create = node('button', 'Create snapshot');
  const automatic = node('input'); automatic.type = 'checkbox'; automatic.checked = settings.enabled;
  const automaticLabel = node('label', 'Automatic snapshots before changes '); automaticLabel.append(automatic);
  const keep = node('input'); keep.type = 'number'; keep.min = '1'; keep.max = '20'; keep.value = String(settings.keep); keep.setAttribute('aria-label', 'Automatic snapshots to keep per database');
  const scope = node('input'); scope.type = 'checkbox'; scope.checked = true;
  const scopeLabel = node('label', 'Current database only '); scopeLabel.append(scope);
  const refresh = node('button', 'Refresh snapshots');
  const list = node('ul'); list.className = 'recovery-list';
  const help = node('p', 'Manual snapshots are pinned until removed. Automatic snapshots keep 1–20 versions per database; rapid pending captures may be combined. The journal keeps each committed change. Restore opens a separate copy. Browser storage can be cleared or evicted: download backups.');
  host.append(heading, help, label, create, automaticLabel, keep, scopeLabel, refresh, status, error, list);
  const fail = (reason: unknown) => { if (!disposed) { host.hidden = false; error.textContent = `Snapshot operation failed: ${reason instanceof Error ? reason.message : String(reason)}`; } };
  function controls() {
    const current = context(); create.disabled = working || current.busy || current.draftChanged || !current.session?.editable;
    label.disabled = create.disabled; refresh.disabled = working;
    for (const button of list.querySelectorAll('button')) button.disabled = working || current.busy;
  }
  function persist() {
    if (!saveSnapshotSettings(storage, settings)) status.textContent = 'Snapshot settings apply to this session only; browser preferences are unavailable.';
  }
  function toggleAutomatic() { if (disposed) return; settings.enabled = !settings.enabled; automatic.checked = settings.enabled; persist(); }
  automatic.addEventListener('change', () => { settings.enabled = automatic.checked; persist(); });
  keep.addEventListener('change', () => {
    const value = Number(keep.value);
    if (!Number.isInteger(value) || value < 1 || value > 20) { keep.value = String(settings.keep); error.textContent = 'Keep between 1 and 20 automatic snapshots.'; return; }
    settings.keep = value; error.textContent = ''; persist();
  });
  const capture = (kind: SnapshotInput['kind'], text: string): SnapshotInput | undefined => {
    const current = context();
    if (!current.session?.editable || !current.documentId || current.busy) return;
    lastCapture = Math.max(Date.now(), lastCapture + 1);
    return { id: crypto.randomUUID(), documentId: current.documentId, name: current.session.name, label: text, kind, capturedAt: lastCapture, bytes: Uint8Array.from(current.session.exportCopy()).buffer };
  };
  async function save(input: SnapshotInput) {
    pending++; status.textContent = 'Saving snapshot… Keep this page open until it finishes.';
    try {
      const result = await queue.save(input, settings.keep);
      if (disposed || !result) return;
      error.textContent = ''; status.textContent = `${result.label} saved in this browser.`;
      await refreshList();
    } catch (reason) { fail(reason); }
    finally { pending--; if (!disposed && pending) status.textContent = 'Saving snapshot… Keep this page open until it finishes.'; }
  }
  create.addEventListener('click', () => {
    if (disposed || create.disabled) return;
    try { const input = capture('manual', label.value); if (input) void save(input); } catch (reason) { fail(reason); }
  });
  const filename = (name: string, text: string) => `${name.replace(/\.[^.]+$/, '')}-${text}`.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 180) + '.qbase';
  async function operation(action: () => Promise<void>) {
    if (disposed || working || context().busy) return;
    working = true; error.textContent = ''; controls();
    try { await action(); } catch (reason) { fail(reason); }
    finally { working = false; if (!disposed) { await refreshList(); controls(); } }
  }
  async function refreshList() {
    const request = ++listing;
    try {
      const entries = await store.list();
      if (disposed || request !== listing) return;
      list.replaceChildren();
      const current = context();
      for (const entry of entries.filter(item => !scope.checked || !current.documentId || item.documentId === current.documentId)) {
        const item = node('li');
        item.append(node('span', `${entry.label} · ${entry.name} · ${new Date(entry.capturedAt).toLocaleString()} · ${entry.kind === 'manual' ? 'Pinned' : 'Automatic'} · ${entry.size.toLocaleString()} bytes`));
        const restoreButton = node('button', 'Restore as new copy');
        restoreButton.addEventListener('click', () => { void operation(async () => {
          const saved = await store.read(entry.id);
          if (disposed) return;
          await restore(new Uint8Array(saved.bytes), filename(saved.name, 'snapshot copy'));
          if (!disposed) scope.checked = false;
        }); });
        const downloadButton = node('button', 'Download snapshot');
        downloadButton.addEventListener('click', () => { void operation(async () => {
          const saved = await store.read(entry.id);
          if (!disposed) download(new Uint8Array(saved.bytes), filename(saved.name, `${saved.label}-${saved.capturedAt}`));
        }); });
        const remove = node('button', 'Remove snapshot');
        remove.addEventListener('click', () => { void operation(async () => { await store.remove(entry.id); if (!disposed) status.textContent = 'Snapshot removed. Open databases and recovery copies were kept.'; }); });
        item.append(restoreButton, downloadButton, remove); list.append(item);
      }
      if (!list.children.length) list.append(node('li', 'No snapshots in this view.'));
      controls();
    } catch (reason) { if (request === listing) fail(reason); }
  }
  refresh.addEventListener('click', () => { void refreshList(); });
  scope.addEventListener('change', () => { void refreshList(); });
  let documentId: string | undefined;
  return {
    show: () => { if (disposed) return; host.hidden = false; void refreshList(); heading.focus(); host.scrollIntoView?.({ block: 'start' }); },
    contextChanged: () => {
      controls(); const next = context().documentId;
      if (next !== documentId) { documentId = next; if (!host.hidden) void refreshList(); }
    },
    beforeChange: (): SnapshotInput | undefined => {
      if (!settings.enabled || disposed) return;
      try { return capture('automatic', 'Before change'); } catch (reason) { fail(reason); return; }
    },
    saveAutomatic: (input: SnapshotInput) => { void save(input); },
    get isSaving() { return pending > 0; },
    toggleAutomatic,
    dispose: () => { disposed = true; },
  };
}
