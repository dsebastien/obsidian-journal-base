import type { PeriodType } from '../../types'
import type { SelectionContext } from './selection-context'
import {
    getYear,
    getStartOfPeriod,
    getEndOfPeriod,
    getNextPeriod,
    generateDateRange,
    doesPeriodOverlapParent
} from '../../../utils/date-utils'

/**
 * Generate periods for a given period type within the current selection context.
 * Uses visibleTypes (columns actually shown) instead of just enabled types.
 * When a parent column is hidden, child columns expand their range to show more periods.
 */
export function generatePeriodsForContext(
    periodType: PeriodType,
    context: SelectionContext,
    visibleTypes: PeriodType[]
): Date[] {
    switch (periodType) {
        case 'yearly':
            return generateYearlyPeriods()
        case 'quarterly':
            return generateQuarterlyPeriods(context, visibleTypes)
        case 'monthly':
            return generateMonthlyPeriods(context, visibleTypes)
        case 'weekly':
            return generateWeeklyPeriods(context, visibleTypes)
        case 'daily':
            return generateDailyPeriods(context, visibleTypes)
    }
}

function generateYearlyPeriods(): Date[] {
    const currentYear = getYear(new Date())
    const dates: Date[] = []
    for (let y = currentYear - 5; y <= currentYear; y++) {
        dates.push(new Date(y, 0, 1))
    }
    return dates
}

function generateQuarterlyPeriods(context: SelectionContext, visibleTypes: PeriodType[]): Date[] {
    const yearlyVisible = visibleTypes.includes('yearly')
    const dates: Date[] = []

    if (yearlyVisible) {
        // Yearly column is visible - filter by selected year
        for (let q = 1; q <= 4; q++) {
            const month = (q - 1) * 3
            dates.push(new Date(context.selectedYear, month, 1))
        }
    } else {
        // Yearly column is hidden - show quarters across multiple years
        const currentYear = getYear(new Date())
        for (let y = currentYear - 5; y <= currentYear; y++) {
            for (let q = 1; q <= 4; q++) {
                const month = (q - 1) * 3
                dates.push(new Date(y, month, 1))
            }
        }
    }
    return dates
}

function generateMonthlyPeriods(context: SelectionContext, visibleTypes: PeriodType[]): Date[] {
    const yearlyVisible = visibleTypes.includes('yearly')
    const quarterlyVisible = visibleTypes.includes('quarterly')
    const dates: Date[] = []

    // If quarterly column is visible and a quarter is selected, filter by that quarter
    // The quarter selection implicitly determines the year
    if (quarterlyVisible && context.selectedQuarter !== null) {
        const startMonth = (context.selectedQuarter - 1) * 3
        for (let m = startMonth; m < startMonth + 3; m++) {
            dates.push(new Date(context.selectedYear, m, 1))
        }
    } else if (yearlyVisible) {
        // Yearly column is visible but no quarter selected - show all months of selected year
        for (let m = 0; m < 12; m++) {
            dates.push(new Date(context.selectedYear, m, 1))
        }
    } else {
        // Neither yearly nor quarterly column visible - show months for last 2 years
        const currentYear = getYear(new Date())
        for (let y = currentYear - 1; y <= currentYear; y++) {
            for (let m = 0; m < 12; m++) {
                dates.push(new Date(y, m, 1))
            }
        }
    }
    return dates
}

function generateWeeklyPeriods(context: SelectionContext, visibleTypes: PeriodType[]): Date[] {
    const yearlyVisible = visibleTypes.includes('yearly')
    const quarterlyVisible = visibleTypes.includes('quarterly')
    const monthlyVisible = visibleTypes.includes('monthly')

    let startDate: Date
    let endDate: Date

    // Find the most specific visible parent with a selection
    // When parent columns are hidden, weekly expands its range
    if (monthlyVisible && context.selectedMonth !== null) {
        // Month is selected - show weeks of that month
        startDate = new Date(context.selectedYear, context.selectedMonth, 1)
        endDate = getEndOfPeriod(startDate, 'monthly')
    } else if (quarterlyVisible && context.selectedQuarter !== null) {
        // Quarter is selected - show weeks of that quarter
        const quarterMonth = (context.selectedQuarter - 1) * 3
        startDate = new Date(context.selectedYear, quarterMonth, 1)
        endDate = getEndOfPeriod(startDate, 'quarterly')
    } else if (yearlyVisible) {
        // Only year column is visible - show weeks of that year
        startDate = new Date(context.selectedYear, 0, 1)
        endDate = new Date(context.selectedYear, 11, 31)
    } else {
        // No parent column visible - show weeks for last 3 months
        const currentYear = getYear(new Date())
        endDate = new Date()
        startDate = new Date(currentYear, new Date().getMonth() - 2, 1)
    }

    const dates: Date[] = []
    let current = getStartOfPeriod(startDate, 'weekly')

    while (current.getTime() <= endDate.getTime()) {
        // Use overlap check so weeks spanning month/year boundaries appear in both periods
        // e.g., 2025-W01 (Dec 30 - Jan 5) appears in both December 2024 and January 2025
        if (doesPeriodOverlapParent(current, 'weekly', startDate, endDate)) {
            dates.push(current)
        }
        current = getNextPeriod(current, 'weekly')
    }
    return dates
}

function generateDailyPeriods(context: SelectionContext, visibleTypes: PeriodType[]): Date[] {
    const yearlyVisible = visibleTypes.includes('yearly')
    const quarterlyVisible = visibleTypes.includes('quarterly')
    const monthlyVisible = visibleTypes.includes('monthly')
    const weeklyVisible = visibleTypes.includes('weekly')

    let startDate: Date
    let endDate: Date

    // Find the most specific visible parent with a selection
    // When parent columns are hidden, child columns expand their range
    if (weeklyVisible && context.selectedWeek !== null && context.selectedWeekYear !== null) {
        // Week is selected - show days of that week (7 days)
        // Calculate Monday of the ISO week
        const jan4 = new Date(context.selectedWeekYear, 0, 4)
        const jan4Day = jan4.getDay() || 7
        const mondayOfWeek1 = new Date(jan4)
        mondayOfWeek1.setDate(jan4.getDate() - jan4Day + 1)
        startDate = new Date(mondayOfWeek1)
        startDate.setDate(mondayOfWeek1.getDate() + (context.selectedWeek - 1) * 7)
        endDate = new Date(startDate)
        endDate.setDate(startDate.getDate() + 6)
    } else if (monthlyVisible && context.selectedMonth !== null) {
        // Month is selected - show days of that month
        startDate = new Date(context.selectedYear, context.selectedMonth, 1)
        endDate = getEndOfPeriod(startDate, 'monthly')
    } else if (quarterlyVisible && context.selectedQuarter !== null) {
        // Quarter is selected - show days of that quarter
        const quarterMonth = (context.selectedQuarter - 1) * 3
        startDate = new Date(context.selectedYear, quarterMonth, 1)
        endDate = getEndOfPeriod(startDate, 'quarterly')
    } else if (yearlyVisible) {
        // Only year is visible - show ALL days of that year
        // (Virtual scrolling handles the 365 items efficiently)
        startDate = new Date(context.selectedYear, 0, 1)
        endDate = new Date(context.selectedYear, 11, 31)
    } else {
        // No parent visible - show days for last 2 weeks
        endDate = new Date()
        startDate = new Date()
        startDate.setDate(startDate.getDate() - 14)
    }

    return generateDateRange(startDate, endDate, 'daily')
}
