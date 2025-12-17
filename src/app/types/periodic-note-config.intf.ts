/**
 * Configuration for a single periodic note type
 */
export interface PeriodicNoteConfig {
    enabled: boolean
    folder: string
    format: string // moment.js format, e.g., "YYYY/WW/YYYY-MM-DD"
    template: string // vault path to Templater template
}
