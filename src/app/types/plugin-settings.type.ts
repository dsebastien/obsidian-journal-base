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
}

export const DEFAULT_SETTINGS: PluginSettings = {
    daily: { enabled: false, folder: '', format: 'YYYY-MM-DD', template: '' },
    weekly: { enabled: false, folder: '', format: 'gggg-[W]ww', template: '' },
    monthly: { enabled: false, folder: '', format: 'YYYY-MM', template: '' },
    quarterly: { enabled: false, folder: '', format: 'YYYY-[Q]Q', template: '' },
    yearly: { enabled: false, folder: '', format: 'YYYY', template: '' },
    donePropertyName: DEFAULT_DONE_PROPERTY_NAME,
    collapseFrontmatter: true
}
