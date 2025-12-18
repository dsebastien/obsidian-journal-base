import { describe, expect, test, beforeEach } from 'bun:test'
import { generatePeriodsForContext } from './period-generator'
import { SelectionContext } from './selection-context'
import type { PeriodType } from '../../types'

describe('period-generator', () => {
    let context: SelectionContext

    beforeEach(() => {
        context = new SelectionContext()
    })

    describe('generatePeriodsForContext with all types enabled', () => {
        const allEnabled: PeriodType[] = ['yearly', 'quarterly', 'monthly', 'weekly', 'daily']

        test('yearly periods should not depend on enabled types', () => {
            const periods = generatePeriodsForContext('yearly', context, allEnabled)
            expect(periods.length).toBeGreaterThan(0)
            // Should include current year
            const currentYear = new Date().getFullYear()
            const hasCurrentYear = periods.some((d) => d.getFullYear() === currentYear)
            expect(hasCurrentYear).toBe(true)
        })

        test('quarterly periods should be filtered by selected year when yearly is enabled', () => {
            context.updateForPeriod('yearly', new Date(2024, 0, 1), true)
            const periods = generatePeriodsForContext('quarterly', context, allEnabled)

            // Should have exactly 4 quarters for 2024
            expect(periods.length).toBe(4)
            periods.forEach((d) => {
                expect(d.getFullYear()).toBe(2024)
            })
        })

        test('monthly periods should be filtered by selected quarter when quarterly is enabled', () => {
            context.updateForPeriod('yearly', new Date(2024, 0, 1), true)
            context.updateForPeriod('quarterly', new Date(2024, 3, 1), true) // Q2

            const periods = generatePeriodsForContext('monthly', context, allEnabled)

            // Should have exactly 3 months for Q2 (April, May, June)
            expect(periods.length).toBe(3)
            const months = periods.map((d) => d.getMonth())
            expect(months).toContain(3) // April
            expect(months).toContain(4) // May
            expect(months).toContain(5) // June
        })
    })

    describe('generatePeriodsForContext with yearly disabled', () => {
        const yearlyDisabled: PeriodType[] = ['quarterly', 'monthly', 'weekly', 'daily']

        test('quarterly periods should span multiple years when yearly is disabled', () => {
            const periods = generatePeriodsForContext('quarterly', context, yearlyDisabled)

            // Should have quarters from multiple years (5 years * 4 quarters = 20+)
            expect(periods.length).toBeGreaterThan(4)

            // Should have quarters from different years
            const years = new Set(periods.map((d) => d.getFullYear()))
            expect(years.size).toBeGreaterThan(1)
        })

        test('monthly periods should filter by quarter when quarterly is enabled and selected', () => {
            // Select Q4 2024 (quarterly is still enabled)
            context.updateForPeriod('quarterly', new Date(2024, 9, 1), true) // Q4

            const periods = generatePeriodsForContext('monthly', context, yearlyDisabled)

            // Should have 3 months of Q4 2024
            expect(periods.length).toBe(3)
            periods.forEach((d) => {
                expect(d.getFullYear()).toBe(2024)
                expect(d.getMonth()).toBeGreaterThanOrEqual(9)
                expect(d.getMonth()).toBeLessThanOrEqual(11)
            })
        })

        test('monthly periods should span range when no quarter is selected', () => {
            // No quarter selected, yearly disabled
            const periods = generatePeriodsForContext('monthly', context, yearlyDisabled)

            // Should have months from multiple years (2 years * 12 = 24)
            expect(periods.length).toBe(24)
        })
    })

    describe('generatePeriodsForContext with quarterly disabled', () => {
        const quarterlyDisabled: PeriodType[] = ['yearly', 'monthly', 'weekly', 'daily']

        test('monthly periods should show all 12 months when quarterly is disabled but yearly is enabled', () => {
            context.updateForPeriod('yearly', new Date(2024, 0, 1), true)

            const periods = generatePeriodsForContext('monthly', context, quarterlyDisabled)

            // Should have all 12 months of 2024
            expect(periods.length).toBe(12)
            periods.forEach((d) => {
                expect(d.getFullYear()).toBe(2024)
            })
        })

        test('weekly periods should filter by month when monthly is enabled and selected', () => {
            context.updateForPeriod('yearly', new Date(2024, 0, 1), true)
            context.updateForPeriod('monthly', new Date(2024, 0, 1), true) // January

            const periods = generatePeriodsForContext('weekly', context, quarterlyDisabled)

            // Should have weeks from January 2024
            expect(periods.length).toBeGreaterThan(0)
            // All weeks should start within or overlap January
        })
    })

    describe('generatePeriodsForContext with yearly and quarterly disabled', () => {
        const bothDisabled: PeriodType[] = ['monthly', 'weekly', 'daily']

        test('monthly periods should span a reasonable range', () => {
            const periods = generatePeriodsForContext('monthly', context, bothDisabled)

            // Should have months from the default range (2 years)
            expect(periods.length).toBe(24)
        })

        test('weekly periods should filter by month when selected', () => {
            context.updateForPeriod('monthly', new Date(2024, 5, 1), true) // June

            const periods = generatePeriodsForContext('weekly', context, bothDisabled)

            // Should have weeks from June 2024
            expect(periods.length).toBeGreaterThan(0)
            expect(periods.length).toBeLessThanOrEqual(6) // Max ~5 weeks in a month
        })

        test('weekly periods should span range when no month is selected', () => {
            const periods = generatePeriodsForContext('weekly', context, bothDisabled)

            // Should have weeks from the default range (last 3 months)
            expect(periods.length).toBeGreaterThan(0)
        })
    })

    describe('generatePeriodsForContext with only daily enabled', () => {
        const onlyDaily: PeriodType[] = ['daily']

        test('daily periods should show last 2 weeks when no parents are enabled', () => {
            const periods = generatePeriodsForContext('daily', context, onlyDaily)

            // Should have ~14 days
            expect(periods.length).toBeGreaterThanOrEqual(14)
            expect(periods.length).toBeLessThanOrEqual(16) // Some buffer for date boundaries
        })
    })

    describe('generatePeriodsForContext cascading selection behavior', () => {
        test('selecting a quarter should make months filter by that quarter even if yearly is disabled', () => {
            const yearlyDisabled: PeriodType[] = ['quarterly', 'monthly', 'weekly', 'daily']

            // Select 2023-Q2
            context.updateForPeriod('quarterly', new Date(2023, 3, 1), true)

            const months = generatePeriodsForContext('monthly', context, yearlyDisabled)

            // Should have exactly 3 months from Q2 2023
            expect(months.length).toBe(3)
            months.forEach((d) => {
                expect(d.getFullYear()).toBe(2023)
                expect(d.getMonth()).toBeGreaterThanOrEqual(3)
                expect(d.getMonth()).toBeLessThanOrEqual(5)
            })
        })

        test('selecting a month should make weeks filter by that month even if quarterly is disabled', () => {
            const quarterlyDisabled: PeriodType[] = ['yearly', 'monthly', 'weekly', 'daily']

            context.updateForPeriod('yearly', new Date(2024, 0, 1), true)
            context.updateForPeriod('monthly', new Date(2024, 2, 1), true) // March

            const weeks = generatePeriodsForContext('weekly', context, quarterlyDisabled)

            // Should have weeks from March 2024
            expect(weeks.length).toBeGreaterThan(0)
            expect(weeks.length).toBeLessThanOrEqual(6)
        })

        test('selecting a week should make days filter by that week', () => {
            const allEnabled: PeriodType[] = ['yearly', 'quarterly', 'monthly', 'weekly', 'daily']

            context.updateForPeriod('yearly', new Date(2024, 0, 1), true)
            context.updateForPeriod('quarterly', new Date(2024, 0, 1), true)
            context.updateForPeriod('monthly', new Date(2024, 0, 1), true)
            context.updateForPeriod('weekly', new Date(2024, 0, 8), true) // Week 2 of 2024

            const days = generatePeriodsForContext('daily', context, allEnabled)

            // Should have exactly 7 days
            expect(days.length).toBe(7)
        })
    })
})
