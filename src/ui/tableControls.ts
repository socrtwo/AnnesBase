import { filterConditions, sortLevels, MAX_SORT_LEVELS, MAX_FILTER_CONDITIONS, operatorsFor, type FilterCondition, type FilterOperator, type TableColumn, type TableView } from '../engine/tableView';

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
  const result = document.createElement(tag); if (text !== undefined) result.textContent = text; return result;
};
function label(text: string, input: HTMLElement) {
  input.setAttribute('aria-label', text); const result = node('label', text); result.append(input); return result;
}
function rename(control: HTMLElement, text: string) {
  control.setAttribute('aria-label', text); control.parentElement!.firstChild!.textContent = text;
}
function option(select: HTMLSelectElement, value: string, text: string) {
  const item = node('option', text); item.value = value; select.append(item);
}
function button(text: string, action: () => void) {
  const result = node('button', text); result.type = 'button'; result.addEventListener('click', action); return result;
}

export function tableControls(container: HTMLElement, columns: TableColumn[], view: TableView, filterEnabled: boolean, apply: (view: TableView, enabled: boolean) => void): void {
  container.replaceChildren();
  const form = node('form'); form.className = 'table-view-form'; form.setAttribute('aria-label', 'Table view');
  const sorting = node('fieldset'); sorting.append(node('legend', 'Sort levels'));
  const sortList = node('div'); sorting.append(sortList);
  const filtering = node('fieldset'); filtering.append(node('legend', 'Filter conditions'));
  const match = node('select'); option(match, 'all', 'All conditions (AND)'); option(match, 'any', 'Any condition (OR)'); match.value = view.filters?.match ?? 'all';
  const filterList = node('div'); filtering.append(label('Match filter conditions', match), filterList);
  const enabled = node('input'); enabled.type = 'checkbox'; enabled.checked = filterEnabled;
  const search = node('input'); search.type = 'search'; search.maxLength = 512; search.value = view.search ?? ''; search.placeholder = 'Find text or a number across this table';
  const sortRows: { element: HTMLElement; column: HTMLSelectElement; direction: HTMLSelectElement; remove: HTMLButtonElement; up: HTMLButtonElement }[] = [];
  const filterRows: { element: HTMLElement; column: HTMLSelectElement; operator: HTMLSelectElement; value: HTMLInputElement; remove: HTMLButtonElement }[] = [];
  const addSort = button('Add sort level', () => {
    if (sortRows.length >= Math.min(MAX_SORT_LEVELS, columns.length)) return;
    if (!sortRows[0].column.value) sortRows[0].column.value = columns[0].name;
    const unused = columns.find(column => !sortRows.some(row => row.column.value === column.name));
    if (unused) appendSort(unused.name); renderSorts(); sortRows.at(-1)!.column.focus();
  });
  const addFilter = button('Add filter condition', () => {
    if (filterRows.length >= MAX_FILTER_CONDITIONS) return;
    if (!filterRows[0].column.value) { filterRows[0].column.value = columns[0].name; filterRows[0].column.dispatchEvent(new Event('change')); }
    appendFilter(); renderFilters(); filterRows.at(-1)!.column.focus();
  });
  sorting.append(addSort); filtering.append(addFilter);
  function renderSorts() {
    sortRows.forEach((row, index) => {
      rename(row.column, index ? `Then sort column ${index + 1}` : 'Sort column');
      rename(row.direction, index ? `Sort direction ${index + 1}` : 'Sort direction');
      row.column.required = sortRows.length > 1;
      row.remove.textContent = `Remove sort level ${index + 1}`; row.up.textContent = `Move sort level ${index + 1} up`; row.up.disabled = index === 0;
      if (sortList.children[index] !== row.element) sortList.insertBefore(row.element, sortList.children[index] ?? null);
    });
    addSort.disabled = sortRows.length >= Math.min(MAX_SORT_LEVELS, columns.length);
  }
  function appendSort(column = '', direction = 'ASC') {
    const element = node('div'); element.className = 'sort-level';
    const select = node('select'); select.dataset.sortColumn = ''; option(select, '', 'Default order'); columns.forEach(column => option(select, column.name, column.name)); select.value = column;
    const order = node('select'); option(order, 'ASC', 'Ascending'); option(order, 'DESC', 'Descending'); order.value = direction;
    const remove = button('Remove sort level', () => {
      const index = sortRows.indexOf(row);
      if (sortRows.length === 1) { select.value = ''; order.value = 'ASC'; }
      else { sortRows.splice(index, 1); element.remove(); }
      renderSorts(); sortRows[Math.min(index, sortRows.length - 1)].column.focus();
    });
    const up = button('Move sort level up', () => {
      const index = sortRows.indexOf(row); if (index <= 0) return;
      [sortRows[index - 1], sortRows[index]] = [sortRows[index], sortRows[index - 1]]; renderSorts(); row.column.focus();
    });
    const row = { element, column: select, direction: order, remove, up };
    element.append(label('Sort column', select), label('Sort direction', order), up, remove); sortRows.push(row);
  }
  function renderFilters() {
    filterRows.forEach((row, index) => {
      rename(row.column, index ? `Filter column ${index + 1}` : 'Filter column');
      rename(row.operator, index ? `Filter condition ${index + 1}` : 'Filter condition');
      rename(row.value, index ? `Filter value ${index + 1}` : 'Filter value');
      row.column.required = filterRows.length > 1; row.remove.textContent = `Remove filter condition ${index + 1}`;
      if (filterList.children[index] !== row.element) filterList.insertBefore(row.element, filterList.children[index] ?? null);
    });
    const active = filterRows.some(row => !!row.column.value); enabled.disabled = match.disabled = !active;
    addFilter.disabled = filterRows.length >= MAX_FILTER_CONDITIONS || !columns.length;
  }
  function appendFilter(initial?: FilterCondition) {
    const element = node('div'); element.className = 'filter-condition';
    const column = node('select'); column.dataset.filterColumn = ''; option(column, '', 'All records'); columns.forEach(item => option(column, item.name, item.name)); column.value = initial?.column ?? '';
    const operator = node('select'); const value = node('input'); value.type = 'text'; value.maxLength = 512; value.value = initial?.value ?? '';
    const updateValue = () => {
      value.disabled = !column.value || ['isNull', 'isNotNull'].includes(operator.value);
      value.inputMode = columns.find(item => item.name === column.value)?.kind === 'integer' ? 'numeric' : 'text';
    };
    const updateOperators = (selected?: string) => {
      operator.replaceChildren(); const field = columns.find(item => item.name === column.value);
      if (field) {
        for (const item of operatorsFor(field)) option(operator, item.value, item.label);
        operator.value = selected && [...operator.options].some(item => item.value === selected) ? selected : field.kind === 'integer' || field.kind === 'number' ? 'equals' : operator.options[0].value;
      }
      operator.disabled = !field; updateValue();
    };
    column.addEventListener('change', () => { enabled.checked = true; updateOperators(); renderFilters(); });
    operator.addEventListener('change', updateValue); updateOperators(initial?.operator);
    const remove = button('Remove filter condition', () => {
      const index = filterRows.indexOf(row);
      if (filterRows.length === 1) { column.value = ''; value.value = ''; updateOperators(); }
      else { filterRows.splice(index, 1); element.remove(); }
      renderFilters(); filterRows[Math.min(index, filterRows.length - 1)].column.focus();
    });
    const row = { element, column, operator, value, remove };
    element.append(label('Filter column', column), label('Filter condition', operator), label('Filter value', value), remove); filterRows.push(row);
  }
  const levels = sortLevels(view); if (levels.length) levels.forEach(level => appendSort(level.column, level.direction)); else appendSort();
  const conditions = filterConditions(view); if (conditions.length) conditions.forEach(appendFilter); else appendFilter();
  renderSorts(); renderFilters();
  const submit = node('button', 'Apply view'); submit.type = 'submit';
  const error = node('p'); error.setAttribute('role', 'alert');
  form.append(sorting, filtering, label('Apply column filter', enabled), label('Find in table', search), submit);
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const conditions = filterRows.filter(row => row.column.value).map(row => ({ column: row.column.value, operator: row.operator.value as FilterOperator, value: row.value.value }));
      apply({
        sorts: sortRows.filter(row => row.column.value).map(row => ({ column: row.column.value, direction: row.direction.value as 'ASC' | 'DESC' })),
        filters: conditions.length ? { match: match.value as 'all' | 'any', conditions } : undefined,
        search: search.value,
      }, enabled.checked);
    } catch (reason) { error.textContent = reason instanceof Error ? reason.message : String(reason); }
  });
  container.append(form, error, node('p', 'Sort by up to 5 columns in priority order. Match all or any of up to 8 filter conditions; Find always narrows the combined result. NULL is separate from empty text. Views change displayed records without writing data and reset when switching tables.'));
}
