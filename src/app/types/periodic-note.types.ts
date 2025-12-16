/**
 * Types for periodic notes functionality
 */

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface PeriodicNoteConfig {
    enabled: boolean
    folder: string
    format: string // moment.js format, e.g., "YYYY/WW/YYYY-MM-DD"
    template: string // vault path to Templater template
}

export type PeriodicNotesSettings = Record<PeriodType, PeriodicNoteConfig>
