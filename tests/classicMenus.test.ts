// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountClassicMenus } from '../src/ui/classicMenus';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); document.body.replaceChildren(); });
function setup() {
  const host = document.createElement('nav'); const outside = document.createElement('input'); document.body.append(host, outside);
  const run = vi.fn();
  const menus = mountClassicMenus(host, id => {
    const button = document.createElement('button'); button.textContent = id; button.disabled = id === 'Planned';
    button.addEventListener('click', () => { run(id); if (id === 'Find') outside.focus(); }); return button;
  });
  cleanups.push(menus.dispose);
  const fixture = [
    { name: 'File', items: ['New', 'Planned', '---', { submenu: 'Export', items: ['CSV', { submenu: 'Advanced', items: ['SQL', 'Script'] }] }, 'Find'] },
    { name: 'Edit', items: ['Undo', 'Planned', 'Update'] },
    { name: 'Help', items: ['Planned'] },
  ];
  menus.render(fixture);
  const find = (text: string) => [...host.querySelectorAll<HTMLElement>('button,summary')].find(node => node.textContent === text)!;
  const key = (key: string, options: KeyboardEventInit = {}) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }));
  const focus = (text: string) => find(text).focus();
  const active = () => document.activeElement?.textContent;
  const isOpen = (text: string) => (find(text).parentElement as HTMLDetailsElement).open;
  return { host, outside, menus, fixture, run, find, key, focus, active, isOpen };
}

describe('classic menu navigation', () => {
  it('wraps the menu bar and enters first/last enabled choices, skipping separators and planned actions', () => {
    const { focus, key, active, isOpen } = setup();
    focus('File'); key('ArrowLeft'); expect(active()).toBe('Help');
    key('ArrowRight'); expect(active()).toBe('File');
    key('End'); expect(active()).toBe('Help'); key('Home'); expect(active()).toBe('File');
    key('ArrowDown'); expect(active()).toBe('New'); expect(isOpen('File')).toBe(true);
    key('ArrowDown'); expect(active()).toBe('Export'); key('ArrowUp'); expect(active()).toBe('New');
    key('ArrowUp'); expect(active()).toBe('Find'); key('Home'); expect(active()).toBe('New');
    key('End'); expect(active()).toBe('Find'); key('Escape'); expect(active()).toBe('File'); expect(isOpen('File')).toBe(false);
    key('ArrowUp'); expect(active()).toBe('Find');
  });
  it('enters nested submenus and closes one level at a time with Left and Escape', () => {
    const { focus, key, active, isOpen } = setup();
    focus('File'); key('ArrowDown'); key('ArrowDown'); key('ArrowRight');
    expect(active()).toBe('CSV'); expect(isOpen('Export')).toBe(true);
    key('ArrowDown'); expect(active()).toBe('Advanced'); key('ArrowRight'); expect(active()).toBe('SQL');
    key('ArrowLeft'); expect(active()).toBe('Advanced'); expect(isOpen('Advanced')).toBe(false);
    key('ArrowLeft'); expect(active()).toBe('Export'); expect(isOpen('Export')).toBe(false);
    key('ArrowRight'); key('Escape'); expect(active()).toBe('Export'); expect(isOpen('File')).toBe(true);
    key('Escape'); expect(active()).toBe('File'); expect(isOpen('File')).toBe(false);
  });
  it('switches top-level menus from a command, handles empty menus and preserves open state on the bar', () => {
    const { focus, key, active, isOpen } = setup();
    focus('File'); key('ArrowDown'); key('ArrowRight'); expect(active()).toBe('Undo'); expect(isOpen('File')).toBe(false);
    key('ArrowLeft'); expect(active()).toBe('New');
    key('Escape'); key('ArrowRight'); expect(active()).toBe('Edit'); expect(isOpen('Edit')).toBe(false);
    key('ArrowDown'); key('Escape'); key('ArrowDown'); key('Escape');
    focus('Help'); key('ArrowDown'); expect(active()).toBe('Help'); expect(isOpen('Help')).toBe(true);
    key('ArrowRight'); expect(active()).toBe('File'); expect(isOpen('File')).toBe(true);
  });
  it('supports type-ahead, repeated-letter cycling and leaves browser modifier shortcuts alone', () => {
    const { focus, key, active } = setup();
    focus('File'); key('ArrowDown'); key('f'); expect(active()).toBe('Find');
    key('Escape'); key('ArrowRight'); key('ArrowDown');
    vi.spyOn(Date, 'now').mockReturnValueOnce(Date.now() + 1000);
    key('u'); expect(active()).toBe('Update'); key('u'); expect(active()).toBe('Undo');
    key('ArrowDown', { ctrlKey: true }); expect(active()).toBe('Undo');
    key('ArrowDown', { isComposing: true }); expect(active()).toBe('Undo'); vi.restoreAllMocks();
  });
  it('allows only one open sibling and dismisses after execution, outside pointer/focus, and Tab', () => {
    const { find, focus, key, active, outside, run, isOpen } = setup();
    find('File').click(); find('Edit').click(); expect(isOpen('File')).toBe(false); expect(isOpen('Edit')).toBe(true);
    focus('Undo'); find('Undo').click(); expect(run).toHaveBeenCalledWith('Undo'); expect(isOpen('Edit')).toBe(false); expect(active()).toBe('Edit');
    find('File').click(); outside.dispatchEvent(new Event('pointerdown', { bubbles: true })); expect(isOpen('File')).toBe(false);
    find('File').click(); outside.focus(); expect(isOpen('File')).toBe(false);
    find('File').click(); focus('New'); key('Tab'); expect(isOpen('File')).toBe(false); expect(active()).toBe('File');
    find('File').click(); focus('Find'); find('Find').click(); expect(document.activeElement).toBe(outside);
  });
  it('dismisses before a synchronous command disables itself', () => {
    const { find, focus, isOpen } = setup();
    const action = find('New') as HTMLButtonElement;
    action.addEventListener('click', () => { action.disabled = true; });
    find('File').click(); focus('New'); action.click();
    expect(isOpen('File')).toBe(false); expect(document.activeElement).toBe(find('File'));
  });
  it('rerenders closed and removes document listeners on disposal', () => {
    const { host, menus, fixture, find, isOpen, outside } = setup();
    find('File').click(); menus.render(fixture); expect(isOpen('File')).toBe(false);
    find('File').click(); menus.dispose(); expect(isOpen('File')).toBe(false);
    const first = host.firstElementChild as HTMLDetailsElement; first.open = true;
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true })); expect(first.open).toBe(true);
    menus.render([]); expect(host.children.length).toBe(3);
  });
});
