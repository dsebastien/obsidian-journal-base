import type { PluginSettings } from './plugin-settings.type'
import type { DoneReviews } from './done-reviews.type'

/**
 * Complete plugin data structure that is persisted to disk.
 * Includes both settings and runtime data like done reviews.
 */
export type PluginData = {
    settings: PluginSettings
    doneReviews: DoneReviews
}
