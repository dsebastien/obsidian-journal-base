import { describe, expect, test } from 'bun:test'
import {
    convertMomentToDateFns,
    formatDate,
    formatDateAsFilename,
    formatFilenameWithSuffix,
    getPeriodSuffix,
    parseDateFromFormat,
    doesPeriodOverlapParent
} from './date-utils'

describe('date-utils', () => {
    describe('convertMomentToDateFns', () => {
        // Basic token conversions
        test('converts YYYY to yyyy', () => {
            expect(convertMomentToDateFns('YYYY')).toBe('yyyy')
        })

        test('converts YY to yy', () => {
            expect(convertMomentToDateFns('YY')).toBe('yy')
        })

        test('converts DD to dd', () => {
            expect(convertMomentToDateFns('DD')).toBe('dd')
        })

        // ISO week year tokens
        test('converts ISO week year gggg to RRRR', () => {
            expect(convertMomentToDateFns('gggg')).toBe('RRRR')
        })

        test('converts ISO week year gg to RR', () => {
            expect(convertMomentToDateFns('gg')).toBe('RR')
        })

        test('converts ISO week year GGGG to RRRR', () => {
            expect(convertMomentToDateFns('GGGG')).toBe('RRRR')
        })

        test('converts ISO week year GG to RR', () => {
            expect(convertMomentToDateFns('GG')).toBe('RR')
        })

        // ISO week number tokens
        test('converts ISO week WW to II', () => {
            expect(convertMomentToDateFns('WW')).toBe('II')
        })

        test('converts ISO week W to I', () => {
            expect(convertMomentToDateFns('W')).toBe('I')
        })

        // Literal escaping
        test('escapes literal text in brackets', () => {
            expect(convertMomentToDateFns('[Hello]')).toBe("'Hello'")
        })

        test('escapes W in brackets [W]', () => {
            expect(convertMomentToDateFns('[W]')).toBe("'W'")
        })

        test('escapes Q in brackets [Q]', () => {
            expect(convertMomentToDateFns('[Q]')).toBe("'Q'")
        })

        // Day of week tokens
        test('converts full day name dddd to eeee', () => {
            expect(convertMomentToDateFns('dddd')).toBe('eeee')
        })

        test('converts short day name ddd to eee', () => {
            expect(convertMomentToDateFns('ddd')).toBe('eee')
        })

        test('converts min day name dd to eeeeee', () => {
            expect(convertMomentToDateFns('dd')).toBe('eeeeee')
        })

        // Day of year tokens
        test('converts day of year DDD to D', () => {
            expect(convertMomentToDateFns('DDD')).toBe('D')
        })

        test('converts padded day of year DDDD to DDD', () => {
            expect(convertMomentToDateFns('DDDD')).toBe('DDD')
        })

        // Real-world format tests (user's actual formats)
        describe('real-world formats with path separators', () => {
            test('converts daily format: YYYY/WW/YYYY-MM-DD', () => {
                // Daily: includes path separator and ISO week
                expect(convertMomentToDateFns('YYYY/WW/YYYY-MM-DD')).toBe('yyyy/II/yyyy-MM-dd')
            })

            test('converts weekly format: YYYY/gggg-[W]ww', () => {
                // Weekly: includes path separator, ISO week year, and escaped W
                expect(convertMomentToDateFns('YYYY/gggg-[W]ww')).toBe("yyyy/RRRR-'W'II")
            })

            test('converts monthly format: YYYY/YYYY-MM', () => {
                // Monthly: includes path separator
                expect(convertMomentToDateFns('YYYY/YYYY-MM')).toBe('yyyy/yyyy-MM')
            })

            test('converts quarterly format: YYYY/YYYY-[Q]Q', () => {
                // Quarterly: includes path separator and escaped Q
                expect(convertMomentToDateFns('YYYY/YYYY-[Q]Q')).toBe("yyyy/yyyy-'Q'Q")
            })

            test('converts yearly format: YYYY', () => {
                expect(convertMomentToDateFns('YYYY')).toBe('yyyy')
            })
        })

        // Standard formats without path separators
        describe('standard formats', () => {
            test('converts daily format YYYY-MM-DD', () => {
                expect(convertMomentToDateFns('YYYY-MM-DD')).toBe('yyyy-MM-dd')
            })

            test('converts weekly format gggg-[W]ww', () => {
                expect(convertMomentToDateFns('gggg-[W]ww')).toBe("RRRR-'W'II")
            })

            test('converts monthly format YYYY-MM', () => {
                expect(convertMomentToDateFns('YYYY-MM')).toBe('yyyy-MM')
            })

            test('converts quarterly format YYYY-[Q]Q', () => {
                expect(convertMomentToDateFns('YYYY-[Q]Q')).toBe("yyyy-'Q'Q")
            })
        })
    })

    describe('formatDate', () => {
        // Basic formatting
        test('formats daily date correctly', () => {
            const date = new Date(2024, 0, 15) // January 15, 2024
            expect(formatDate(date, 'YYYY-MM-DD')).toBe('2024-01-15')
        })

        test('formats weekly date correctly', () => {
            const date = new Date(2024, 0, 15) // January 15, 2024 (week 3)
            expect(formatDate(date, 'gggg-[W]ww')).toBe('2024-W03')
        })

        test('formats monthly date correctly', () => {
            const date = new Date(2024, 5, 1) // June 1, 2024
            expect(formatDate(date, 'YYYY-MM')).toBe('2024-06')
        })

        test('formats quarterly date correctly', () => {
            const date = new Date(2024, 3, 1) // April 1, 2024 (Q2)
            expect(formatDate(date, 'YYYY-[Q]Q')).toBe('2024-Q2')
        })

        test('formats yearly date correctly', () => {
            const date = new Date(2024, 0, 1)
            expect(formatDate(date, 'YYYY')).toBe('2024')
        })

        // Real-world formats with path separators
        describe('formats with path separators', () => {
            test('formats daily with path: YYYY/WW/YYYY-MM-DD', () => {
                const date = new Date(2024, 0, 15) // January 15, 2024 (week 3)
                expect(formatDate(date, 'YYYY/WW/YYYY-MM-DD')).toBe('2024/03/2024-01-15')
            })

            test('formats weekly with path: YYYY/gggg-[W]ww', () => {
                const date = new Date(2024, 0, 15) // January 15, 2024 (week 3)
                expect(formatDate(date, 'YYYY/gggg-[W]ww')).toBe('2024/2024-W03')
            })

            test('formats monthly with path: YYYY/YYYY-MM', () => {
                const date = new Date(2024, 5, 1) // June 1, 2024
                expect(formatDate(date, 'YYYY/YYYY-MM')).toBe('2024/2024-06')
            })

            test('formats quarterly with path: YYYY/YYYY-[Q]Q', () => {
                const date = new Date(2024, 3, 1) // April 1, 2024 (Q2)
                expect(formatDate(date, 'YYYY/YYYY-[Q]Q')).toBe('2024/2024-Q2')
            })
        })

        // ISO week edge cases
        describe('ISO week edge cases', () => {
            test('formats date at year boundary (Dec 31, 2024)', () => {
                // Dec 31, 2024 is in ISO week 1 of 2025
                const date = new Date(2024, 11, 31)
                expect(formatDate(date, 'gggg-[W]ww')).toBe('2025-W01')
            })

            test('formats date at year boundary (Jan 1, 2024)', () => {
                // Jan 1, 2024 is in ISO week 1 of 2024
                const date = new Date(2024, 0, 1)
                expect(formatDate(date, 'gggg-[W]ww')).toBe('2024-W01')
            })
        })
    })

    describe('parseDateFromFormat', () => {
        test('parses daily format', () => {
            const result = parseDateFromFormat('2024-01-15', 'YYYY-MM-DD')
            expect(result).not.toBeNull()
            expect(result?.getFullYear()).toBe(2024)
            expect(result?.getMonth()).toBe(0) // January
            expect(result?.getDate()).toBe(15)
        })

        test('parses monthly format', () => {
            const result = parseDateFromFormat('2024-06', 'YYYY-MM')
            expect(result).not.toBeNull()
            expect(result?.getFullYear()).toBe(2024)
            expect(result?.getMonth()).toBe(5) // June
        })

        test('parses quarterly format with literal Q', () => {
            const result = parseDateFromFormat('2024-Q2', 'YYYY-[Q]Q')
            expect(result).not.toBeNull()
            expect(result?.getFullYear()).toBe(2024)
        })

        test('returns null for invalid date string', () => {
            const result = parseDateFromFormat('not-a-date', 'YYYY-MM-DD')
            expect(result).toBeNull()
        })
    })

    describe('formatDateAsFilename', () => {
        test('extracts filename from daily format with path', () => {
            const date = new Date(2024, 0, 15) // January 15, 2024
            expect(formatDateAsFilename(date, 'YYYY/WW/YYYY-MM-DD')).toBe('2024-01-15')
        })

        test('extracts filename from weekly format with path', () => {
            const date = new Date(2024, 0, 15) // January 15, 2024 (week 3)
            expect(formatDateAsFilename(date, 'YYYY/gggg-[W]ww')).toBe('2024-W03')
        })

        test('extracts filename from monthly format with path', () => {
            const date = new Date(2024, 5, 1) // June 1, 2024
            expect(formatDateAsFilename(date, 'YYYY/YYYY-MM')).toBe('2024-06')
        })

        test('extracts filename from quarterly format with path', () => {
            const date = new Date(2024, 3, 1) // April 1, 2024 (Q2)
            expect(formatDateAsFilename(date, 'YYYY/YYYY-[Q]Q')).toBe('2024-Q2')
        })

        test('returns full string when no path separator', () => {
            const date = new Date(2024, 0, 15)
            expect(formatDateAsFilename(date, 'YYYY-MM-DD')).toBe('2024-01-15')
        })

        test('handles deeply nested paths', () => {
            const date = new Date(2024, 0, 15)
            expect(formatDateAsFilename(date, 'YYYY/MM/DD/YYYY-MM-DD')).toBe('2024-01-15')
        })
    })

    describe('getPeriodSuffix', () => {
        test('returns day name for daily period', () => {
            const date = new Date(2024, 11, 17) // December 17, 2024 (Tuesday)
            expect(getPeriodSuffix(date, 'daily')).toBe('(Tuesday)')
        })

        test('returns week number for weekly period', () => {
            const date = new Date(2024, 11, 17) // December 17, 2024 (week 51)
            expect(getPeriodSuffix(date, 'weekly')).toBe('(Week 51)')
        })

        test('returns month name for monthly period', () => {
            const date = new Date(2024, 11, 1) // December 2024
            expect(getPeriodSuffix(date, 'monthly')).toBe('(December)')
        })

        test('returns quarter for quarterly period', () => {
            const date = new Date(2024, 3, 1) // April 2024 (Q2)
            expect(getPeriodSuffix(date, 'quarterly')).toBe('(Q2)')
        })

        test('returns empty string for yearly period', () => {
            const date = new Date(2024, 0, 1)
            expect(getPeriodSuffix(date, 'yearly')).toBe('')
        })

        test('returns correct day name for different days of the week', () => {
            // Monday
            expect(getPeriodSuffix(new Date(2024, 11, 16), 'daily')).toBe('(Monday)')
            // Wednesday
            expect(getPeriodSuffix(new Date(2024, 11, 18), 'daily')).toBe('(Wednesday)')
            // Friday
            expect(getPeriodSuffix(new Date(2024, 11, 20), 'daily')).toBe('(Friday)')
            // Sunday
            expect(getPeriodSuffix(new Date(2024, 11, 22), 'daily')).toBe('(Sunday)')
        })

        test('returns correct quarter for each quarter', () => {
            expect(getPeriodSuffix(new Date(2024, 0, 1), 'quarterly')).toBe('(Q1)') // January
            expect(getPeriodSuffix(new Date(2024, 3, 1), 'quarterly')).toBe('(Q2)') // April
            expect(getPeriodSuffix(new Date(2024, 6, 1), 'quarterly')).toBe('(Q3)') // July
            expect(getPeriodSuffix(new Date(2024, 9, 1), 'quarterly')).toBe('(Q4)') // October
        })

        test('returns correct month name for each month', () => {
            expect(getPeriodSuffix(new Date(2024, 0, 1), 'monthly')).toBe('(January)')
            expect(getPeriodSuffix(new Date(2024, 5, 1), 'monthly')).toBe('(June)')
            expect(getPeriodSuffix(new Date(2024, 11, 1), 'monthly')).toBe('(December)')
        })
    })

    describe('formatFilenameWithSuffix', () => {
        test('formats daily filename with day name suffix', () => {
            const date = new Date(2024, 11, 17) // December 17, 2024 (Tuesday)
            expect(formatFilenameWithSuffix(date, 'YYYY/WW/YYYY-MM-DD', 'daily')).toBe(
                '2024-12-17 (Tuesday)'
            )
        })

        test('formats weekly filename with week number suffix', () => {
            const date = new Date(2024, 11, 17) // December 17, 2024 (week 51)
            expect(formatFilenameWithSuffix(date, 'YYYY/gggg-[W]ww', 'weekly')).toBe(
                '2024-W51 (Week 51)'
            )
        })

        test('formats monthly filename with month name suffix', () => {
            const date = new Date(2024, 11, 1) // December 2024
            expect(formatFilenameWithSuffix(date, 'YYYY/YYYY-MM', 'monthly')).toBe(
                '2024-12 (December)'
            )
        })

        test('formats quarterly filename with quarter suffix', () => {
            const date = new Date(2024, 3, 1) // April 2024 (Q2)
            expect(formatFilenameWithSuffix(date, 'YYYY/YYYY-[Q]Q', 'quarterly')).toBe(
                '2024-Q2 (Q2)'
            )
        })

        test('formats yearly filename without suffix', () => {
            const date = new Date(2024, 0, 1)
            expect(formatFilenameWithSuffix(date, 'YYYY', 'yearly')).toBe('2024')
        })

        test('handles formats without path separators', () => {
            const date = new Date(2024, 11, 17)
            expect(formatFilenameWithSuffix(date, 'YYYY-MM-DD', 'daily')).toBe(
                '2024-12-17 (Tuesday)'
            )
        })
    })

    describe('doesPeriodOverlapParent', () => {
        describe('weekly periods overlapping months', () => {
            test('week fully within month overlaps', () => {
                // Week of Jan 6-12, 2025 (fully within January)
                const weekDate = new Date(2025, 0, 6) // Monday Jan 6
                const monthStart = new Date(2025, 0, 1)
                const monthEnd = new Date(2025, 0, 31)
                expect(doesPeriodOverlapParent(weekDate, 'weekly', monthStart, monthEnd)).toBe(true)
            })

            test('week starting in previous month overlaps with current month', () => {
                // Week of Dec 30, 2024 - Jan 5, 2025 (2025-W01)
                // Should overlap with January 2025
                const weekDate = new Date(2024, 11, 30) // Monday Dec 30
                const janStart = new Date(2025, 0, 1)
                const janEnd = new Date(2025, 0, 31)
                expect(doesPeriodOverlapParent(weekDate, 'weekly', janStart, janEnd)).toBe(true)
            })

            test('week ending in next month overlaps with current month', () => {
                // Week of Dec 30, 2024 - Jan 5, 2025 (2025-W01)
                // Should also overlap with December 2024
                const weekDate = new Date(2024, 11, 30) // Monday Dec 30
                const decStart = new Date(2024, 11, 1)
                const decEnd = new Date(2024, 11, 31)
                expect(doesPeriodOverlapParent(weekDate, 'weekly', decStart, decEnd)).toBe(true)
            })

            test('week before month does not overlap', () => {
                // Week of Dec 23-29, 2024
                const weekDate = new Date(2024, 11, 23) // Monday Dec 23
                const janStart = new Date(2025, 0, 1)
                const janEnd = new Date(2025, 0, 31)
                expect(doesPeriodOverlapParent(weekDate, 'weekly', janStart, janEnd)).toBe(false)
            })

            test('week after month does not overlap', () => {
                // Week of Feb 3-9, 2025
                const weekDate = new Date(2025, 1, 3) // Monday Feb 3
                const janStart = new Date(2025, 0, 1)
                const janEnd = new Date(2025, 0, 31)
                expect(doesPeriodOverlapParent(weekDate, 'weekly', janStart, janEnd)).toBe(false)
            })
        })

        describe('leap year handling', () => {
            test('week spanning Feb-Mar in leap year 2024 overlaps with February', () => {
                // 2024 is a leap year (Feb has 29 days)
                // Week of Feb 26 - Mar 3, 2024
                const weekDate = new Date(2024, 1, 26) // Monday Feb 26
                const febStart = new Date(2024, 1, 1)
                const febEnd = new Date(2024, 1, 29) // Feb 29 in leap year
                expect(doesPeriodOverlapParent(weekDate, 'weekly', febStart, febEnd)).toBe(true)
            })

            test('week spanning Feb-Mar in leap year 2024 overlaps with March', () => {
                // Week of Feb 26 - Mar 3, 2024
                const weekDate = new Date(2024, 1, 26) // Monday Feb 26
                const marStart = new Date(2024, 2, 1)
                const marEnd = new Date(2024, 2, 31)
                expect(doesPeriodOverlapParent(weekDate, 'weekly', marStart, marEnd)).toBe(true)
            })

            test('week spanning Feb-Mar in non-leap year 2025 overlaps with February', () => {
                // 2025 is not a leap year (Feb has 28 days)
                // Week of Feb 24 - Mar 2, 2025
                const weekDate = new Date(2025, 1, 24) // Monday Feb 24
                const febStart = new Date(2025, 1, 1)
                const febEnd = new Date(2025, 1, 28) // Feb 28 in non-leap year
                expect(doesPeriodOverlapParent(weekDate, 'weekly', febStart, febEnd)).toBe(true)
            })

            test('week spanning Feb-Mar in non-leap year 2025 overlaps with March', () => {
                // Week of Feb 24 - Mar 2, 2025
                const weekDate = new Date(2025, 1, 24) // Monday Feb 24
                const marStart = new Date(2025, 2, 1)
                const marEnd = new Date(2025, 2, 31)
                expect(doesPeriodOverlapParent(weekDate, 'weekly', marStart, marEnd)).toBe(true)
            })

            test('week fully in February leap year does not overlap with March', () => {
                // Week of Feb 19-25, 2024 (fully within Feb in leap year)
                const weekDate = new Date(2024, 1, 19) // Monday Feb 19
                const marStart = new Date(2024, 2, 1)
                const marEnd = new Date(2024, 2, 31)
                expect(doesPeriodOverlapParent(weekDate, 'weekly', marStart, marEnd)).toBe(false)
            })
        })

        describe('year boundary handling', () => {
            test('first week of 2025 (starting Dec 30, 2024) overlaps with 2025', () => {
                // 2025-W01 starts on Monday Dec 30, 2024
                const weekDate = new Date(2024, 11, 30)
                const yearStart = new Date(2025, 0, 1)
                const yearEnd = new Date(2025, 11, 31)
                expect(doesPeriodOverlapParent(weekDate, 'weekly', yearStart, yearEnd)).toBe(true)
            })

            test('first week of 2025 (starting Dec 30, 2024) overlaps with 2024', () => {
                // 2025-W01 starts on Monday Dec 30, 2024
                const weekDate = new Date(2024, 11, 30)
                const yearStart = new Date(2024, 0, 1)
                const yearEnd = new Date(2024, 11, 31)
                expect(doesPeriodOverlapParent(weekDate, 'weekly', yearStart, yearEnd)).toBe(true)
            })

            test('last week of 2024 does not overlap with 2025', () => {
                // Week of Dec 23-29, 2024 (last full week of 2024)
                const weekDate = new Date(2024, 11, 23)
                const yearStart = new Date(2025, 0, 1)
                const yearEnd = new Date(2025, 11, 31)
                expect(doesPeriodOverlapParent(weekDate, 'weekly', yearStart, yearEnd)).toBe(false)
            })
        })

        describe('quarterly boundaries', () => {
            test('week spanning Q1-Q2 boundary overlaps with Q1', () => {
                // Week of Mar 31 - Apr 6, 2025
                const weekDate = new Date(2025, 2, 31) // Monday Mar 31
                const q1Start = new Date(2025, 0, 1)
                const q1End = new Date(2025, 2, 31)
                expect(doesPeriodOverlapParent(weekDate, 'weekly', q1Start, q1End)).toBe(true)
            })

            test('week spanning Q1-Q2 boundary overlaps with Q2', () => {
                // Week of Mar 31 - Apr 6, 2025
                const weekDate = new Date(2025, 2, 31) // Monday Mar 31
                const q2Start = new Date(2025, 3, 1)
                const q2End = new Date(2025, 5, 30)
                expect(doesPeriodOverlapParent(weekDate, 'weekly', q2Start, q2End)).toBe(true)
            })
        })
    })
})
