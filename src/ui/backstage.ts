export const FILE_PAGES = [
  { title: 'Home', description: 'Your databases, together.', commands: [] },
  { title: 'New', description: 'Start with a blank database or a template.', commands: ['file.new', 'file.newFromTemplate', 'file.newFromSheet'] },
  { title: 'Open', description: 'Browse your device or return to a recent database.', commands: ['file.open', 'file.openReadOnly', 'file.openRecent'] },
  { title: 'Info', description: 'Manage database properties, protection and backups.', commands: ['file.properties', 'file.backup', 'file.encrypt'] },
  { title: 'Save', description: 'Download a separate copy. This preview does not overwrite the original file.', commands: ['file.save', 'file.saveAs', 'file.saveDatabaseAs'] },
  { title: 'Print', description: 'Preview and print tables, forms and reports.', commands: ['file.print', 'file.printPreview', 'file.pageSetup'] },
  { title: 'Share', description: 'Send a database or publish it for others.', commands: ['file.share', 'file.email', 'file.publishServer'] },
  { title: 'Export', description: 'Take your work into another format.', commands: ['file.exportPdf', 'file.exportSqlScript', 'file.exportTextFolder'] },
  { title: 'Close', description: 'Close the current database.', commands: ['file.closeDatabase'] },
  { title: 'Options', description: 'Make Anne’s Base work your way.', commands: [] },
] as const;

export function createBackstage(
  commandButton: (id: string) => HTMLButtonElement,
  onClose: () => void,
  onCustomize: () => void,
): { element: HTMLElement; open: () => void } {
  const backstage = document.createElement('section');
  backstage.className = 'backstage';
  backstage.hidden = true;
  backstage.setAttribute('aria-label', 'File');
  const sidebar = document.createElement('nav');
  sidebar.className = 'backstage-nav';
  sidebar.setAttribute('aria-label', 'File navigation');
  const back = document.createElement('button');
  back.className = 'backstage-back';
  back.textContent = '← Back';
  back.setAttribute('aria-label', 'Back to database workspace');
  back.addEventListener('click', onClose);
  sidebar.append(back);
  const content = document.createElement('div');
  content.className = 'backstage-content';
  const buttons: HTMLButtonElement[] = [];
  const heading = (parent: HTMLElement, title: string, body: string) => {
    const h2 = document.createElement('h2');
    h2.textContent = title;
    h2.tabIndex = -1;
    const p = document.createElement('p');
    p.textContent = body;
    parent.append(h2, p);
    return h2;
  };
  const render = (page: typeof FILE_PAGES[number], focus = false) => {
    content.replaceChildren();
    buttons.forEach(button => {
      if (button.textContent === page.title) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const title = heading(content, page.title === 'Home' ? 'Welcome to Anne’s Base' : page.title, page.description);
    const notice = document.createElement('p');
    notice.className = 'preview-notice';
    notice.textContent = 'Database preview · New, Open and downloading a copy are available. Editing and recovery are still in development.';
    content.append(notice);
    if (page.title === 'Home') {
      const actions = document.createElement('div');
      actions.className = 'file-actions';
      actions.append(commandButton('file.new'), commandButton('file.open'));
      const recent = document.createElement('section');
      recent.className = 'file-empty';
      heading(recent, 'Recent databases', 'No recent databases yet. Use Open to browse a SQLite file from your device.');
      content.append(actions, recent);
    } else if (page.title === 'Options') {
      const customize = document.createElement('button');
      customize.textContent = 'Customize Quick Access';
      customize.addEventListener('click', onCustomize);
      content.append(customize);
      const explanation = document.createElement('p');
      explanation.textContent = 'Pin commands from Command search. Use Classic menus below the ribbon to choose a historic layout. Pins and layout selection are saved in this browser when storage is available.';
      content.append(explanation);
    } else {
      const actions = document.createElement('div');
      actions.className = 'file-actions';
      for (const id of page.commands) actions.append(commandButton(id));
      content.append(actions);
      if (page.title === 'Print') {
        const preview = document.createElement('div');
        preview.className = 'print-placeholder';
        preview.textContent = 'Open a database to preview tables and reports.';
        content.append(preview);
      }
    }
    if (focus) title.focus();
  };
  for (const page of FILE_PAGES) {
    const button = document.createElement('button');
    button.textContent = page.title;
    button.addEventListener('click', () => render(page, true));
    buttons.push(button);
    sidebar.append(button);
  }
  backstage.append(sidebar, content);
  backstage.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
  });
  render(FILE_PAGES[0]);
  return {
    element: backstage,
    open: () => { backstage.hidden = false; render(FILE_PAGES[0]); back.focus(); },
  };
}
