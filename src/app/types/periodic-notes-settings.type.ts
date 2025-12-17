import type { PeriodType } from './period-type.type'
import type { PeriodicNoteConfig } from './periodic-note-config.intf'

/**
 * Settings for all periodic note types
 */
export type PeriodicNotesSettings = Record<PeriodType, PeriodicNoteConfig>
