export interface MenuItem { submenu: string; items: (string | MenuItem)[] }
interface Menu { name: string; items: (string | MenuItem)[] }

/** Native disclosure/button semantics, with desktop-style navigation layered on top. */
export function mountClassicMenus(host: HTMLElement, commandButton: (id: string) => HTMLButtonElement) {
  let disposed = false, prefix = '', lastTyped = 0;
  const document = host.ownerDocument;
  const summary = (details: HTMLDetailsElement) => details.querySelector<HTMLElement>(':scope > summary')!;
  const topMenus = () => [...host.children] as HTMLDetailsElement[];
  const closeBranch = (details: HTMLDetailsElement) => {
    for (const child of details.querySelectorAll<HTMLDetailsElement>('details')) child.open = false;
    details.open = false;
  };
  function close() { topMenus().forEach(closeBranch); prefix = ''; }
  function open(details: HTMLDetailsElement) {
    for (const sibling of details.parentElement!.children) {
      if (sibling !== details && sibling instanceof HTMLDetailsElement) closeBranch(sibling);
    }
    details.open = true;
  }
  const items = (container: Element) => [...container.querySelectorAll<HTMLElement>(':scope > button:not(:disabled), :scope > details > summary')];
  const first = (details: HTMLDetailsElement, last = false) => {
    const choices = items(details.querySelector(':scope > div')!);
    (last ? choices.at(-1) : choices[0])?.focus();
  };
  function topOf(target: Element): HTMLDetailsElement {
    let details = target.closest('details')!;
    while (details.parentElement !== host) details = details.parentElement!.closest('details')!;
    return details;
  }
  function switchTop(top: HTMLDetailsElement, delta: number, enter: boolean) {
    const menus = topMenus(); const next = menus[(menus.indexOf(top) + delta + menus.length) % menus.length];
    const wasOpen = top.open; close(); summary(next).focus();
    if (enter || wasOpen) { open(next); if (enter) first(next); }
  }
  function click(event: MouseEvent) {
    if (disposed || !(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLElement>('summary, button');
    if (!target || !host.contains(target)) return;
    if (target.tagName === 'SUMMARY') {
      event.preventDefault(); const details = target.parentElement as HTMLDetailsElement;
      if (details.open) closeBranch(details); else open(details);
    } else if (!(target as HTMLButtonElement).disabled) {
      // Dismiss before handlers can disable/re-render the command. Any focus
      // explicitly moved by the command then takes precedence over the heading.
      const top = topOf(target); close();
      if (document.activeElement === target) summary(top).focus();
    }
  }
  function keydown(event: KeyboardEvent) {
    if (disposed || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || !(event.target instanceof HTMLElement)) return;
    const target = event.target;
    if (event.key.length !== 1 || event.key === ' ') prefix = '';
    if (!target.matches('summary, button')) return;
    const top = topOf(target); const onBar = target === summary(top);
    const level = onBar ? host : target.tagName === 'SUMMARY' ? target.parentElement!.parentElement! : target.parentElement!;
    const choices = onBar ? topMenus().map(summary) : items(level);
    const index = choices.indexOf(target);
    const focus = (delta: number) => choices[(index + delta + choices.length) % choices.length]?.focus();
    if (event.key === 'Tab') { close(); summary(top).focus(); return; }
    if (event.key === 'Escape') {
      if (target.tagName === 'SUMMARY' && (target.parentElement as HTMLDetailsElement).open) { closeBranch(target.parentElement as HTMLDetailsElement); target.focus(); }
      else if (onBar) { close(); target.focus(); }
      else { const parent = level.parentElement as HTMLDetailsElement; closeBranch(parent); summary(parent).focus(); }
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (onBar) { open(top); first(top, event.key === 'ArrowUp'); }
      else focus(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Home') choices[0]?.focus();
    else if (event.key === 'End') choices.at(-1)?.focus();
    else if (event.key === 'ArrowRight') {
      if (!onBar && target.tagName === 'SUMMARY') { const nested = target.parentElement as HTMLDetailsElement; open(nested); first(nested); }
      else switchTop(top, 1, !onBar);
    } else if (event.key === 'ArrowLeft') {
      if (!onBar && target.tagName === 'SUMMARY' && (target.parentElement as HTMLDetailsElement).open) { closeBranch(target.parentElement as HTMLDetailsElement); target.focus(); }
      else if (!onBar && level.parentElement !== top) { const parent = level.parentElement as HTMLDetailsElement; closeBranch(parent); summary(parent).focus(); }
      else switchTop(top, -1, !onBar);
    } else if (event.key.length === 1 && event.key !== ' ') {
      const now = Date.now(); prefix = now - lastTyped < 700 ? prefix + event.key.toLocaleLowerCase() : event.key.toLocaleLowerCase(); lastTyped = now;
      const query = [...prefix].every(letter => letter === prefix[0]) ? prefix[0] : prefix;
      const ordered = [...choices.slice(index + 1), ...choices.slice(0, index + 1)];
      ordered.find(item => item.textContent?.trim().toLocaleLowerCase().startsWith(query))?.focus();
    } else return; // Enter/Space retain native summary/button activation.
    event.preventDefault();
  }
  const outside = (event: Event) => { if (event.target instanceof Node && !host.contains(event.target)) close(); };
  host.addEventListener('click', click, true);
  host.addEventListener('keydown', keydown);
  document.addEventListener('pointerdown', outside);
  document.addEventListener('focusin', outside);
  function append(parent: HTMLElement, entries: (string | MenuItem)[]) {
    for (const entry of entries) {
      if (typeof entry === 'string') parent.append(entry === '---' ? document.createElement('hr') : commandButton(entry));
      else {
        const details = document.createElement('details'); const title = document.createElement('summary'); title.textContent = entry.submenu;
        const children = document.createElement('div'); children.className = 'submenu-items'; append(children, entry.items);
        details.append(title, children); parent.append(details);
      }
    }
  }
  return {
    render: (menus: Menu[]) => {
      if (disposed) return;
      close(); host.replaceChildren();
      for (const menu of menus) {
        const details = document.createElement('details'); const title = document.createElement('summary'); title.textContent = menu.name;
        const children = document.createElement('div'); children.className = 'menu-items'; append(children, menu.items);
        details.append(title, children); host.append(details);
      }
    },
    close,
    dispose: () => {
      disposed = true; close(); host.removeEventListener('click', click, true); host.removeEventListener('keydown', keydown);
      document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside);
    },
  };
}
