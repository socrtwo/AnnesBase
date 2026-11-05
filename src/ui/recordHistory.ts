import type { DatabaseSession, Cell } from '../engine/database';
import type { RecordHistory } from '../engine/journal';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); if (text !== undefined) element.textContent = text; return element;
}
const display = (value: Cell) => value === null ? 'NULL' : value === '' ? '(empty text)' : String(value).slice(0, 2000);
const operations: Record<string, string> = { insert: 'Added', update: 'Edited', delete: 'Deleted', restore: 'Restored' };

export function showRecordHistory(
  container: HTMLElement, session: DatabaseSession, table: string, initialId: string | undefined,
  restore: (recordId: string, eventId: string, side: 'before' | 'after', expected: string | null) => void,
  close: () => void,
): void {
  container.replaceChildren(); container.hidden = false;
  const title = node('h3', `Record history · ${table}`); title.tabIndex = -1;
  const form = node('form');
  const label = node('label', 'Record id');
  const input = node('input'); input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 20;
  input.setAttribute('aria-label', 'Record history id'); input.value = initialId ?? ''; input.required = true; label.append(input);
  const load = node('button', 'Load history'); load.type = 'submit';
  const dismiss = node('button', 'Close record history'); dismiss.type = 'button'; dismiss.addEventListener('click', close);
  form.append(label, load, dismiss);
  const message = node('p', 'Select a change to inspect its before and after values. Deleted records can be found by their id.');
  const error = node('p'); error.setAttribute('role', 'alert');
  const body = node('div');
  container.append(title, form, message, error, body);
  let data: RecordHistory | undefined;
  let loadedId = '';
  let selectedEvent = '';
  let stale = false;
  function render() {
    body.replaceChildren();
    if (!data) return;
    if (data.reason) body.append(node('p', data.reason));
    body.append(node('p', data.currentToken === null ? 'This record is not currently present.' : 'This record currently exists.'));
    if (!data.versions.length) { body.append(node('p', 'No journaled changes for this record yet.')); return; }
    const choice = node('select'); choice.setAttribute('aria-label', 'History change');
    for (const version of data.versions) {
      const option = node('option', `${operations[version.operation] ?? version.operation} · ${new Date(version.time).toLocaleString()} · #${version.id}${version.undone ? ' · Undone' : ''}`);
      option.value = version.id; choice.append(option);
    }
    if (!data.versions.some(version => version.id === selectedEvent)) selectedEvent = data.versions[0].id;
    choice.value = selectedEvent;
    choice.addEventListener('change', () => { selectedEvent = choice.value; render(); });
    const version = data.versions.find(version => version.id === selectedEvent)!;
    const scroll = node('div'); scroll.className = 'record-history-values'; scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', 'Record version values');
    const values = node('table');
    const head = node('thead'); const heading = node('tr');
    for (const title of ['Field', 'Before', 'After']) { const th = node('th', title); th.scope = 'col'; heading.append(th); }
    head.append(heading);
    const rows = node('tbody');
    for (const [index, name] of data.columns.entries()) {
      const row = node('tr'); const th = node('th', name); th.scope = 'row';
      row.append(th, node('td', version.before ? display(version.before[index]) : '(record absent)'), node('td', version.after ? display(version.after[index]) : '(record absent)')); rows.append(row);
    }
    values.append(head, rows); scroll.append(values);
    const actions = node('div'); actions.className = 'history-actions';
    for (const side of ['before', 'after'] as const) {
      const button = node('button', `Restore ${side} values`);
      button.disabled = !data.restorable || stale || version[side] === null;
      button.addEventListener('click', () => {
        try { restore(loadedId, version.id, side, data!.currentToken); }
        catch (reason) { stale = true; error.textContent = reason instanceof Error ? reason.message : String(reason); render(); }
      });
      actions.append(button);
    }
    const older = node('button', 'Load older changes'); older.disabled = !data.hasMore;
    older.addEventListener('click', () => {
      try {
        const page = session.recordHistory(table, loadedId, data!.versions.at(-1)!.id);
        if (page.currentToken !== data!.currentToken) throw new Error('The record changed. Load its history again before restoring.');
        data = { ...page, versions: [...data!.versions, ...page.versions] }; render();
      } catch (reason) { stale = true; error.textContent = reason instanceof Error ? reason.message : String(reason); render(); }
    });
    body.append(choice, scroll, actions, older, node('p', 'Restoring writes a new journaled change that can be undone. Long values are shortened for display; restoration uses the full values.'));
  }
  function loadHistory() {
    try {
      data = session.recordHistory(table, input.value); loadedId = input.value; selectedEvent = ''; stale = false; error.textContent = ''; render();
    } catch (reason) { data = undefined; body.replaceChildren(); error.textContent = reason instanceof Error ? reason.message : String(reason); }
  }
  form.addEventListener('submit', event => { event.preventDefault(); loadHistory(); });
  if (initialId !== undefined) loadHistory();
  title.focus();
}
