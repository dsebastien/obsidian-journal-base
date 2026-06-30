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
    endOfDay,
    endOfWeek,
    endOfMonth,
    endOfQuarter,
    endOfYear,
    getQuarter as dateFnsGetQuarter,
    getISOWeek as dateFnsGetISOWeek,
    getISOWeekYear as dateFnsGetISOWeekYear,
    getYear as dateFnsGetYear,
    getMonth as dateFnsGetMonth
} from 'date-fns'
import type { PeriodType } from '../app/types'

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
        if (isValid(parsed)) {
            return parsed
        }
    } catch {
        // date-fns parse throws (a RangeError) for token combinations it considers
        // contradictory even though moment.js accepts them — most notably a format
        // that carries redundant tokens for the same unit, e.g. month-number plus
        // month-name (`YYYY-MM-MMMM`). Fall through to the tolerant parser below.
    }

    // Tolerant fallback: extract the determinant date components directly from the
    // filename via a regex derived from the moment format. This sidesteps date-fns's
    // strict token-combination rules and only ever runs when the direct parse failed,
    // so it cannot regress the happy path. See issue #42.
    return parseDateFromFormatTolerant(filename, formatStr)
}

/**
 * Lowercased month name (full and abbreviated) → 0-based month index.
 * Built from date-fns so it follows the same locale as formatting.
 */
const MONTH_NAME_TO_INDEX: Map<string, number> = (() => {
    const map = new Map<string, number>()
    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
        const date = new Date(2000, monthIndex, 1)
        map.set(format(date, 'MMMM').toLowerCase(), monthIndex)
        map.set(format(date, 'MMM').toLowerCase(), monthIndex)
    }
    return map
})()

/**
 * Determinant date components extracted from a filename.
 * Only the fields needed to identify a periodic note's date are captured;
 * decorative tokens (weekday names, redundant month names) are ignored once a
 * more precise token has supplied the same unit.
 */
interface DateComponents {
    year?: number
    weekYear?: number
    monthIndex?: number
    day?: number
    week?: number
    quarter?: number
    dayOfYear?: number
}

const ESCAPE_REGEX_CHARS = /[.*+?^${}()|[\]\\]/g
function escapeRegex(text: string): string {
    return text.replace(ESCAPE_REGEX_CHARS, '\\$&')
}

const NAME_PATTERN = "[A-Za-z\\u00C0-\\u024F'.]+"

/**
 * Moment tokens we recognise, longest-first so a longer token is matched before
 * its own prefix (e.g. `MMMM` before `MM` before `M`). `capture` names the
 * `DateComponents` field the captured digits feed; `null` means the token is
 * decorative and consumed but discarded (weekday names).
 */
const TOKEN_TABLE: ReadonlyArray<{
    token: string
    pattern: string
    capture: keyof DateComponents | 'monthName' | null
}> = [
    { token: 'YYYY', pattern: '\\d{4}', capture: 'year' },
    { token: 'YY', pattern: '\\d{2}', capture: 'year' },
    { token: 'gggg', pattern: '\\d{4}', capture: 'weekYear' },
    { token: 'GGGG', pattern: '\\d{4}', capture: 'weekYear' },
    { token: 'gg', pattern: '\\d{2}', capture: 'weekYear' },
    { token: 'GG', pattern: '\\d{2}', capture: 'weekYear' },
    { token: 'MMMM', pattern: NAME_PATTERN, capture: 'monthName' },
    { token: 'MMM', pattern: NAME_PATTERN, capture: 'monthName' },
    { token: 'MM', pattern: '\\d{2}', capture: 'monthIndex' },
    { token: 'DDDD', pattern: '\\d{1,3}', capture: 'dayOfYear' },
    { token: 'DDD', pattern: '\\d{1,3}', capture: 'dayOfYear' },
    { token: 'DD', pattern: '\\d{2}', capture: 'day' },
    { token: 'dddd', pattern: NAME_PATTERN, capture: null },
    { token: 'ddd', pattern: NAME_PATTERN, capture: null },
    { token: 'dd', pattern: NAME_PATTERN, capture: null },
    { token: 'WW', pattern: '\\d{2}', capture: 'week' },
    { token: 'ww', pattern: '\\d{2}', capture: 'week' },
    { token: 'W', pattern: '\\d{1,2}', capture: 'week' },
    { token: 'w', pattern: '\\d{1,2}', capture: 'week' },
    { token: 'Q', pattern: '\\d', capture: 'quarter' },
    { token: 'M', pattern: '\\d{1,2}', capture: 'monthIndex' },
    { token: 'D', pattern: '\\d{1,2}', capture: 'day' }
]

/**
 * Tolerant reverse-parse: build a regex from the moment format and pull the
 * determinant numeric components straight out of the filename, then reconstruct
 * the date. Returns null when the filename doesn't match the format shape or the
 * captured components don't form a valid date.
 */
export function parseDateFromFormatTolerant(filename: string, formatStr: string): Date | null {
    let regexSource = '^'
    const captureOrder: Array<keyof DateComponents | 'monthName'> = []

    let index = 0
    while (index < formatStr.length) {
        // Bracketed literal: [text] → literal text
        if (formatStr[index] === '[') {
            const end = formatStr.indexOf(']', index)
            if (end !== -1) {
                regexSource += escapeRegex(formatStr.slice(index + 1, end))
                index = end + 1
                continue
            }
        }

        const rest = formatStr.slice(index)
        const entry = TOKEN_TABLE.find(({ token }) => rest.startsWith(token))
        if (entry) {
            if (entry.capture === null) {
                regexSource += `(?:${entry.pattern})`
            } else {
                regexSource += `(${entry.pattern})`
                captureOrder.push(entry.capture)
            }
            index += entry.token.length
            continue
        }

        // Any other character (separators like '-' '/' ' ') is a literal.
        regexSource += escapeRegex(formatStr[index] ?? '')
        index += 1
    }
    regexSource += '$'

    let match: RegExpExecArray | null
    try {
        match = new RegExp(regexSource).exec(filename)
    } catch {
        return null
    }
    if (!match) {
        return null
    }

    const components: DateComponents = {}
    captureOrder.forEach((field, position) => {
        const raw = match?.[position + 1]
        if (raw === undefined) {
            return
        }
        if (field === 'monthName') {
            // A precise numeric month wins over a decorative month name.
            if (components.monthIndex === undefined) {
                const resolved = MONTH_NAME_TO_INDEX.get(raw.toLowerCase())
                if (resolved !== undefined) {
                    components.monthIndex = resolved
                }
            }
            return
        }
        const value = Number.parseInt(raw, 10)
        if (Number.isNaN(value)) {
            return
        }
        if ((field === 'year' || field === 'weekYear') && raw.length === 2) {
            components[field] = 2000 + value
        } else if (field === 'monthIndex') {
            components.monthIndex = value - 1
        } else {
            components[field] = value
        }
    })

    return buildDateFromComponents(components)
}

function buildDateFromComponents(components: DateComponents): Date | null {
    const { year, weekYear, monthIndex, day, week, quarter, dayOfYear } = components

    // Full year-month-day (covers daily and any format with a concrete day).
    if (year !== undefined && monthIndex !== undefined && day !== undefined) {
        const date = new Date(year, monthIndex, day)
        // Reject out-of-range components: new Date silently rolls over (month 13 →
        // next January), which would misattribute a non-periodic file to a date.
        if (
            date.getFullYear() === year &&
            date.getMonth() === monthIndex &&
            date.getDate() === day
        ) {
            return date
        }
        return null
    }

    // ISO week (weekly notes). Reconstruct via date-fns to reuse its week math.
    if (week !== undefined && (weekYear !== undefined || year !== undefined)) {
        const isoYear = weekYear ?? year
        const date = parse(`${isoYear}-${String(week).padStart(2, '0')}`, 'RRRR-II', new Date())
        return isValid(date) ? date : null
    }

    // Quarter.
    if (year !== undefined && quarter !== undefined) {
        if (quarter < 1 || quarter > 4) {
            return null
        }
        const date = new Date(year, (quarter - 1) * 3, 1)
        return isValid(date) ? date : null
    }

    // Month (monthly notes, including month-name-only formats).
    if (year !== undefined && monthIndex !== undefined) {
        if (monthIndex < 0 || monthIndex > 11) {
            return null
        }
        const date = new Date(year, monthIndex, 1)
        return isValid(date) ? date : null
    }

    // Day of year.
    if (year !== undefined && dayOfYear !== undefined) {
        const date = new Date(year, 0, dayOfYear)
        return date.getFullYear() === year ? date : null
    }

    // Year only (yearly notes).
    if (year !== undefined) {
        const date = new Date(year, 0, 1)
        return isValid(date) ? date : null
    }

    return null
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
    // Must be done BEFORE day of month (D) conversion to avoid conflicts.
    // Use the formatting 'E' family, NOT the local 'e'/stand-alone 'c' family:
    // date-fns refuses to PARSE a format that mixes a calendar-year token (`yyyy`)
    // with a locale-week-dependent day token (`eeee`/`cccc`), throwing
    // "mustn't contain `yyyy` and `eeee` at the same time". `EEEE` carries no
    // week-year dependency, so it parses fine alongside `yyyy` and produces
    // identical output when formatting. See issue #42.
    result = result.replace(/dddd/g, 'EEEE') // Full day name (e.g., "Monday")
    result = result.replace(/ddd/g, 'EEE') // Short day name (e.g., "Mon")
    // Only replace standalone dd (day of week), not after D
    result = result.replace(/(?<!D)dd(?!d)/g, 'EEEEEE') // Min day name (2-letter, e.g., "Mo")

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
 * Compare two dates for the same period
 */
export function isSamePeriod(date1: Date, date2: Date, periodType: PeriodType): boolean {
    const start1 = getStartOfPeriod(date1, periodType)
    const start2 = getStartOfPeriod(date2, periodType)
    return isEqual(start1, start2)
}

/**
 * Check if a date falls within the current period (today, this week, this month, etc.)
 */
export function isCurrentPeriod(date: Date, periodType: PeriodType): boolean {
    return isSamePeriod(date, new Date(), periodType)
}

/**
 * Sort dates in descending order (newest first)
 */
export function sortDatesDescending(dates: Date[]): Date[] {
    return [...dates].sort((a, b) => b.getTime() - a.getTime())
}

/**
 * Get the year from a date
 */
export function getYear(date: Date): number {
    return dateFnsGetYear(date)
}

/**
 * Get the ISO week number from a date (1-53)
 * Uses ISO 8601 week definition (week starts Monday, first week contains Jan 4)
 */
export function getWeek(date: Date): number {
    return dateFnsGetISOWeek(date)
}

/**
 * Get the ISO week-numbering year from a date
 * This can differ from the calendar year at year boundaries.
 * For example, 2025-12-31 is in ISO week 1 of 2026.
 */
export function getISOWeekYear(date: Date): number {
    return dateFnsGetISOWeekYear(date)
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

/**
 * Format a date for display as a filename only (without folder structure).
 * Extracts the last segment from a formatted date string that may contain path separators.
 */
export function formatDateAsFilename(date: Date, formatStr: string): string {
    const formatted = formatDate(date, formatStr)
    // Extract only the filename portion (after the last /)
    const parts = formatted.split('/')
    return parts[parts.length - 1] ?? formatted
}

/**
 * Get a human-readable suffix for a period type.
 * - Daily: (Wednesday)
 * - Weekly: (Week 51)
 * - Monthly: (December)
 * - Quarterly: (Q4)
 * - Yearly: (empty string - year is self-explanatory)
 */
export function getPeriodSuffix(date: Date, periodType: PeriodType): string {
    switch (periodType) {
        case 'daily':
            return `(${format(date, 'EEEE')})`
        case 'weekly':
            return `(Week ${String(dateFnsGetISOWeek(date)).padStart(2, '0')})`
        case 'monthly':
            return `(${format(date, 'MMMM')})`
        case 'quarterly':
            return `(Q${dateFnsGetQuarter(date)})`
        case 'yearly':
            return ''
    }
}

/**
 * Format a date for display as a filename with period-specific suffix.
 * Combines the filename portion with a human-readable suffix.
 */
export function formatFilenameWithSuffix(
    date: Date,
    formatStr: string,
    periodType: PeriodType
): string {
    const filename = formatDateAsFilename(date, formatStr)
    const suffix = getPeriodSuffix(date, periodType)
    return suffix ? `${filename} ${suffix}` : filename
}

/**
 * Get the end of a period for a given date
 */
export function getEndOfPeriod(date: Date, periodType: PeriodType): Date {
    switch (periodType) {
        case 'daily':
            return endOfDay(date)
        case 'weekly':
            return endOfWeek(date, { weekStartsOn: 1 }) // Monday start
        case 'monthly':
            return endOfMonth(date)
        case 'quarterly':
            return endOfQuarter(date)
        case 'yearly':
            return endOfYear(date)
    }
}

/**
 * Check if a date's period OVERLAPS with a parent period.
 * A period overlaps if any part of it falls within the parent period.
 * This is useful for weeks that span month/year boundaries.
 *
 * Example: Week 2025-W01 (Dec 30, 2024 - Jan 5, 2025) overlaps with both
 * December 2024 and January 2025.
 */
export function doesPeriodOverlapParent(
    date: Date,
    childPeriodType: PeriodType,
    parentStart: Date,
    parentEnd: Date
): boolean {
    const periodStart = getStartOfPeriod(date, childPeriodType)
    const periodEnd = getEndOfPeriod(date, childPeriodType)
    // Overlap occurs when: periodStart <= parentEnd AND periodEnd >= parentStart
    return (
        periodStart.getTime() <= parentEnd.getTime() && periodEnd.getTime() >= parentStart.getTime()
    )
}
