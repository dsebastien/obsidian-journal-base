import type { ToggleOption, ViewOption } from 'obsidian'
import type { PluginSettings, PeriodType } from '../../types'

/**
 * Configuration for column visibility options.
 * Maps period types to their view option keys and default values.
 */
const COLUMN_OPTIONS: Record<PeriodType, { key: string; displayName: string; default: boolean }> = {
    daily: { key: 'showDaily', displayName: 'Show daily column', default: true },
    weekly: { key: 'showWeekly', displayName: 'Show weekly column', default: true },
    monthly: { key: 'showMonthly', displayName: 'Show monthly column', default: true },
    quarterly: { key: 'showQuarterly', displayName: 'Show quarterly column', default: false },
    yearly: { key: 'showYearly', displayName: 'Show yearly column', default: false }
}

/**
 * Option controlling whether a note's YAML frontmatter is collapsed when it
 * opens in a review column. Defaults to on so the note body is front and center
 * during reviews; toggle off in the view options to keep frontmatter expanded.
 */
export const COLLAPSE_FRONTMATTER_OPTION = {
    key: 'collapseFrontmatter',
    displayName: 'Collapse frontmatter',
    default: true
} as const

/**
 * Period types in display order (smallest to largest granularity).
 */
const PERIOD_TYPE_ORDER: readonly PeriodType[] = [
    'daily',
    'weekly',
    'monthly',
    'quarterly',
    'yearly'
] as const

/**
 * Creates a function that returns view options filtered by enabled period types.
 * Column visibility toggles are only shown for period types that are enabled in plugin settings.
 */
export function createPeriodicReviewViewOptions(
    getSettings: () => PluginSettings
): () => ViewOption[] {
    return (): ViewOption[] => {
        const settings = getSettings()
        const options: ViewOption[] = []

        // Add column visibility toggles only for enabled period types
        for (const periodType of PERIOD_TYPE_ORDER) {
            if (settings[periodType].enabled) {
                const config = COLUMN_OPTIONS[periodType]
                options.push({
                    type: 'toggle',
                    key: config.key,
                    displayName: config.displayName,
                    default: config.default
                } as ToggleOption)
            }
        }

        // Collapse the note's frontmatter when it opens in a column.
        options.push({
            type: 'toggle',
            key: COLLAPSE_FRONTMATTER_OPTION.key,
            displayName: COLLAPSE_FRONTMATTER_OPTION.displayName,
            default: COLLAPSE_FRONTMATTER_OPTION.default
        } as ToggleOption)

        return options
    }
}
