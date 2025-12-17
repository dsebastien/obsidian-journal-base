/**
 * Types for periodic notes functionality
 */

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export const PERIOD_TYPES: readonly PeriodType[] = [
    'daily',
    'weekly',
    'monthly',
    'quarterly',
    'yearly'
] as const

export interface PeriodicNoteConfig {
    enabled: boolean
    folder: string
    format: string // moment.js format, e.g., "YYYY/WW/YYYY-MM-DD"
    template: string // vault path to Templater template
}

export type PeriodicNotesSettings = Record<PeriodType, PeriodicNoteConfig>
