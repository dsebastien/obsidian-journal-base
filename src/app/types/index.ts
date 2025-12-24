// Barrel file for types

// Types
export type { PeriodType } from './period-type.type'
export { PERIOD_TYPES } from './period-type.type'

export type { PeriodicNoteConfig } from './periodic-note-config.intf'

export type { PeriodicNotesSettings } from './periodic-notes-settings.type'

export type { PluginSettings } from './plugin-settings.type'
export { DEFAULT_SETTINGS, DEFAULT_DONE_PROPERTY_NAME } from './plugin-settings.type'

export type { AppWithPlugins } from './app-with-plugins.intf'

export type { LifeTrackerPluginFileProvider } from './life-tracker-plugin-file-provider.intf'

// Zod schemas and derived types
export { periodicNotesPluginSettingsSchema } from './periodic-notes-plugin-settings.schema'
export type {
    PeriodicNotesPeriodSettings,
    PeriodicNotesPluginSettings
} from './periodic-notes-plugin-settings.schema'
