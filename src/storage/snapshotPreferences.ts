import type { PreferenceStorage } from '../prefs';
export const SNAPSHOT_SETTINGS_KEY = 'annesbase.snapshots.settings.v1';
export interface SnapshotSettings { version: 1; enabled: boolean; keep: number }
export const defaultSnapshotSettings = (): SnapshotSettings => ({ version: 1, enabled: false, keep: 5 });
export function loadSnapshotSettings(storage?: PreferenceStorage): SnapshotSettings {
  try {
    const value = JSON.parse(storage?.getItem(SNAPSHOT_SETTINGS_KEY) ?? 'null');
    if (value?.version !== 1 || typeof value.enabled !== 'boolean' || !Number.isInteger(value.keep) || value.keep < 1 || value.keep > 20) return defaultSnapshotSettings();
    return { version: 1, enabled: value.enabled, keep: value.keep };
  } catch { return defaultSnapshotSettings(); }
}
export function saveSnapshotSettings(storage: PreferenceStorage | undefined, settings: SnapshotSettings): boolean {
  try { if (!storage) return false; storage.setItem(SNAPSHOT_SETTINGS_KEY, JSON.stringify(settings)); return true; } catch { return false; }
}
