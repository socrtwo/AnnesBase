import type { TableColumn } from '../engine/tableView';
import { totalsFor, type TableTotals, type TotalChoice, type TotalOperation } from '../engine/totals';

export function totalsRow(columns: TableColumn[], editable: boolean, choices: TotalChoice[], result: TableTotals | undefined, error: string, change: (column: string, operation: TotalOperation | '') => void) {
  const footer = document.createElement('tfoot'); footer.className = 'totals-row';
  const row = document.createElement('tr');
  if (editable) { const cell = document.createElement('td'); cell.textContent = 'Totals'; row.append(cell); }
  for (const column of columns) {
    const cell = document.createElement('td');
    const select = document.createElement('select'); select.setAttribute('aria-label', `Total for ${column.name}`);
    for (const operation of [{ value: '', label: 'No total' }, ...totalsFor(column)]) {
      const option = document.createElement('option'); option.value = operation.value; option.textContent = operation.label; select.append(option);
    }
    select.value = choices.find(choice => choice.column === column.name)?.operation ?? '';
    select.addEventListener('change', () => change(column.name, select.value as TotalOperation | ''));
    const value = result?.values.find(value => value.column === column.name);
    const display = document.createElement('span'); display.className = 'total-value'; display.dataset.totalColumn = column.name;
    if (value) {
      if (typeof value.value === 'bigint' || typeof value.value === 'number') display.classList.add('numeric-total');
      const text = value.value instanceof Uint8Array ? `BLOB · ${value.value.byteLength} bytes` : String(value.value);
      const formatted = text.length > 2000 ? text.slice(0, 2000) + '… [display shortened]' : text;
      display.textContent = value.error ? 'Unavailable' : value.value === null ? '—' : `${value.operation === 'average' || value.operation === 'sum' && typeof value.value === 'number' ? '≈ ' : ''}${formatted}`;
      if (value.error) { const notice = document.createElement('span'); notice.setAttribute('role', 'alert'); notice.textContent = value.error; cell.append(notice); }
    }
    cell.prepend(select, display); row.append(cell);
  }
  footer.append(row);
  const summary = document.createElement('p'); summary.className = 'totals-summary'; summary.setAttribute('role', 'status');
  summary.textContent = result ? `${result.records} matching records · Totals cover every matching row, not just this page.` : `Totals unavailable: ${error}`;
  const note = document.createElement('p'); note.className = 'totals-note';
  note.textContent = 'Count values skips NULL; — means no non-NULL values. Averages and decimal sums are approximate. Whole-number sums remain exact within the signed 64-bit range. Totals reflect committed records; unsaved forms are excluded.';
  return { footer, summary, note };
}
