import { quoteName } from './journal';

export interface TableColumn { name: string; type: string; primaryKey: number; kind: 'text' | 'integer' | 'number' | 'blob' }
export type FilterOperator = 'contains' | 'equals' | 'notEquals' | 'gt' | 'gte' | 'lt' | 'lte' | 'isNull' | 'isNotNull';
export interface TableView {
  sort?: { column: string; direction: 'ASC' | 'DESC' };
  filter?: { column: string; operator: FilterOperator; value?: string };
  search?: string;
}
export const FILTER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'contains', label: 'Contains' }, { value: 'equals', label: 'Equals' }, { value: 'notEquals', label: 'Does not equal' },
  { value: 'gt', label: 'Greater than' }, { value: 'gte', label: 'At least' },
  { value: 'lt', label: 'Less than' }, { value: 'lte', label: 'At most' },
  { value: 'isNull', label: 'Is NULL' }, { value: 'isNotNull', label: 'Is not NULL' },
];
export function columnKind(type: string): TableColumn['kind'] {
  const name = type.toUpperCase();
  if (name.includes('INT')) return 'integer';
  if (/CHAR|CLOB|TEXT/.test(name) || !name) return 'text';
  if (name.includes('BLOB')) return 'blob';
  return 'number';
}
export function operatorsFor(column: TableColumn) {
  return FILTER_OPERATORS.filter(operator => {
    if (column.kind === 'blob') return operator.value === 'isNull' || operator.value === 'isNotNull';
    return column.kind !== 'text' || !['gt', 'gte', 'lt', 'lte'].includes(operator.value);
  });
}

/** Only catalog column names and fixed operators enter SQL; all user values are bound. */
export function compileView(columns: TableColumn[], view: TableView) {
  const lookup = (name: string) => {
    const column = columns.find(column => column.name === name);
    if (!column) throw new Error('Choose a column from this table.');
    return column;
  };
  const parts: string[] = [];
  const params: string[] = [];
  if (view.filter) {
    const { column: name, operator, value } = view.filter;
    const column = lookup(name);
    if (!operatorsFor(column).some(option => option.value === operator)) throw new Error('This filter is not supported for the selected column.');
    const sqlName = quoteName(name);
    if (operator === 'isNull' || operator === 'isNotNull') parts.push(`${sqlName} IS ${operator === 'isNotNull' ? 'NOT ' : ''}NULL`);
    else {
      if (typeof value !== 'string' || value.length > 512) throw new Error('Use a filter value of at most 512 characters.');
      if (operator === 'contains') {
        parts.push(`instr(lower(CAST(${sqlName} AS TEXT)), lower(?)) > 0`); params.push(value);
      } else {
        let bound = value;
        const numeric = column.kind === 'integer' || column.kind === 'number';
        if (numeric) {
          bound = value.trim();
          if (column.kind === 'integer') {
            if (!/^[+-]?\d+$/.test(bound)) throw new Error('Use a whole number for this column.');
            const integer = BigInt(bound);
            if (integer < -(2n ** 63n) || integer >= 2n ** 63n) throw new Error('The filter is outside the signed 64-bit integer range.');
            bound = String(integer);
          } else if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(bound) || !Number.isFinite(Number(bound))) {
            throw new Error('Use a finite number for this column.');
          }
        }
        const comparison = { equals: '=', notEquals: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[operator];
        parts.push(`${numeric ? sqlName : `CAST(${sqlName} AS TEXT)`} ${comparison} ?`); params.push(bound);
      }
    }
  }
  if (view.search !== undefined && (typeof view.search !== 'string' || view.search.length > 512)) throw new Error('Use a search term of at most 512 characters.');
  if (view.search) {
    const searchable = columns.filter(column => column.kind !== 'blob');
    parts.push(searchable.length ? '(' + searchable.map(column => `instr(lower(CAST(${quoteName(column.name)} AS TEXT)), lower(?)) > 0`).join(' OR ') + ')' : '0');
    params.push(...searchable.map(() => view.search!));
  }
  const primary = columns.filter(column => column.primaryKey > 0).sort((a, b) => a.primaryKey - b.primaryKey);
  const ties = primary.length ? primary : columns;
  const order: string[] = [];
  if (view.sort) {
    lookup(view.sort.column);
    if (!['ASC', 'DESC'].includes(view.sort.direction)) throw new Error('Choose ascending or descending order.');
    order.push(`${quoteName(view.sort.column)} ${view.sort.direction}`);
  }
  order.push(...ties.filter(column => column.name !== view.sort?.column).map(column => `${quoteName(column.name)} ASC`));
  return { where: parts.length ? ' WHERE ' + parts.join(' AND ') : '', order: order.length ? ' ORDER BY ' + order.join(', ') : '', params };
}
