import {
    parse,
    format,
    isValid,
    addDays,
    addWeeks,
    addMonths,
    addQuarters,
    addYears,
    isBefore,
    isEqual,
    startOfDay,
    startOfWeek,
    startOfMonth,
    startOfQuarter,
    startOfYear,
    getQuarter as dateFnsGetQuarter,
    getWeek as dateFnsGetWeek,
    getYear as dateFnsGetYear,
    getMonth as dateFnsGetMonth
} from 'date-fns'
import type { PeriodType } from '../app/types/periodic-note.types'

/**
 * Parse a date string using a format pattern
 * Note: date-fns uses different format tokens than moment.js
 * Common conversions:
 *   moment.js → date-fns
 *   YYYY → yyyy
 *   MM → MM
 *   DD → dd
 *   gggg → yyyy (ISO week year - handled specially)
 *   ww → ww (ISO week)
 *   [Q] → 'Q' (literal Q)
 *   Q → Q (quarter)
 */
export function parseDateFromFormat(filename: string, formatStr: string): Date | null {
    // Convert moment.js format to date-fns format
    const dateFnsFormat = convertMomentToDateFns(formatStr)

    try {
        const parsed = parse(filename, dateFnsFormat, new Date())
        return isValid(parsed) ? parsed : null
    } catch {
        return null
    }
}

/**
 * Format a date using a format pattern
 */
export function formatDate(date: Date, formatStr: string): string {
    const dateFnsFormat = convertMomentToDateFns(formatStr)
    return format(date, dateFnsFormat)
}

/**
 * Convert moment.js format string to date-fns format string
 */
export function convertMomentToDateFns(momentFormat: string): string {
    return momentFormat
        .replace(/YYYY/g, 'yyyy') // Year
        .replace(/YY/g, 'yy') // 2-digit year
        .replace(/gggg/g, 'yyyy') // ISO week year (approximate)
        .replace(/DD/g, 'dd') // Day of month
        .replace(/D/g, 'd') // Day of month (no padding)
        .replace(/\[([^\]]+)\]/g, "'$1'") // Escape literals [W] → 'W'
        .replace(/ww/g, 'ww') // Week number (same)
        .replace(/w/g, 'w') // Week number (no padding)
}

/**
 * Get the next period after the given date
 */
export function getNextPeriod(date: Date, periodType: PeriodType): Date {
    switch (periodType) {
        case 'daily':
            return addDays(date, 1)
        case 'weekly':
            return addWeeks(date, 1)
        case 'monthly':
            return addMonths(date, 1)
        case 'quarterly':
            return addQuarters(date, 1)
        case 'yearly':
            return addYears(date, 1)
    }
}

/**
 * Get the previous period before the given date
 */
export function getPreviousPeriod(date: Date, periodType: PeriodType): Date {
    switch (periodType) {
        case 'daily':
            return addDays(date, -1)
        case 'weekly':
            return addWeeks(date, -1)
        case 'monthly':
            return addMonths(date, -1)
        case 'quarterly':
            return addQuarters(date, -1)
        case 'yearly':
            return addYears(date, -1)
    }
}

/**
 * Get the start of a period for a given date
 */
export function getStartOfPeriod(date: Date, periodType: PeriodType): Date {
    switch (periodType) {
        case 'daily':
            return startOfDay(date)
        case 'weekly':
            return startOfWeek(date, { weekStartsOn: 1 }) // Monday start
        case 'monthly':
            return startOfMonth(date)
        case 'quarterly':
            return startOfQuarter(date)
        case 'yearly':
            return startOfYear(date)
    }
}

/**
 * Generate an array of dates between start and end (inclusive)
 */
export function generateDateRange(start: Date, end: Date, periodType: PeriodType): Date[] {
    const dates: Date[] = []
    let current = getStartOfPeriod(start, periodType)
    const endNormalized = getStartOfPeriod(end, periodType)

    while (isBefore(current, endNormalized) || isEqual(current, endNormalized)) {
        dates.push(current)
        current = getNextPeriod(current, periodType)
    }

    return dates
}

/**
 * Find missing dates in a range
 * Returns dates that are not present in the existingDates array
 */
export function findMissingDates(
    existingDates: Date[],
    periodType: PeriodType,
    futureCount: number = 0
): Date[] {
    if (existingDates.length === 0) {
        // If no existing dates, generate future dates from today
        const today = getStartOfPeriod(new Date(), periodType)
        const missing: Date[] = []
        let current = today
        for (let i = 0; i < futureCount; i++) {
            missing.push(current)
            current = getNextPeriod(current, periodType)
        }
        return missing
    }

    // Normalize and sort existing dates
    const normalizedExisting = existingDates
        .map((d) => getStartOfPeriod(d, periodType).getTime())
        .sort((a, b) => a - b)

    const existingSet = new Set(normalizedExisting)

    // Find min and max dates
    const minDate = new Date(normalizedExisting[0]!)
    const maxExisting = new Date(normalizedExisting[normalizedExisting.length - 1]!)

    // Calculate end date including future periods
    let maxDate = maxExisting
    for (let i = 0; i < futureCount; i++) {
        maxDate = getNextPeriod(maxDate, periodType)
    }

    // Generate full range and find missing
    const fullRange = generateDateRange(minDate, maxDate, periodType)
    const missing = fullRange.filter((d) => !existingSet.has(d.getTime()))

    return missing
}

/**
 * Get future periods from today
 */
export function getFuturePeriods(periodType: PeriodType, count: number): Date[] {
    const dates: Date[] = []
    let current = getStartOfPeriod(new Date(), periodType)

    for (let i = 0; i < count; i++) {
        current = getNextPeriod(current, periodType)
        dates.push(current)
    }

    return dates
}

/**
 * Compare two dates for the same period
 */
export function isSamePeriod(date1: Date, date2: Date, periodType: PeriodType): boolean {
    const start1 = getStartOfPeriod(date1, periodType)
    const start2 = getStartOfPeriod(date2, periodType)
    return isEqual(start1, start2)
}

/**
 * Get a human-readable label for a period
 */
export function getPeriodLabel(date: Date, periodType: PeriodType): string {
    switch (periodType) {
        case 'daily':
            return format(date, 'EEEE, MMMM d, yyyy')
        case 'weekly':
            return `Week ${dateFnsGetWeek(date)}, ${dateFnsGetYear(date)}`
        case 'monthly':
            return format(date, 'MMMM yyyy')
        case 'quarterly':
            return `Q${dateFnsGetQuarter(date)} ${dateFnsGetYear(date)}`
        case 'yearly':
            return format(date, 'yyyy')
    }
}

/**
 * Sort dates in descending order (newest first)
 */
export function sortDatesDescending(dates: Date[]): Date[] {
    return [...dates].sort((a, b) => b.getTime() - a.getTime())
}

/**
 * Sort dates in ascending order (oldest first)
 */
export function sortDatesAscending(dates: Date[]): Date[] {
    return [...dates].sort((a, b) => a.getTime() - b.getTime())
}

/**
 * Get the year from a date
 */
export function getYear(date: Date): number {
    return dateFnsGetYear(date)
}

/**
 * Get the ISO week number from a date
 */
export function getWeek(date: Date): number {
    return dateFnsGetWeek(date)
}

/**
 * Get the month (0-11) from a date
 */
export function getMonth(date: Date): number {
    return dateFnsGetMonth(date)
}

/**
 * Get the quarter (1-4) from a date
 */
export function getQuarter(date: Date): number {
    return dateFnsGetQuarter(date)
}
