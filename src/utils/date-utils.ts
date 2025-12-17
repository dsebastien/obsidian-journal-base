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
 * Moment.js and date-fns use different format tokens
 * Reference: https://momentjs.com/docs/#/displaying/format/
 * Reference: https://github.com/date-fns/date-fns/issues/2991
 */
export function convertMomentToDateFns(momentFormat: string): string {
    // First, escape literal text in brackets [text] → 'text'
    // Must be done first before other replacements
    let result = momentFormat.replace(/\[([^\]]+)\]/g, "'$1'")

    // Day of week tokens (lowercase d in moment = day of week)
    // Must be done BEFORE day of month (D) conversion to avoid conflicts
    // Using 'eeee' format (stand-alone) as recommended by date-fns community
    result = result.replace(/dddd/g, 'eeee') // Full day name (e.g., "Monday")
    result = result.replace(/ddd/g, 'eee') // Short day name (e.g., "Mon")
    // Only replace standalone dd (day of week), not after D
    result = result.replace(/(?<!D)dd(?!d)/g, 'eeeeee') // Min day name (2-letter, e.g., "Mo")

    // Year tokens (must process longer tokens first)
    result = result.replace(/YYYY/g, 'yyyy') // 4-digit year
    result = result.replace(/YY/g, 'yy') // 2-digit year
    result = result.replace(/Y/g, 'y') // Year with any number of digits

    // ISO week-numbering year
    // GGGG/GG in moment = ISO week year = RRRR/RR in date-fns
    result = result.replace(/GGGG/g, 'RRRR') // ISO week year, 4-digit
    result = result.replace(/GG/g, 'RR') // ISO week year, 2-digit
    // gggg/gg in moment = locale week year (we treat as ISO for simplicity)
    result = result.replace(/gggg/g, 'RRRR') // Week year, 4-digit
    result = result.replace(/gg/g, 'RR') // Week year, 2-digit

    // ISO week number (WW, W in moment = II, I in date-fns)
    result = result.replace(/WW/g, 'II') // ISO week, 2-digit
    result = result.replace(/Wo/g, 'Io') // ISO week with ordinal
    result = result.replace(/(?<!'[^']*)\bW\b(?![^']*')/g, 'I') // ISO week, single digit (not in quotes)

    // Local week number (ww, w in moment)
    // When used with ISO week year (RRRR), use ISO week (II)
    if (result.includes('RRRR') || result.includes('RR')) {
        result = result.replace(/ww/g, 'II') // ISO week, 2-digit
        result = result.replace(/wo/g, 'Io') // ISO week with ordinal
        result = result.replace(/(?<!'[^']*)\bw\b(?![^']*')/g, 'I') // ISO week, single digit
    }
    // If no ISO week year context, ww stays as ww (local week in date-fns)

    // Day of year and day of month tokens
    // Use placeholders to avoid cascading replacements
    // Process in order: DDDD, DDDo, DDD, DD, Do, D
    result = result.replace(/DDDD/g, '##DOY3##') // Day of year, 3-digit padded → placeholder
    result = result.replace(/DDDo/g, '##DOYo##') // Day of year with ordinal → placeholder
    result = result.replace(/DDD/g, '##DOY##') // Day of year → placeholder
    result = result.replace(/DD/g, 'dd') // Day of month, 2-digit
    result = result.replace(/Do/g, 'do') // Day of month with ordinal
    result = result.replace(/(?<!'[^']*)\bD\b(?![^']*')/g, 'd') // Day of month (not in quotes)

    // Replace placeholders with date-fns tokens
    result = result.replace(/##DOY3##/g, 'DDD') // Day of year, 3-digit padded
    result = result.replace(/##DOYo##/g, 'Do') // Day of year with ordinal
    result = result.replace(/##DOY##/g, 'D') // Day of year

    // Month tokens (MM, MMM, MMMM are the same in both)
    // Mo (month with ordinal) is the same in both
    // M is the same in both

    // Quarter tokens (Q is the same in both)
    // Qo (quarter with ordinal) is the same in both

    // Hour tokens (mostly the same)
    // HH, H, hh, h, kk, k are the same in both

    // Minute tokens (mm, m are the same in both)

    // Second tokens (ss, s are the same in both)

    // Fractional seconds (S, SS, SSS are the same in both)

    // AM/PM tokens
    result = result.replace(/(?<!'[^']*)\bA\b(?![^']*')/g, 'a') // AM/PM uppercase → a in date-fns

    // Timezone tokens
    result = result.replace(/ZZ/g, 'xx') // +0000 format
    result = result.replace(/(?<!'[^']*)\bZ\b(?![^']*')/g, 'xxx') // +00:00 format

    // Unix timestamps
    result = result.replace(/(?<!'[^']*)\bX\b(?![^']*')/g, 't') // Unix seconds
    result = result.replace(/(?<!'[^']*)\bx\b(?![^']*')/g, 'T') // Unix milliseconds

    // Day of week (numeric)
    result = result.replace(/(?<!'[^']*)\be\b(?![^']*')/g, 'c') // Day of week (0-6) locale
    result = result.replace(/(?<!'[^']*)\bE\b(?![^']*')/g, 'i') // ISO day of week (1-7)

    return result
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
