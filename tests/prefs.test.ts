import { describe, expect, it } from 'vitest';
import { createRegistry } from '../src/commands/registry';
import { addAllQatChoices, defaultPreferences, loadPreferences, normalizePreferences, QAT_EXTRAS, QAT_STANDARD, savePreferences } from '../src/prefs';

describe('preferences', () => {
  const registry = createRegistry();
  it('filters stale IDs, invalid values and duplicates', () => {
    expect(normalizePreferences({ version: 1, qat: ['file.new', 'missing', 5, 'file.new'], menuLayout: '__proto__' }, registry))
      .toEqual({ version: 1, qat: ['file.new'], menuLayout: 'access2003' });
    expect(normalizePreferences({ version: 99 }, registry)).toEqual(defaultPreferences());
    expect(normalizePreferences(null, registry)).toEqual(defaultPreferences());
  });
  it('handles malformed JSON and unavailable storage', () => {
    expect(loadPreferences({ getItem: () => '{', setItem: () => {} }, registry)).toEqual(defaultPreferences());
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    expect(loadPreferences(blocked, registry)).toEqual(defaultPreferences());
    expect(savePreferences(blocked, defaultPreferences())).toBe(false);
  });
  it('puts Save and Print first, sorts choices and keeps other existing pins', () => {
    const prefs = { ...defaultPreferences(), qat: ['file.open', 'file.new', 'ai.diagnose'] };
    const all = addAllQatChoices(prefs, registry);
    expect(all.qat.slice(0, 2)).toEqual(['file.save', 'file.print']);
    expect(new Set(all.qat)).toEqual(new Set([...QAT_STANDARD, ...QAT_EXTRAS, ...prefs.qat]));
    expect(all.qat.at(-1)).toBe('ai.diagnose');
    const labels = all.qat.slice(2, -1).map(id => registry.get(id)!.label.toLocaleLowerCase('en-US'));
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'en-US')));
    expect(addAllQatChoices(all, registry)).toEqual(all);
    expect(prefs.qat).toEqual(['file.open', 'file.new', 'ai.diagnose']);
  });
});
