import type { TableView } from '../engine/tableView';
import { normalizeDefinition, schemaKey, type SavedView, type SavedViewStore, type ViewDefinition, type ViewSchema } from '../storage/savedViews';

interface Context extends ViewSchema { identity: object; sourceName: string; view: TableView; filterEnabled: boolean; busy: boolean }
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; return value; };

export function mountSavedViews(host: HTMLElement, store: SavedViewStore, context: () => Context | undefined, apply: (view: TableView, enabled: boolean) => boolean) {
  host.className = 'saved-views'; host.setAttribute('aria-label', 'Saved table views'); host.hidden = true;
  const heading = node('h3', 'Saved views'); heading.tabIndex = -1;
  const help = node('p', 'Save the applied settings: sort levels, conditions, Find and the filter toggle. Apply view first to include changes to the controls. These browser presets can be reused in databases with the same table name and column layout. Loading is always explicit.');
  const name = node('input'); name.maxLength = 80; name.setAttribute('aria-label', 'Saved view name'); name.placeholder = 'Name this view';
  const choice = node('select'); choice.setAttribute('aria-label', 'Saved views for this table');
  const all = node('input'); all.type = 'checkbox';
  const allLabel = node('label', 'Show views for other tables '); allLabel.append(all);
  const mismatch = node('p', 'The selected view uses a different table or column layout. Choose a compatible table to load it, or remove the preset.'); mismatch.hidden = true;
  const status = node('p'); status.setAttribute('role', 'status');
  const error = node('p'); error.setAttribute('role', 'alert');
  let disposed = false, working = false, pendingWrite = false, request = 0, entries: SavedView[] = [], signature = '', identity: object | undefined;
  const current = () => { try { return context(); } catch { return undefined; } };
  const selected = () => entries.find(entry => entry.id === choice.value);
  const compatible = (entry: SavedView | undefined, ctx = current()) => !!entry && !!ctx && schemaKey(entry) === schemaKey(ctx);
  const button = (text: string, action: () => void) => { const value = node('button', text); value.type = 'button'; value.addEventListener('click', () => { if (!disposed) action(); }); return value; };
  const capture = (): ViewDefinition => {
    const ctx = current(); if (!ctx || ctx.busy) throw new Error('Choose an available table first.');
    return normalizeDefinition({ ...ctx, name: name.value });
  };
  const save = button('Save applied view', () => { void operation(async () => { const saved = await store.create(capture()); choice.dataset.preferred = saved.id; return `Saved “${saved.name}” in this browser.`; }, true); });
  const load = button('Load saved view', () => { void operation(async () => {
    const entry = selected(); const ctx = current(); if (!entry || !ctx) return '';
    const saved = await store.read(entry.id); const after = current();
    if (!after || after.identity !== ctx.identity || schemaKey(after) !== schemaKey(ctx)) throw new Error('The database or table changed. Choose a saved view for the current table.');
    if (saved.revision !== entry.revision) throw new Error('This saved view changed in another tab. Refresh the list before loading it.');
    if (!compatible(saved, after)) throw new Error('This saved view needs a different column layout. The current view was kept.');
    return apply(saved.view, saved.filterEnabled) ? `Loaded “${saved.name}”.` : 'Loading cancelled; the current view and form were kept.';
  }); });
  const replace = button('Replace selected view', () => { void operation(async () => {
    const entry = selected(); if (!entry || !compatible(entry)) return '';
    const saved = await store.update(entry.id, capture(), entry.revision); choice.dataset.preferred = saved.id; return `Replaced “${saved.name}” with the applied settings.`;
  }, true); });
  const remove = button('Remove saved view', () => { void operation(async () => {
    const entry = selected(); if (!entry) return '';
    await store.remove(entry.id, entry.revision); return 'Saved view removed. Open database records and settings were kept.';
  }, true); });
  const refresh = button('Refresh saved views', () => { error.textContent = ''; void list(); });
  const note = node('p', 'Saved views contain filter values and stay only in this browser and site. They are separate from database downloads, recovery copies and snapshots; clearing browser storage can remove them.');
  host.append(heading, help, name, save, choice, allLabel, load, replace, remove, refresh, mismatch, status, error, note);
  function controls() {
    const ctx = current(); const disabled = working || !ctx || ctx.busy;
    save.disabled = disabled; load.disabled = replace.disabled = disabled || !compatible(selected());
    remove.disabled = disabled || !selected(); refresh.disabled = working || !ctx || ctx.busy; choice.disabled = disabled; name.disabled = disabled; all.disabled = disabled;
    const entry = selected(); mismatch.hidden = !entry || compatible(entry); choice.title = entry && !compatible(entry) ? 'This saved view needs a different column layout.' : '';
  }
  all.addEventListener('change', () => { choice.value = ''; void list(); });
  choice.addEventListener('change', () => { name.value = selected()?.name ?? ''; controls(); });
  async function list() {
    const ticket = ++request; const ctx = current(); if (!ctx) return;
    try {
      const saved = await store.list(); const after = current();
      if (disposed || ticket !== request || !after || after.identity !== ctx.identity || schemaKey(after) !== schemaKey(ctx)) return;
      entries = saved.filter(entry => all.checked || entry.table === ctx.table);
      choice.setAttribute('aria-label', all.checked ? 'Saved view library' : 'Saved views for this table');
      const previous = choice.dataset.preferred ?? choice.value; delete choice.dataset.preferred; choice.replaceChildren();
      const empty = node('option', 'Choose a saved view'); empty.value = ''; choice.append(empty);
      for (const entry of entries) {
        const option = node('option', `${entry.name} · ${entry.table} · ${entry.sourceName}${compatible(entry, after) ? '' : ' · Different column layout'}`); option.value = entry.id; choice.append(option);
      }
      choice.value = entries.some(entry => entry.id === previous) ? previous : '';
      controls();
    } catch (reason) { if (!disposed && ticket === request) error.textContent = `Saved views unavailable: ${reason instanceof Error ? reason.message : String(reason)}`; }
  }
  async function operation(action: () => Promise<string>, write = false) {
    if (disposed || working || !current() || current()!.busy) return;
    working = true; pendingWrite = write; error.textContent = ''; status.textContent = write ? 'Saving view library changes… Keep this page open until it finishes.' : 'Loading saved view…'; controls();
    try { const result = await action(); if (!disposed) status.textContent = result; }
    catch (reason) { if (!disposed) { status.textContent = 'The action did not finish. The current database and applied view were kept.'; error.textContent = `Saved-view operation failed: ${reason instanceof Error ? reason.message : String(reason)}`; } }
    finally { working = false; pendingWrite = false; if (!disposed) { await list(); controls(); } }
  }
  return {
    get isSaving() { return pendingWrite; },
    contextChanged: () => {
      if (disposed) return; const ctx = current(); host.hidden = !ctx;
      const next = ctx ? schemaKey(ctx) : '';
      if (next !== signature || ctx?.identity !== identity) {
        signature = next; identity = ctx?.identity; request++; entries = []; choice.replaceChildren(); name.value = ''; status.textContent = ''; error.textContent = '';
        if (ctx) void list();
      }
      controls();
    },
    show: () => { if (!disposed && current()) { host.hidden = false; void list(); heading.focus(); host.scrollIntoView?.({ block: 'center' }); } },
    dispose: () => { disposed = true; request++; },
  };
}
