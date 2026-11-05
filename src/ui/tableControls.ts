import { operatorsFor, type FilterOperator, type TableColumn, type TableView } from '../engine/tableView';

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
  const result = document.createElement(tag); if (text !== undefined) result.textContent = text; return result;
};
function label(text: string, input: HTMLElement) {
  input.setAttribute('aria-label', text); const result = node('label', text); result.append(input); return result;
}
function option(select: HTMLSelectElement, value: string, text: string) {
  const item = node('option', text); item.value = value; select.append(item);
}

export function tableControls(container: HTMLElement, columns: TableColumn[], view: TableView, filterEnabled: boolean, apply: (view: TableView, enabled: boolean) => void): void {
  container.replaceChildren();
  const form = node('form'); form.className = 'table-view-form'; form.setAttribute('aria-label', 'Table view');
  const sort = node('select'); sort.dataset.sortColumn = '';
  option(sort, '', 'Default order'); columns.forEach(column => option(sort, column.name, column.name)); sort.value = view.sort?.column ?? '';
  const direction = node('select'); option(direction, 'ASC', 'Ascending'); option(direction, 'DESC', 'Descending'); direction.value = view.sort?.direction ?? 'ASC';
  const filter = node('select'); filter.dataset.filterColumn = '';
  option(filter, '', 'All records'); columns.forEach(column => option(filter, column.name, column.name)); filter.value = view.filter?.column ?? '';
  const operator = node('select');
  const value = node('input'); value.type = 'text'; value.maxLength = 512; value.value = view.filter?.value ?? '';
  const enabled = node('input'); enabled.type = 'checkbox'; enabled.checked = filterEnabled;
  const search = node('input'); search.type = 'search'; search.maxLength = 512; search.value = view.search ?? ''; search.placeholder = 'Find text or a number across this table';
  const updateValue = () => {
    value.disabled = !filter.value || ['isNull', 'isNotNull'].includes(operator.value);
    enabled.disabled = !filter.value;
    value.inputMode = columns.find(column => column.name === filter.value)?.kind === 'integer' ? 'numeric' : 'text';
  };
  const updateOperators = (selected?: string) => {
    operator.replaceChildren();
    const column = columns.find(column => column.name === filter.value);
    if (column) {
      for (const item of operatorsFor(column)) option(operator, item.value, item.label);
      operator.value = selected && [...operator.options].some(item => item.value === selected) ? selected : column.kind === 'integer' || column.kind === 'number' ? 'equals' : operator.options[0].value;
    }
    operator.disabled = !column; updateValue();
  };
  filter.addEventListener('change', () => { enabled.checked = true; updateOperators(); });
  operator.addEventListener('change', updateValue);
  updateOperators(view.filter?.operator);
  const submit = node('button', 'Apply view'); submit.type = 'submit';
  const error = node('p'); error.setAttribute('role', 'alert');
  form.append(label('Sort column', sort), label('Sort direction', direction), label('Filter column', filter), label('Filter condition', operator), label('Filter value', value), label('Apply column filter', enabled), label('Find in table', search), submit);
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      apply({
        sort: sort.value ? { column: sort.value, direction: direction.value as 'ASC' | 'DESC' } : undefined,
        filter: filter.value ? { column: filter.value, operator: operator.value as FilterOperator, value: value.value } : undefined,
        search: search.value,
      }, enabled.checked);
    } catch (reason) { error.textContent = reason instanceof Error ? reason.message : String(reason); }
  });
  container.append(form, error, node('p', 'Find narrows the table to matching rows. Filters and sorting change the view, not the stored records.'));
}
