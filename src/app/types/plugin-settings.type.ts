import type { PeriodicNotesSettings } from './periodic-notes-settings.type'

/**
 * Default frontmatter property name for done status
 */
export const DEFAULT_DONE_PROPERTY_NAME = 'periodic_review_completed'

/**
 * Plugin settings type.
 * Extends PeriodicNotesSettings with plugin-specific configuration.
 */
export type PluginSettings = PeriodicNotesSettings & {
    /**
     * Frontmatter property name used to mark notes as done.
     * Default: 'periodic_review_completed'
     */
    donePropertyName: string

    /**
     * Collapse a note's YAML frontmatter when it opens in the Periodic Review view.
     * Default: true
     */
    collapseFrontmatter: boolean

    /**
     * Remember each Periodic Review column's collapsed/expanded state in the Base
     * view file, restoring it when the view reopens.
     * Default: true
     */
    rememberColumnState: boolean

    /**
     * Write verbose plugin output to the developer console, for troubleshooting.
     * Default: false
     */
    debugModeEnabled: boolean
}

export const DEFAULT_SETTINGS: PluginSettings = {
    daily: { enabled: false, folder: '', format: 'YYYY-MM-DD', template: '' },
    // ISO week tokens: GGGG is the year the week number belongs to, WW the ISO
    // week. The locale forms (gggg/ww) start the week on Sunday, so every Sunday
    // resolves to the following week, and pairing a calendar year with a week
    // number splits a week across two folders every New Year.
    weekly: { enabled: false, folder: '', format: 'GGGG-[W]WW', template: '' },
    monthly: { enabled: false, folder: '', format: 'YYYY-MM', template: '' },
    quarterly: { enabled: false, folder: '', format: 'YYYY-[Q]Q', template: '' },
    yearly: { enabled: false, folder: '', format: 'YYYY', template: '' },
    donePropertyName: DEFAULT_DONE_PROPERTY_NAME,
    collapseFrontmatter: true,
    rememberColumnState: true,
    debugModeEnabled: false
}
