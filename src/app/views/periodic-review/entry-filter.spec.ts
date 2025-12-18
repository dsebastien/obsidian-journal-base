import { describe, expect, test, beforeEach } from 'bun:test'
import { filterEntriesByContext } from './entry-filter'
import { SelectionContext } from './selection-context'
import type { PeriodType, PeriodicNoteConfig } from '../../types'
import type { BasesEntry } from 'obsidian'

// Helper to create mock entries
function createMockEntry(basename: string): BasesEntry {
    return {
        file: {
            path: `notes/${basename}.md`,
            name: `${basename}.md`,
            basename: basename,
            extension: 'md'
        }
    } as BasesEntry
}

// Helper to create entries for a range of dates
function createQuarterlyEntries(years: number[]): BasesEntry[] {
    const entries: BasesEntry[] = []
    for (const year of years) {
        for (let q = 1; q <= 4; q++) {
            entries.push(createMockEntry(`${year}-Q${q}`))
        }
    }
    return entries
}

function createMonthlyEntries(year: number, months: number[]): BasesEntry[] {
    return months.map((m) => {
        const monthStr = String(m + 1).padStart(2, '0')
        return createMockEntry(`${year}-${monthStr}`)
    })
}

function createDailyEntries(year: number, month: number, days: number[]): BasesEntry[] {
    const monthStr = String(month + 1).padStart(2, '0')
    return days.map((d) => {
        const dayStr = String(d).padStart(2, '0')
        return createMockEntry(`${year}-${monthStr}-${dayStr}`)
    })
}

describe('entry-filter', () => {
    let context: SelectionContext

    const quarterlyConfig: PeriodicNoteConfig = {
        enabled: true,
        folder: 'quarterly',
        format: 'YYYY-[Q]Q',
        template: ''
    }

    const monthlyConfig: PeriodicNoteConfig = {
        enabled: true,
        folder: 'monthly',
        format: 'YYYY-MM',
        template: ''
    }

    const dailyConfig: PeriodicNoteConfig = {
        enabled: true,
        folder: 'daily',
        format: 'YYYY-MM-DD',
        template: ''
    }

    beforeEach(() => {
        context = new SelectionContext()
    })

    describe('filterEntriesByContext for quarterly entries', () => {
        const allEnabled: PeriodType[] = ['yearly', 'quarterly', 'monthly', 'weekly', 'daily']
        const yearlyDisabled: PeriodType[] = ['quarterly', 'monthly', 'weekly', 'daily']

        test('should filter quarterly entries by year when yearly is enabled', () => {
            const entries = createQuarterlyEntries([2023, 2024, 2025])
            context.updateForPeriod('yearly', new Date(2024, 0, 1), true)

            const filtered = filterEntriesByContext(
                entries,
                'quarterly',
                quarterlyConfig,
                context,
                allEnabled
            )

            expect(filtered.length).toBe(4)
            filtered.forEach((entry) => {
                expect(entry.file.basename).toContain('2024')
            })
        })

        test('should return all quarterly entries when yearly is disabled', () => {
            const entries = createQuarterlyEntries([2023, 2024, 2025])
            context.updateForPeriod('yearly', new Date(2024, 0, 1), true)

            const filtered = filterEntriesByContext(
                entries,
                'quarterly',
                quarterlyConfig,
                context,
                yearlyDisabled
            )

            // All entries should be returned since yearly filtering is disabled
            expect(filtered.length).toBe(12)
        })
    })

    describe('filterEntriesByContext for monthly entries', () => {
        const allEnabled: PeriodType[] = ['yearly', 'quarterly', 'monthly', 'weekly', 'daily']
        const yearlyDisabled: PeriodType[] = ['quarterly', 'monthly', 'weekly', 'daily']
        const quarterlyDisabled: PeriodType[] = ['yearly', 'monthly', 'weekly', 'daily']

        test('should filter monthly entries by quarter when quarterly is enabled and selected', () => {
            const entries = createMonthlyEntries(2024, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
            context.updateForPeriod('yearly', new Date(2024, 0, 1), true)
            context.updateForPeriod('quarterly', new Date(2024, 3, 1), true) // Q2

            const filtered = filterEntriesByContext(
                entries,
                'monthly',
                monthlyConfig,
                context,
                allEnabled
            )

            expect(filtered.length).toBe(3)
            const months = filtered.map((e) => e.file.basename)
            expect(months).toContain('2024-04')
            expect(months).toContain('2024-05')
            expect(months).toContain('2024-06')
        })

        test('should filter monthly entries by year only when quarterly is disabled', () => {
            const entries = createMonthlyEntries(2024, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
            context.updateForPeriod('yearly', new Date(2024, 0, 1), true)

            const filtered = filterEntriesByContext(
                entries,
                'monthly',
                monthlyConfig,
                context,
                quarterlyDisabled
            )

            // All 12 months should be returned since quarterly is disabled
            expect(filtered.length).toBe(12)
        })

        test('should filter by selected quarter even when yearly is disabled', () => {
            // Entries from multiple years
            const entries2023 = createMonthlyEntries(2023, [9, 10, 11]) // Q4 2023
            const entries2024 = createMonthlyEntries(2024, [0, 1, 2, 3, 4, 5]) // Q1-Q2 2024
            const allEntries = [...entries2023, ...entries2024]

            // Select Q4 2024 (quarterly enabled, yearly disabled)
            context.updateForPeriod('quarterly', new Date(2024, 9, 1), true) // Q4 2024

            const filtered = filterEntriesByContext(
                allEntries,
                'monthly',
                monthlyConfig,
                context,
                yearlyDisabled
            )

            // Should filter by Q4 2024 specifically (Oct, Nov, Dec of 2024)
            // Since Q4 2024 months aren't in our test data, expect 0
            expect(filtered.length).toBe(0)

            // Now test with Q4 2023
            context.updateForPeriod('quarterly', new Date(2023, 9, 1), true) // Q4 2023

            const filtered2 = filterEntriesByContext(
                allEntries,
                'monthly',
                monthlyConfig,
                context,
                yearlyDisabled
            )

            expect(filtered2.length).toBe(3)
            filtered2.forEach((e) => {
                expect(e.file.basename).toMatch(/^2023-(10|11|12)$/)
            })
        })

        test('should return all monthly entries when both yearly and quarterly are disabled', () => {
            const entries2023 = createMonthlyEntries(2023, [9, 10, 11])
            const entries2024 = createMonthlyEntries(2024, [0, 1, 2])
            const allEntries = [...entries2023, ...entries2024]

            const bothDisabled: PeriodType[] = ['monthly', 'weekly', 'daily']

            const filtered = filterEntriesByContext(
                allEntries,
                'monthly',
                monthlyConfig,
                context,
                bothDisabled
            )

            // All entries should be returned
            expect(filtered.length).toBe(6)
        })
    })

    describe('filterEntriesByContext for daily entries', () => {
        const allEnabled: PeriodType[] = ['yearly', 'quarterly', 'monthly', 'weekly', 'daily']
        const monthlyDisabled: PeriodType[] = ['yearly', 'quarterly', 'weekly', 'daily']

        test('should filter daily entries by month when monthly is enabled and selected', () => {
            const janEntries = createDailyEntries(2024, 0, [1, 2, 3, 4, 5])
            const febEntries = createDailyEntries(2024, 1, [1, 2, 3, 4, 5])
            const allEntries = [...janEntries, ...febEntries]

            context.updateForPeriod('yearly', new Date(2024, 0, 1), true)
            context.updateForPeriod('monthly', new Date(2024, 0, 1), true) // January

            const filtered = filterEntriesByContext(
                allEntries,
                'daily',
                dailyConfig,
                context,
                allEnabled
            )

            expect(filtered.length).toBe(5)
            filtered.forEach((e) => {
                expect(e.file.basename).toMatch(/^2024-01-/)
            })
        })

        test('should filter daily entries by quarter when monthly is disabled but quarterly is enabled', () => {
            const q1Entries = [
                ...createDailyEntries(2024, 0, [15]), // Jan
                ...createDailyEntries(2024, 1, [15]), // Feb
                ...createDailyEntries(2024, 2, [15]) // Mar
            ]
            const q2Entries = [
                ...createDailyEntries(2024, 3, [15]), // Apr
                ...createDailyEntries(2024, 4, [15]) // May
            ]
            const allEntries = [...q1Entries, ...q2Entries]

            context.updateForPeriod('yearly', new Date(2024, 0, 1), true)
            context.updateForPeriod('quarterly', new Date(2024, 0, 1), true) // Q1

            const filtered = filterEntriesByContext(
                allEntries,
                'daily',
                dailyConfig,
                context,
                monthlyDisabled
            )

            expect(filtered.length).toBe(3)
            filtered.forEach((e) => {
                expect(e.file.basename).toMatch(/^2024-(01|02|03)-/)
            })
        })

        test('should return all daily entries when only daily is enabled', () => {
            const entries = createDailyEntries(2024, 0, [1, 2, 3])
            const onlyDaily: PeriodType[] = ['daily']

            const filtered = filterEntriesByContext(
                entries,
                'daily',
                dailyConfig,
                context,
                onlyDaily
            )

            expect(filtered.length).toBe(3)
        })
    })

    describe('yearly entries are never filtered', () => {
        test('should return all yearly entries regardless of context', () => {
            const entries = [
                createMockEntry('2022'),
                createMockEntry('2023'),
                createMockEntry('2024'),
                createMockEntry('2025')
            ]

            const yearlyConfig: PeriodicNoteConfig = {
                enabled: true,
                folder: 'yearly',
                format: 'YYYY',
                template: ''
            }

            context.updateForPeriod('yearly', new Date(2024, 0, 1), true)

            const allEnabled: PeriodType[] = ['yearly', 'quarterly', 'monthly', 'weekly', 'daily']
            const filtered = filterEntriesByContext(
                entries,
                'yearly',
                yearlyConfig,
                context,
                allEnabled
            )

            expect(filtered.length).toBe(4)
        })
    })

    describe('weekly entries spanning boundaries', () => {
        const weeklyConfig: PeriodicNoteConfig = {
            enabled: true,
            folder: 'weekly',
            format: 'gggg-[W]ww',
            template: ''
        }

        const allEnabled: PeriodType[] = ['yearly', 'quarterly', 'monthly', 'weekly', 'daily']

        // Helper to create weekly entries using ISO week format
        function createWeeklyEntry(isoWeekYear: number, week: number): BasesEntry {
            const weekStr = String(week).padStart(2, '0')
            return createMockEntry(`${isoWeekYear}-W${weekStr}`)
        }

        test('week spanning year boundary appears in both years (2025-W01 in Dec 2024)', () => {
            // 2025-W01 starts on Monday Dec 30, 2024
            const entries = [
                createWeeklyEntry(2024, 52), // Dec 23-29, 2024
                createWeeklyEntry(2025, 1) // Dec 30, 2024 - Jan 5, 2025
            ]

            // Select December 2024
            context.updateForPeriod('yearly', new Date(2024, 0, 1), true)
            context.updateForPeriod('monthly', new Date(2024, 11, 1), true) // December

            const filtered = filterEntriesByContext(
                entries,
                'weekly',
                weeklyConfig,
                context,
                allEnabled
            )

            // Both weeks should appear (W52 fully in Dec, W01 overlaps Dec 30-31)
            expect(filtered.length).toBe(2)
            const weeks = filtered.map((e) => e.file.basename)
            expect(weeks).toContain('2024-W52')
            expect(weeks).toContain('2025-W01')
        })

        test('week spanning year boundary appears in both years (2025-W01 in Jan 2025)', () => {
            // 2025-W01 starts on Monday Dec 30, 2024
            const entries = [
                createWeeklyEntry(2025, 1), // Dec 30, 2024 - Jan 5, 2025
                createWeeklyEntry(2025, 2) // Jan 6-12, 2025
            ]

            // Select January 2025
            context.updateForPeriod('yearly', new Date(2025, 0, 1), true)
            context.updateForPeriod('monthly', new Date(2025, 0, 1), true) // January

            const filtered = filterEntriesByContext(
                entries,
                'weekly',
                weeklyConfig,
                context,
                allEnabled
            )

            // Both weeks should appear (W01 overlaps Jan 1-5, W02 fully in Jan)
            expect(filtered.length).toBe(2)
            const weeks = filtered.map((e) => e.file.basename)
            expect(weeks).toContain('2025-W01')
            expect(weeks).toContain('2025-W02')
        })

        test('week fully before month does not appear', () => {
            const entries = [
                createWeeklyEntry(2024, 52), // Dec 23-29, 2024
                createWeeklyEntry(2025, 1), // Dec 30, 2024 - Jan 5, 2025
                createWeeklyEntry(2025, 2) // Jan 6-12, 2025
            ]

            // Select January 2025
            context.updateForPeriod('yearly', new Date(2025, 0, 1), true)
            context.updateForPeriod('monthly', new Date(2025, 0, 1), true) // January

            const filtered = filterEntriesByContext(
                entries,
                'weekly',
                weeklyConfig,
                context,
                allEnabled
            )

            // W52 (Dec 23-29) does not overlap January, should not appear
            const weeks = filtered.map((e) => e.file.basename)
            expect(weeks).not.toContain('2024-W52')
        })

        test('leap year: week spanning Feb-Mar in 2024 appears in both months', () => {
            // 2024 is a leap year, Feb has 29 days
            // Week of Feb 26 - Mar 3, 2024 (2024-W09)
            const entries = [
                createWeeklyEntry(2024, 8), // Feb 19-25
                createWeeklyEntry(2024, 9), // Feb 26 - Mar 3
                createWeeklyEntry(2024, 10) // Mar 4-10
            ]

            // Select February 2024
            context.updateForPeriod('yearly', new Date(2024, 0, 1), true)
            context.updateForPeriod('monthly', new Date(2024, 1, 1), true) // February

            const filteredFeb = filterEntriesByContext(
                entries,
                'weekly',
                weeklyConfig,
                context,
                allEnabled
            )

            // W08 and W09 should appear (W08 fully in Feb, W09 overlaps Feb 26-29)
            expect(filteredFeb.length).toBe(2)
            const febWeeks = filteredFeb.map((e) => e.file.basename)
            expect(febWeeks).toContain('2024-W08')
            expect(febWeeks).toContain('2024-W09')

            // Select March 2024
            context.updateForPeriod('monthly', new Date(2024, 2, 1), true) // March

            const filteredMar = filterEntriesByContext(
                entries,
                'weekly',
                weeklyConfig,
                context,
                allEnabled
            )

            // W09 and W10 should appear (W09 overlaps Mar 1-3, W10 fully in Mar)
            expect(filteredMar.length).toBe(2)
            const marWeeks = filteredMar.map((e) => e.file.basename)
            expect(marWeeks).toContain('2024-W09')
            expect(marWeeks).toContain('2024-W10')
        })

        test('week spanning quarter boundary appears in both quarters', () => {
            // Week of Mar 31 - Apr 6, 2025 (2025-W14)
            const entries = [
                createWeeklyEntry(2025, 13), // Mar 24-30
                createWeeklyEntry(2025, 14), // Mar 31 - Apr 6
                createWeeklyEntry(2025, 15) // Apr 7-13
            ]

            const quarterlyEnabled: PeriodType[] = ['yearly', 'quarterly', 'weekly', 'daily']

            // Select Q1 2025
            context.updateForPeriod('yearly', new Date(2025, 0, 1), true)
            context.updateForPeriod('quarterly', new Date(2025, 0, 1), true) // Q1

            const filteredQ1 = filterEntriesByContext(
                entries,
                'weekly',
                weeklyConfig,
                context,
                quarterlyEnabled
            )

            // W13 and W14 should appear in Q1
            const q1Weeks = filteredQ1.map((e) => e.file.basename)
            expect(q1Weeks).toContain('2025-W13')
            expect(q1Weeks).toContain('2025-W14')
            expect(q1Weeks).not.toContain('2025-W15')

            // Select Q2 2025
            context.updateForPeriod('quarterly', new Date(2025, 3, 1), true) // Q2

            const filteredQ2 = filterEntriesByContext(
                entries,
                'weekly',
                weeklyConfig,
                context,
                quarterlyEnabled
            )

            // W14 and W15 should appear in Q2
            const q2Weeks = filteredQ2.map((e) => e.file.basename)
            expect(q2Weeks).not.toContain('2025-W13')
            expect(q2Weeks).toContain('2025-W14')
            expect(q2Weeks).toContain('2025-W15')
        })
    })
})
