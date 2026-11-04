import { describe, expect, it, vi } from 'vitest';
import { catalog, CommandRegistry, createRegistry } from '../src/commands/registry';

describe('command catalog', () => {
  it('preserves the planned metadata and IDs in the runtime registry', () => {
    const registry = createRegistry();
    expect(registry.all()).toEqual(Object.values(catalog.commands));
    for (const [id, command] of Object.entries(catalog.commands)) {
      expect(registry.get(id)?.id).toBe(id);
      expect(registry.isAvailable(id)).toBe(false);
      expect(registry.execute(id)).toEqual({ status: 'unavailable', id });
      expect(registry.get(id)).toEqual(command);
    }
  });

  it('rejects duplicate commands and unknown or duplicate handlers', () => {
    const command = createRegistry().all()[0];
    expect(() => new CommandRegistry([command, command])).toThrow('Duplicate command');
    const registry = createRegistry();
    expect(() => registry.bind('missing.command', () => {})).toThrow('Unknown command');
    registry.bind(command.id, () => {});
    expect(() => registry.bind(command.id, () => {})).toThrow('already registered');
  });

  it('executes only bound handlers and reports unknown IDs separately', () => {
    const registry = createRegistry();
    const handler = vi.fn();
    registry.bind('view.cmdSearch', handler);
    expect(registry.execute('view.cmdSearch')).toEqual({ status: 'executed' });
    expect(handler).toHaveBeenCalledOnce();
    expect(registry.execute('file.new').status).toBe('unavailable');
    expect(registry.execute('missing.command').status).toBe('unknown');
  });

  it('finds commands by ID, label, context and multiple words', () => {
    const registry = createRegistry();
    expect(registry.search(' FILE.NEW ').some(command => command.id === 'file.new')).toBe(true);
    expect(registry.search('blank database').some(command => command.id === 'file.new')).toBe(true);
    expect(registry.search('no-such-command-123')).toEqual([]);
    expect(registry.search('')).toHaveLength(Object.keys(catalog.commands).length);
  });

  it('checks current context before reporting availability or executing', () => {
    const registry = createRegistry();
    const handler = vi.fn();
    let open = false;
    registry.bind('file.save', handler, () => open);
    expect(registry.isAvailable('file.save')).toBe(false);
    expect(registry.execute('file.save').status).toBe('unavailable');
    expect(handler).not.toHaveBeenCalled();
    open = true;
    expect(registry.isAvailable('file.save')).toBe(true);
    expect(registry.execute('file.save').status).toBe('executed');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('resolves every menu, nested menu, ribbon and Home-tab command', () => {
    const registry = createRegistry();
    function visit(items: (string | { submenu: string; items: unknown[] })[]) {
      for (const item of items) {
        if (typeof item === 'string') {
          if (item !== '---') expect(registry.get(item), item).toBeDefined();
        } else visit(item.items as Parameters<typeof visit>[0]);
      }
    }
    for (const layout of Object.values(catalog.menuLayouts)) {
      for (const menu of layout.menus) visit(menu.items);
    }
    for (const tab of catalog.tabs) for (const group of tab.groups) visit(group.commands);
    for (const group of catalog.homeTab) visit(group.commands);
  });
});
