import { catalog, createRegistry } from '../commands/registry';
import { addAllQatChoices, defaultPreferences, loadPreferences, savePreferences, type PreferenceStorage } from '../prefs';
import { createBackstage } from './backstage';
import { mountDatabasePane } from './databasePane';

import { mountClassicMenus } from './classicMenus';

const mountedShells = new WeakMap<HTMLElement, () => void>();

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountShell(root: HTMLElement, storage?: PreferenceStorage): { dispose: () => void } {
  mountedShells.get(root)?.();
  const registry = createRegistry();
  // Access to localStorage itself can throw in private/restricted browser contexts.
  try { storage ??= window.localStorage; } catch { /* Session-only preferences below. */ }
  let prefs = storage ? loadPreferences(storage, registry) : defaultPreferences();
  root.replaceChildren();
  const header = element('header');
  const brand = element('div');
  brand.className = 'brand';
  brand.append(element('small', "ANNE'S OFFICE"), element('h1', "Anne's Base"));
  header.append(brand, element('span', 'Early preview'));
  const intro = element('section');
  intro.className = 'intro';
  intro.append(element('h2', 'A place for your data.'), element('p',
    'Create tables and edit records in a native database, with change history and undo. Open other SQLite files read-only.'));

  const status = element('p', 'No database is open.');
  status.className = 'status';
  status.setAttribute('role', 'status');
  const persist = () => {
    if (!storage || !savePreferences(storage, prefs)) status.textContent = 'Preferences apply for this session; browser storage is unavailable.';
  };

  const qat = element('section');
  qat.className = 'qat';
  qat.setAttribute('aria-label', 'Quick Access Bar');
  const pins = element('div');
  pins.className = 'pins';
  const search = element('input');
  search.type = 'search';
  search.id = 'command-search';
  search.placeholder = 'Find a command, such as “repair” or “table”';
  const run = (id: string) => {
    const result = registry.execute(id);
    if (result.status !== 'executed') status.textContent = 'This command is planned and is not available yet.';
  };
  const commandButton = (id: string) => {
    const command = registry.get(id);
    if (!command) throw new Error(`Unknown catalog reference: ${id}`);
    const button = element('button', command.label);
    button.dataset.command = id;
    button.disabled = !registry.isAvailable(id);
    button.title = button.disabled ? `${command.label} — planned; not implemented yet` : command.label;
    button.addEventListener('click', () => run(id));
    return button;
  };
  const renderPins = () => {
    pins.replaceChildren();
    for (const id of prefs.qat) {
      const item = element('span');
      item.className = 'pin';
      const remove = element('button', '×');
      remove.setAttribute('aria-label', `Unpin ${registry.get(id)!.label}`);
      remove.addEventListener('click', () => {
        prefs.qat = prefs.qat.filter(value => value !== id);
        renderPins(); renderResults(); persist();
      });
      item.append(commandButton(id), remove);
      pins.append(item);
    }
  };
  registry.bind('view.cmdSearch', () => { search.focus(); search.scrollIntoView?.({ block: 'center' }); });
  registry.bind('view.qatAddAll', () => {
    prefs = addAllQatChoices(prefs, registry);
    renderPins(); renderResults();
    status.textContent = `All standard and extra choices are pinned (${prefs.qat.length} commands). Planned commands remain unavailable.`;
    persist();
  });
  const clear = element('button', 'Clear pins');
  clear.addEventListener('click', () => { prefs.qat = []; renderPins(); renderResults(); persist(); });
  qat.append(element('h2', 'Quick Access'), pins, commandButton('view.qatAddAll'), clear);

  const menus = element('nav');
  menus.className = 'classic-menus';
  menus.setAttribute('aria-label', 'Classic menus');
  const layoutLabel = element('label', 'Menu layout ');
  const layout = element('select');
  layout.setAttribute('aria-label', 'Menu layout');
  for (const [id, value] of Object.entries(catalog.menuLayouts)) {
    const option = element('option', value.name);
    option.value = id;
    layout.append(option);
  }
  layout.value = prefs.menuLayout;
  layoutLabel.append(layout);
  const classicMenus = mountClassicMenus(menus, commandButton);
  const renderMenus = () => {
    const selected = catalog.menuLayouts[prefs.menuLayout as keyof typeof catalog.menuLayouts];
    classicMenus.render(selected.menus);
  };
  layout.addEventListener('change', () => { prefs.menuLayout = layout.value; renderMenus(); persist(); });

  const ribbon = element('section');
  ribbon.className = 'ribbon';
  ribbon.setAttribute('aria-label', 'Ribbon');
  const workspace = element('div');
  workspace.className = 'workspace';
  const fileButton = element('button', 'File');
  fileButton.className = 'file-tab';
  fileButton.setAttribute('aria-expanded', 'false');
  fileButton.setAttribute('aria-controls', 'file-backstage');
  const backstage = createBackstage(commandButton, () => {
    backstage.element.hidden = true;
    workspace.hidden = false;
    fileButton.setAttribute('aria-expanded', 'false');
    fileButton.focus();
  }, () => {
    backstage.element.hidden = true;
    workspace.hidden = false;
    fileButton.setAttribute('aria-expanded', 'false');
    search.focus();
  });
  backstage.element.id = 'file-backstage';
  fileButton.addEventListener('click', () => {
    classicMenus.close();
    workspace.hidden = true;
    fileButton.setAttribute('aria-expanded', 'true');
    backstage.open();
  });
  const tabStrip = element('div');
  tabStrip.className = 'ribbon-tab-strip';
  const tabs = element('div');
  tabs.className = 'ribbon-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Ribbon tabs');
  let activeTab = 'Home';
  const tabButtons: HTMLButtonElement[] = [];
  const groups = element('div');
  groups.id = 'ribbon-panel';
  groups.className = 'ribbon-groups';
  groups.setAttribute('role', 'tabpanel');
  const renderRibbon = () => {
    groups.replaceChildren();
    for (const button of tabButtons) {
      const selected = button.textContent === activeTab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected) groups.setAttribute('aria-labelledby', button.id);
    }
    const selected = catalog.tabs.find(value => value.name === activeTab)!;
    const selectedGroups = activeTab === 'Home'
      ? catalog.homeTab.map(group => ({ name: group.group, commands: group.commands })) : selected.groups;
    for (const group of selectedGroups) {
      const section = element('section');
      const commands = element('div');
      commands.className = 'ribbon-commands';
      for (const id of group.commands) {
        if (!registry.get(id)!.notInTabs) commands.append(commandButton(id));
      }
      section.append(commands, element('h3', group.name));
      groups.append(section);
    }
  };
  for (const value of catalog.tabs.filter(tab => tab.name !== 'File')) {
    const button = element('button', value.name);
    button.id = `ribbon-tab-${value.prefix}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', groups.id);
    button.addEventListener('click', () => { activeTab = value.name; renderRibbon(); });
    button.addEventListener('keydown', event => {
      const index = tabButtons.indexOf(button);
      let next: number;
      if (event.key === 'ArrowRight') next = (index + 1) % tabButtons.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabButtons.length) % tabButtons.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabButtons.length - 1;
      else return;
      event.preventDefault();
      tabButtons[next].click();
      tabButtons[next].focus();
    });
    tabButtons.push(button);
    tabs.append(button);
  }
  tabStrip.append(fileButton, tabs);
  ribbon.append(tabStrip, groups);

  const main = element('main');
  const searchLabel = element('label', 'Command search');
  searchLabel.htmlFor = search.id;
  const count = element('p');
  count.setAttribute('role', 'status');
  const results = element('ul');
  results.className = 'results';
  function renderResults() {
    const matches = registry.search(search.value);
    count.textContent = `${matches.length} commands found · showing ${Math.min(60, matches.length)}. Search to narrow the list.`;
    results.replaceChildren();
    for (const command of matches.slice(0, 60)) {
      const row = element('li');
      const description = element('div');
      description.append(element('strong', command.label), element('small', `${command.tab} / ${command.group} · ${command.id}`));
      const state = element('span', registry.isAvailable(command.id) ? 'Available' : 'Planned');
      state.className = 'badge';
      const pin = element('button', prefs.qat.includes(command.id) ? 'Unpin' : 'Pin');
      pin.setAttribute('aria-label', `${prefs.qat.includes(command.id) ? 'Unpin' : 'Pin'} ${command.label}`);
      pin.addEventListener('click', () => {
        prefs.qat = prefs.qat.includes(command.id) ? prefs.qat.filter(id => id !== command.id) : [...prefs.qat, command.id];
        renderPins(); renderResults(); persist();
      });
      const execute = commandButton(command.id);
      execute.textContent = 'Run';
      execute.setAttribute('aria-label', `Run ${command.label}`);
      row.append(description, state, pin, execute);
      results.append(row);
    }
  }
  search.addEventListener('input', renderResults);
  main.append(searchLabel, search, count, results);
  const classic = element('details');
  classic.className = 'classic-options';
  const menuHelp = element('p', 'Use arrow keys to move through menus, Right to open submenus, Escape to go back, and type a command’s name to find it. Tab leaves the menu.');
  menuHelp.className = 'menu-help';
  classic.append(element('summary', 'Classic menus'), layoutLabel, menuHelp, menus);
  classic.addEventListener('toggle', () => { if (!classic.open) classicMenus.close(); });
  const chooseMenus = () => {
    backstage.element.hidden = true; workspace.hidden = false; fileButton.setAttribute('aria-expanded', 'false');
    classic.open = true; classicMenus.close(); layout.focus(); layout.scrollIntoView?.({ block: 'center' });
  };
  registry.bind('view.menus', chooseMenus);
  registry.bind('view.menuLayout', chooseMenus);
  const content = element('div');
  content.className = 'workspace-content';
  const databaseContainer = element('div');
  content.append(intro, databaseContainer, qat, main);
  workspace.append(ribbon, classic, content);
  root.append(header, workspace, backstage.element, status);
  const databasePane = mountDatabasePane(databaseContainer, registry, (name, busy) => {
    status.textContent = busy ? 'Loading SQLite…' : name ? `${name} · Database preview` : 'No database is open.';
    for (const button of root.querySelectorAll<HTMLButtonElement>('button[data-command]')) {
      const id = button.dataset.command!;
      button.disabled = !registry.isAvailable(id);
      button.title = button.disabled ? `${registry.get(id)!.label} — unavailable in the current context` : registry.get(id)!.label;
    }
    renderResults();
  }, () => {
    backstage.element.hidden = true;
    workspace.hidden = false;
    fileButton.setAttribute('aria-expanded', 'false');
    databaseContainer.scrollIntoView?.({ block: 'start' });
  });
  renderPins(); renderMenus(); renderRibbon(); renderResults();
  let disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true;
    classicMenus.dispose(); databasePane.dispose(); mountedShells.delete(root);
  };
  mountedShells.set(root, dispose);
  return { dispose };
}
