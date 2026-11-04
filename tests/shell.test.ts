// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { catalog } from '../src/commands/registry';
import { PREFS_KEY, QAT_EXTRAS, QAT_STANDARD } from '../src/prefs';
import { mountShell } from '../src/ui/shell';

afterEach(() => { document.body.replaceChildren(); window.localStorage.clear(); });

function mount() {
  const root = document.createElement('div');
  document.body.append(root);
  mountShell(root);
  return root;
}
function findButton(root: HTMLElement, text: string) {
  const found = [...root.querySelectorAll('button')].find(button => button.textContent === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

describe('application shell', () => {
  it('searches and keeps unimplemented commands disabled', () => {
    const root = mount();
    const search = root.querySelector<HTMLInputElement>('input[type=search]')!;
    search.value = 'file.newFromTemplate';
    search.dispatchEvent(new Event('input'));
    expect(root.querySelector('.results')?.textContent).toContain('New from Template');
    for (const button of root.querySelectorAll<HTMLButtonElement>('.results button[aria-label^="Run"]')) {
      expect(button.disabled).toBe(true);
    }
    const searchButton = [...root.querySelectorAll<HTMLButtonElement>('.pins button')].find(button => button.textContent === catalog.commands['view.cmdSearch'].label)!;
    searchButton.click();
    expect(document.activeElement).toBe(search);
  });

  it('persists pins, restores them, adds all choices and clears them', () => {
    let root = mount();
    findButton(root, 'Pin').click();
    const saved = JSON.parse(window.localStorage.getItem(PREFS_KEY)!);
    expect(saved.qat).toContain('file.new');
    mountShell(root);
    expect(root.querySelector('.pins')?.textContent).toContain('New Blank Database');
    findButton(root, catalog.commands['view.qatAddAll'].label).click();
    expect(root.querySelectorAll('.pin')).toHaveLength(new Set([...QAT_STANDARD, ...QAT_EXTRAS]).size);
    findButton(root, 'Clear pins').click();
    expect(root.querySelectorAll('.pin')).toHaveLength(0);
    root = mount();
    expect(root.querySelectorAll('.pin')).toHaveLength(0);
  });

  it('renders all planned menu layouts and ribbon tabs without missing IDs', () => {
    const root = mount();
    const menus = root.querySelector('select')!;
    for (const option of menus.options) {
      menus.value = option.value;
      menus.dispatchEvent(new Event('change'));
      expect(root.querySelectorAll('.classic-menus > details').length).toBeGreaterThan(0);
    }
    for (const tab of root.querySelectorAll<HTMLButtonElement>('[role=tab]')) {
      tab.click();
      expect(tab.getAttribute('aria-selected')).toBe('true');
      expect(root.querySelectorAll('.ribbon-groups section').length).toBeGreaterThan(0);
    }
  });

  it('opens File backstage, switches pages and returns with Escape', () => {
    const root = mount();
    const file = root.querySelector<HTMLButtonElement>('.file-tab')!;
    file.click();
    const backstage = root.querySelector<HTMLElement>('.backstage')!;
    expect(backstage.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('.workspace')!.hidden).toBe(true);
    expect(backstage.textContent).toContain('Welcome to Anne’s Base');
    expect(backstage.textContent).toContain('No recent databases');
    for (const button of backstage.querySelectorAll<HTMLButtonElement>('.backstage-nav button:not(.backstage-back)')) {
      button.click();
      expect(button.getAttribute('aria-current')).toBe('page');
      for (const action of backstage.querySelectorAll<HTMLButtonElement>('.file-actions button')) {
        expect(action.disabled).toBe(!['file.new', 'file.open', 'file.openReadOnly'].includes(action.dataset.command!));
      }
    }
    backstage.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(backstage.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('.workspace')!.hidden).toBe(false);
    expect(document.activeElement).toBe(file);
    expect(file.getAttribute('aria-expanded')).toBe('false');
  });

  it('supports ribbon arrow keys and returning from File options to command search', () => {
    const root = mount();
    const home = root.querySelector<HTMLButtonElement>('[role=tab][aria-selected=true]')!;
    expect(home.textContent).toBe('Home');
    home.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement?.textContent).toBe('Create');
    expect(document.activeElement?.getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector('[role=tabpanel]')?.getAttribute('aria-labelledby')).toBe(document.activeElement?.id);
    findButton(root, 'File').click();
    findButton(root, 'Options').click();
    findButton(root, 'Customize Quick Access').click();
    expect(root.querySelector<HTMLElement>('.backstage')!.hidden).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('input[type=search]'));
    expect(root.querySelector<HTMLDetailsElement>('.classic-options')!.open).toBe(false);
  });

  it('keeps controls working and explains when preferences cannot be saved', () => {
    const root = document.createElement('div');
    document.body.append(root);
    mountShell(root, {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    findButton(root, 'Pin').click();
    expect(root.querySelector('.pins')?.textContent).toContain('New Blank Database');
    expect(root.querySelector('.status')?.textContent).toContain('browser storage is unavailable');
  });
});
