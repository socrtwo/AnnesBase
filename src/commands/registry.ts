import plan from '../../docs/commands-plan.json';

export interface Command {
  readonly id: string;
  readonly label: string;
  readonly tab: string;
  readonly group: string;
  readonly notes: string;
  readonly shortcuts: readonly string[];
  readonly origins: readonly string[];
  readonly notInTabs: boolean;
}

export type CommandResult =
  | { status: 'executed' }
  | { status: 'unavailable' | 'unknown'; id: string };

export class CommandRegistry {
  private readonly definitions = new Map<string, Command>();
  private readonly handlers = new Map<string, { run: () => void; enabled: () => boolean }>();

  constructor(commands: readonly Command[]) {
    for (const command of commands) {
      if (this.definitions.has(command.id)) throw new Error(`Duplicate command: ${command.id}`);
      this.definitions.set(command.id, Object.freeze({
        ...command,
        shortcuts: Object.freeze([...command.shortcuts]),
        origins: Object.freeze([...command.origins]),
      }));
    }
  }

  get(id: string): Command | undefined { return this.definitions.get(id); }
  all(): readonly Command[] { return [...this.definitions.values()]; }
  isAvailable(id: string): boolean { return this.handlers.get(id)?.enabled() ?? false; }

  bind(id: string, handler: () => void, enabled: () => boolean = () => true): void {
    if (!this.definitions.has(id)) throw new Error(`Unknown command: ${id}`);
    if (this.handlers.has(id)) throw new Error(`Handler already registered: ${id}`);
    this.handlers.set(id, { run: handler, enabled });
  }

  execute(id: string): CommandResult {
    if (!this.definitions.has(id)) return { status: 'unknown', id };
    const handler = this.handlers.get(id);
    if (!handler || !handler.enabled()) return { status: 'unavailable', id };
    handler.run();
    return { status: 'executed' };
  }

  search(query: string): readonly Command[] {
    const words = query.trim().toLocaleLowerCase('en-US').split(/\s+/).filter(Boolean);
    return this.all().filter(command => {
      const text = `${command.label} ${command.id} ${command.tab} ${command.group} ${command.notes}`.toLocaleLowerCase('en-US');
      return words.every(word => text.includes(word));
    });
  }
}

// Metadata declares planned commands. Only an explicitly bound handler enables execution.
export const createRegistry = (): CommandRegistry => new CommandRegistry(Object.values(plan.commands));
export const catalog = plan;
