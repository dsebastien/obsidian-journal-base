import type { PeriodicNotesSettings } from './periodic-note.types'

// Using type alias instead of empty interface to satisfy linter
export type PluginSettings = PeriodicNotesSettings

export const DEFAULT_SETTINGS: PluginSettings = {
    daily: { enabled: false, folder: '', format: 'YYYY-MM-DD', template: '' },
    weekly: { enabled: false, folder: '', format: 'gggg-[W]ww', template: '' },
    monthly: { enabled: false, folder: '', format: 'YYYY-MM', template: '' },
    quarterly: { enabled: false, folder: '', format: 'YYYY-[Q]Q', template: '' },
    yearly: { enabled: false, folder: '', format: 'YYYY', template: '' }
}
