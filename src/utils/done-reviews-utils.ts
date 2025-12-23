import type { DoneReviews } from '../app/types/done-reviews.type'
import type { PeriodType, PluginSettings } from '../app/types'
import { PERIOD_TYPES } from '../app/types'
import {
    formatDateAsFilename,
    getStartOfPeriod,
    getEndOfPeriod,
    generateDateRange
} from './date-utils'

/**
 * Get the period identifier (formatted date string) for a given date and period type.
 * Uses the format setting from plugin settings.
 */
export function getPeriodIdentifier(
    date: Date,
    periodType: PeriodType,
    settings: PluginSettings
): string {
    const config = settings[periodType]
    return formatDateAsFilename(date, config.format)
}

/**
 * Get all child period types for a given period type.
 * Returns types in order from largest to smallest.
 */
function getChildPeriodTypes(periodType: PeriodType): PeriodType[] {
    const typeIndex = PERIOD_TYPES.indexOf(periodType)
    // PERIOD_TYPES is ordered: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']
    // We want children (smaller periods), which come earlier in the array
    return PERIOD_TYPES.slice(0, typeIndex)
}

/**
 * Generate all period identifiers for child periods within a parent period.
 * For example, if marking 2024 yearly as done, returns all quarterly, monthly, weekly, daily
 * identifiers that fall within 2024.
 */
export function getChildPeriodIdentifiers(
    date: Date,
    parentType: PeriodType,
    settings: PluginSettings
): Map<PeriodType, string[]> {
    const result = new Map<PeriodType, string[]>()
    const childTypes = getChildPeriodTypes(parentType)

    if (childTypes.length === 0) {
        return result
    }

    const parentStart = getStartOfPeriod(date, parentType)
    const parentEnd = getEndOfPeriod(date, parentType)

    for (const childType of childTypes) {
        const config = settings[childType]
        if (!config.enabled) continue

        const childPeriods = generateDateRange(parentStart, parentEnd, childType)
        const identifiers = childPeriods.map((d) => formatDateAsFilename(d, config.format))
        result.set(childType, identifiers)
    }

    return result
}

/**
 * Mark a period and all its child periods as done (or not done).
 * This is the cascade logic that runs when marking a parent period.
 *
 * @param doneReviews - Current done reviews state
 * @param date - The date of the period being marked
 * @param periodType - The type of period being marked
 * @param settings - Plugin settings (for format strings)
 * @param isDone - Whether to mark as done (true) or not done (false)
 * @returns Updated done reviews object
 */
export function markPeriodWithCascade(
    doneReviews: DoneReviews,
    date: Date,
    periodType: PeriodType,
    settings: PluginSettings,
    isDone: boolean
): DoneReviews {
    // Clone the done reviews to avoid mutation
    const updated: DoneReviews = {
        daily: { ...doneReviews.daily },
        weekly: { ...doneReviews.weekly },
        monthly: { ...doneReviews.monthly },
        quarterly: { ...doneReviews.quarterly },
        yearly: { ...doneReviews.yearly }
    }

    // Mark the parent period
    const parentConfig = settings[periodType]
    const parentId = formatDateAsFilename(date, parentConfig.format)
    if (isDone) {
        updated[periodType][parentId] = true
    } else {
        delete updated[periodType][parentId]
    }

    // Cascade to child periods
    const childIdentifiers = getChildPeriodIdentifiers(date, periodType, settings)
    for (const [childType, identifiers] of childIdentifiers) {
        for (const id of identifiers) {
            if (isDone) {
                updated[childType][id] = true
            } else {
                delete updated[childType][id]
            }
        }
    }

    return updated
}

/**
 * Check if a period is marked as done.
 */
export function isPeriodDone(
    doneReviews: DoneReviews,
    date: Date,
    periodType: PeriodType,
    settings: PluginSettings
): boolean {
    const config = settings[periodType]
    const id = formatDateAsFilename(date, config.format)
    return doneReviews[periodType][id] === true
}
