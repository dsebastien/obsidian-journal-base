import type { PeriodType } from '../../types'
import type { SelectionContext } from './selection-context'
import {
    getYear,
    getStartOfPeriod,
    getEndOfPeriod,
    getNextPeriod,
    generateDateRange,
    isPeriodStartWithinParent
} from '../../../utils/date-utils'

/**
 * Generate periods for a given period type within the current selection context.
 */
export function generatePeriodsForContext(
    periodType: PeriodType,
    context: SelectionContext
): Date[] {
    switch (periodType) {
        case 'yearly':
            return generateYearlyPeriods()
        case 'quarterly':
            return generateQuarterlyPeriods(context.selectedYear)
        case 'monthly':
            return generateMonthlyPeriods(context.selectedYear, context.selectedQuarter)
        case 'weekly':
            return generateWeeklyPeriods(
                context.selectedYear,
                context.selectedQuarter,
                context.selectedMonth
            )
        case 'daily':
            return generateDailyPeriods(
                context.selectedYear,
                context.selectedQuarter,
                context.selectedMonth,
                context.selectedWeek,
                context.selectedWeekYear
            )
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

function generateQuarterlyPeriods(selectedYear: number): Date[] {
    const dates: Date[] = []
    for (let q = 1; q <= 4; q++) {
        const month = (q - 1) * 3
        dates.push(new Date(selectedYear, month, 1))
    }
    return dates
}

function generateMonthlyPeriods(selectedYear: number, selectedQuarter: number | null): Date[] {
    const dates: Date[] = []
    if (selectedQuarter !== null) {
        // 3 months of the selected quarter
        const startMonth = (selectedQuarter - 1) * 3
        for (let m = startMonth; m < startMonth + 3; m++) {
            dates.push(new Date(selectedYear, m, 1))
        }
    } else {
        // All 12 months of the selected year
        for (let m = 0; m < 12; m++) {
            dates.push(new Date(selectedYear, m, 1))
        }
    }
    return dates
}

function generateWeeklyPeriods(
    selectedYear: number,
    selectedQuarter: number | null,
    selectedMonth: number | null
): Date[] {
    let startDate: Date
    let endDate: Date

    if (selectedMonth !== null) {
        startDate = new Date(selectedYear, selectedMonth, 1)
        endDate = getEndOfPeriod(startDate, 'monthly')
    } else if (selectedQuarter !== null) {
        const quarterMonth = (selectedQuarter - 1) * 3
        startDate = new Date(selectedYear, quarterMonth, 1)
        endDate = getEndOfPeriod(startDate, 'quarterly')
    } else {
        startDate = new Date(selectedYear, 0, 1)
        endDate = new Date(selectedYear, 11, 31)
    }

    const dates: Date[] = []
    let current = getStartOfPeriod(startDate, 'weekly')

    while (current.getTime() <= endDate.getTime()) {
        if (isPeriodStartWithinParent(current, 'weekly', startDate, endDate)) {
            dates.push(current)
        }
        current = getNextPeriod(current, 'weekly')
    }
    return dates
}

function generateDailyPeriods(
    selectedYear: number,
    selectedQuarter: number | null,
    selectedMonth: number | null,
    selectedWeek: number | null,
    selectedWeekYear: number | null
): Date[] {
    let startDate: Date
    let endDate: Date

    if (selectedWeek !== null && selectedWeekYear !== null) {
        // Days within the selected week (7 days)
        // Calculate Monday of the ISO week
        const jan4 = new Date(selectedWeekYear, 0, 4)
        const jan4Day = jan4.getDay() || 7
        const mondayOfWeek1 = new Date(jan4)
        mondayOfWeek1.setDate(jan4.getDate() - jan4Day + 1)
        startDate = new Date(mondayOfWeek1)
        startDate.setDate(mondayOfWeek1.getDate() + (selectedWeek - 1) * 7)
        endDate = new Date(startDate)
        endDate.setDate(startDate.getDate() + 6)
    } else if (selectedMonth !== null) {
        startDate = new Date(selectedYear, selectedMonth, 1)
        endDate = getEndOfPeriod(startDate, 'monthly')
    } else if (selectedQuarter !== null) {
        const quarterMonth = (selectedQuarter - 1) * 3
        startDate = new Date(selectedYear, quarterMonth, 1)
        endDate = getEndOfPeriod(startDate, 'quarterly')
    } else {
        // Limit to first month to avoid 365 items
        startDate = new Date(selectedYear, 0, 1)
        endDate = getEndOfPeriod(startDate, 'monthly')
    }

    return generateDateRange(startDate, endDate, 'daily')
}
