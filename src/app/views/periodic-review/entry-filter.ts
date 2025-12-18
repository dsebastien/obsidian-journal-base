import type { BasesEntry } from 'obsidian'
import type { PeriodType, PeriodicNoteConfig } from '../../types'
import type { SelectionContext } from './selection-context'
import { extractDateFromNote } from '../../../utils/periodic-note-utils'
import {
    getYear,
    getMonth,
    getQuarter,
    getWeek,
    getISOWeekYear,
    getEndOfPeriod,
    isPeriodStartWithinParent
} from '../../../utils/date-utils'

/**
 * Filter entries based on the current selection context.
 */
export function filterEntriesByContext(
    entries: BasesEntry[],
    periodType: PeriodType,
    config: PeriodicNoteConfig,
    context: SelectionContext
): BasesEntry[] {
    return entries.filter((entry) => {
        const date = extractDateFromNote(entry.file, config)
        if (!date) return false

        return isEntryInContext(date, periodType, context)
    })
}

/**
 * Check if a date falls within the current selection context for a period type.
 */
function isEntryInContext(date: Date, periodType: PeriodType, context: SelectionContext): boolean {
    const year = getYear(date)

    switch (periodType) {
        case 'yearly':
            // Years are not filtered by context
            return true

        case 'quarterly':
            // Quarters filtered by year only
            return year === context.selectedYear

        case 'monthly':
            // Months filtered by year and optionally quarter
            if (year !== context.selectedYear) return false
            if (context.selectedQuarter !== null) {
                return getQuarter(date) === context.selectedQuarter
            }
            return true

        case 'weekly':
            return isWeekInContext(date, year, context)

        case 'daily':
            return isDayInContext(date, year, context)
    }
}

/**
 * Check if a week falls within the current context.
 */
function isWeekInContext(date: Date, year: number, context: SelectionContext): boolean {
    if (year !== context.selectedYear) return false

    if (context.selectedMonth !== null) {
        // Week START must be within selected month
        const monthStart = new Date(context.selectedYear, context.selectedMonth, 1)
        const monthEnd = getEndOfPeriod(monthStart, 'monthly')
        return isPeriodStartWithinParent(date, 'weekly', monthStart, monthEnd)
    }

    if (context.selectedQuarter !== null) {
        // Week START must be within selected quarter
        const quarterMonth = (context.selectedQuarter - 1) * 3
        const quarterStart = new Date(context.selectedYear, quarterMonth, 1)
        const quarterEnd = getEndOfPeriod(quarterStart, 'quarterly')
        return isPeriodStartWithinParent(date, 'weekly', quarterStart, quarterEnd)
    }

    return true
}

/**
 * Check if a day falls within the current context.
 */
function isDayInContext(date: Date, year: number, context: SelectionContext): boolean {
    // If week is selected, filter by ISO week year and week number
    // This handles year boundaries correctly (e.g., 2025-12-31 in week 1 of 2026)
    if (context.selectedWeek !== null && context.selectedWeekYear !== null) {
        return (
            getWeek(date) === context.selectedWeek &&
            getISOWeekYear(date) === context.selectedWeekYear
        )
    }

    // For non-week filtering, use calendar year
    if (year !== context.selectedYear) return false

    // If month is selected, filter by month
    if (context.selectedMonth !== null) {
        return getMonth(date) === context.selectedMonth
    }

    // If quarter is selected, filter by quarter
    if (context.selectedQuarter !== null) {
        return getQuarter(date) === context.selectedQuarter
    }

    return true
}
