import type { Cell } from '../engine/database';
import type { Field, RecordValues } from '../engine/journal';

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};
function label(text: string, input: HTMLElement): HTMLLabelElement {
  input.setAttribute('aria-label', text);
  const node = element('label', text); node.append(input); return node;
}
function editor(container: HTMLElement, title: string, submit: () => void, cancel: () => void, submitLabel: string) {
  container.replaceChildren(); container.hidden = false;
  const heading = element('h3', title);
  heading.tabIndex = -1;
  const form = element('form');
  const error = element('p'); error.setAttribute('role', 'alert');
  const buttons = element('div'); buttons.className = 'editor-actions';
  const save = element('button', submitLabel); save.type = 'submit';
  const back = element('button', 'Cancel editing'); back.type = 'button'; back.addEventListener('click', cancel);
  buttons.append(save, back);
  form.addEventListener('submit', event => {
    event.preventDefault();
    try { submit(); } catch (reason) { error.textContent = reason instanceof Error ? reason.message : String(reason); }
  });
  container.append(heading, form, error);
  heading.focus();
  return { form, buttons };
}

export function tableEditor(container: HTMLElement, save: (name: string, fields: Field[]) => void, cancel: () => void): void {
  const name = element('input'); name.value = 'Table1'; name.required = true; name.maxLength = 64;
  const fields = element('div'); fields.className = 'field-list';
  const controls: { name: HTMLInputElement; type: HTMLSelectElement; required: HTMLInputElement; row: HTMLElement }[] = [];
  const { form, buttons } = editor(container, 'Create table', () => {
    save(name.value, controls.map(field => ({ name: field.name.value, type: field.type.value as Field['type'], required: field.required.checked })));
  }, cancel, 'Create table');
  function addField(fieldName = '', required = false) {
    const row = element('div'); row.className = 'field-definition';
    const input = element('input'); input.value = fieldName; input.required = true; input.maxLength = 64;
    const type = element('select');
    for (const [value, title] of [['TEXT', 'Text'], ['INTEGER', 'Whole number'], ['REAL', 'Decimal number']]) {
      const option = element('option', title); option.value = value; type.append(option);
    }
    const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.checked = required;
    const remove = element('button', 'Remove field'); remove.type = 'button';
    const control = { name: input, type, required: checkbox, row };
    remove.addEventListener('click', () => { controls.splice(controls.indexOf(control), 1); row.remove(); });
    row.append(label('Field name', input), label('Type', type), label('Required', checkbox), remove);
    controls.push(control); fields.append(row);
    return input;
  }
  const add = element('button', 'Add field'); add.type = 'button';
  add.addEventListener('click', () => { if (controls.length < 32) addField().focus(); });
  addField('title', true); addField('notes');
  form.append(label('Table name', name), element('p', 'An automatic integer id is included. Add up to 32 Text, Whole number or Decimal number fields.'), fields, add, buttons);
}

export function recordEditor(container: HTMLElement, fields: Field[], row: Cell[] | undefined, save: (values: RecordValues) => void, cancel: () => void): void {
  const controls: { name: string; input: HTMLTextAreaElement; nullBox: HTMLInputElement }[] = [];
  const { form, buttons } = editor(container, row ? `Edit record ${String(row[0])}` : 'Add record', () => {
    const values: RecordValues = Object.create(null);
    for (const control of controls) values[control.name] = control.nullBox.checked ? null : control.input.value;
    save(values);
  }, cancel, 'Save record');
  for (const [index, field] of fields.entries()) {
    const input = element('textarea'); input.rows = field.type === 'TEXT' ? 2 : 1;
    if (field.type !== 'TEXT') input.inputMode = field.type === 'INTEGER' ? 'numeric' : 'decimal';
    const value = row?.[index + 1]; input.value = value == null ? '' : String(value);
    const nullBox = element('input'); nullBox.type = 'checkbox'; nullBox.checked = row ? value === null : !field.required;
    nullBox.disabled = field.required;
    const sync = () => { input.disabled = nullBox.checked; input.required = field.required && field.type !== 'TEXT'; };
    nullBox.addEventListener('change', sync); sync();
    const group = element('div'); group.className = 'record-field';
    group.append(label(field.name, input), label(`${field.name}: NULL`, nullBox), element('small', `${field.type}${field.required ? ' · Required' : ''}`));
    form.append(group); controls.push({ name: field.name, input, nullBox });
  }
  form.append(buttons);
}
