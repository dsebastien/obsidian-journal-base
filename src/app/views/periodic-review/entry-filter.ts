import type { BasesEntry } from 'obsidian'
import type { PeriodType, PeriodicNoteConfig } from '../../types'
import type { SelectionContext } from './selection-context'
import type { PeriodCache } from './period-cache'
import { extractDateFromNote } from '../../../utils/periodic-note-utils'
import {
    getYear,
    getMonth,
    getQuarter,
    getWeek,
    getISOWeekYear,
    getEndOfPeriod,
    doesPeriodOverlapParent
} from '../../../utils/date-utils'

/**
 * Filter entries based on the current selection context.
 * Only filters by visible parent period types - hidden columns are ignored.
 * This allows child columns to expand their range when parent columns are hidden.
 *
 * @param visibleTypes - Period types that have visible columns in the view
 * @param cache - Optional PeriodCache for date extraction caching (significantly improves performance)
 */
export function filterEntriesByContext(
    entries: BasesEntry[],
    periodType: PeriodType,
    config: PeriodicNoteConfig,
    context: SelectionContext,
    visibleTypes: PeriodType[],
    cache?: PeriodCache
): BasesEntry[] {
    return entries.filter((entry) => {
        // Use cache for date extraction if available (major performance gain)
        const date = cache
            ? cache.extractDate(entry.file, config)
            : extractDateFromNote(entry.file, config)
        if (!date) return false

        return isEntryInContext(date, periodType, context, visibleTypes)
    })
}

/**
 * Check if a date falls within the current selection context for a period type.
 * Only applies filters for visible parent period types (columns shown in the view).
 */
function isEntryInContext(
    date: Date,
    periodType: PeriodType,
    context: SelectionContext,
    visibleTypes: PeriodType[]
): boolean {
    const yearlyVisible = visibleTypes.includes('yearly')
    const quarterlyVisible = visibleTypes.includes('quarterly')
    const year = getYear(date)

    switch (periodType) {
        case 'yearly':
            // Years are not filtered by context
            return true

        case 'quarterly':
            // Quarters filtered by year only if yearly column is visible
            if (yearlyVisible) {
                return year === context.selectedYear
            }
            return true

        case 'monthly':
            // Filter by visible parents with selections
            if (quarterlyVisible && context.selectedQuarter !== null) {
                // Quarter is selected - filter by quarter (which includes year check)
                return year === context.selectedYear && getQuarter(date) === context.selectedQuarter
            }
            if (yearlyVisible) {
                return year === context.selectedYear
            }
            return true

        case 'weekly':
            return isWeekInContext(date, year, context, visibleTypes)

        case 'daily':
            return isDayInContext(date, year, context, visibleTypes)
    }
}

/**
 * Check if a week falls within the current context.
 * Only applies filters for visible parent period types (columns shown in the view).
 * Uses overlap logic so weeks spanning boundaries appear in both periods.
 */
function isWeekInContext(
    date: Date,
    _year: number,
    context: SelectionContext,
    visibleTypes: PeriodType[]
): boolean {
    const yearlyVisible = visibleTypes.includes('yearly')
    const quarterlyVisible = visibleTypes.includes('quarterly')
    const monthlyVisible = visibleTypes.includes('monthly')

    // Find the most specific visible parent with a selection
    if (monthlyVisible && context.selectedMonth !== null) {
        // Week must OVERLAP with selected month (not just start within it)
        // e.g., 2025-W01 (Dec 30 - Jan 5) should appear in both Dec 2024 and Jan 2025
        const monthStart = new Date(context.selectedYear, context.selectedMonth, 1)
        const monthEnd = getEndOfPeriod(monthStart, 'monthly')
        return doesPeriodOverlapParent(date, 'weekly', monthStart, monthEnd)
    }

    if (quarterlyVisible && context.selectedQuarter !== null) {
        // Week must OVERLAP with selected quarter
        const quarterMonth = (context.selectedQuarter - 1) * 3
        const quarterStart = new Date(context.selectedYear, quarterMonth, 1)
        const quarterEnd = getEndOfPeriod(quarterStart, 'quarterly')
        return doesPeriodOverlapParent(date, 'weekly', quarterStart, quarterEnd)
    }

    if (yearlyVisible) {
        // For yearly, also use overlap to handle year-boundary weeks
        const yearStart = new Date(context.selectedYear, 0, 1)
        const yearEnd = new Date(context.selectedYear, 11, 31)
        return doesPeriodOverlapParent(date, 'weekly', yearStart, yearEnd)
    }

    return true
}

/**
 * Check if a day falls within the current context.
 * Only applies filters for visible parent period types (columns shown in the view).
 */
function isDayInContext(
    date: Date,
    year: number,
    context: SelectionContext,
    visibleTypes: PeriodType[]
): boolean {
    const yearlyVisible = visibleTypes.includes('yearly')
    const quarterlyVisible = visibleTypes.includes('quarterly')
    const monthlyVisible = visibleTypes.includes('monthly')
    const weeklyVisible = visibleTypes.includes('weekly')

    // Find the most specific visible parent with a selection
    if (weeklyVisible && context.selectedWeek !== null && context.selectedWeekYear !== null) {
        // Filter by ISO week year and week number
        // This handles year boundaries correctly (e.g., 2025-12-31 in week 1 of 2026)
        return (
            getWeek(date) === context.selectedWeek &&
            getISOWeekYear(date) === context.selectedWeekYear
        )
    }

    if (monthlyVisible && context.selectedMonth !== null) {
        return year === context.selectedYear && getMonth(date) === context.selectedMonth
    }

    if (quarterlyVisible && context.selectedQuarter !== null) {
        return year === context.selectedYear && getQuarter(date) === context.selectedQuarter
    }

    if (yearlyVisible) {
        return year === context.selectedYear
    }

    return true
}
