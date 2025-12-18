import { describe, expect, test, beforeEach } from 'bun:test'
import { SelectionContext } from './selection-context'

describe('SelectionContext', () => {
    let context: SelectionContext

    beforeEach(() => {
        context = new SelectionContext()
    })

    describe('saveSnapshot and restoreSnapshot', () => {
        test('should save and restore default state', () => {
            const snapshot = context.saveSnapshot()

            expect(snapshot.selectedYear).toBe(new Date().getFullYear())
            expect(snapshot.selectedQuarter).toBeNull()
            expect(snapshot.selectedMonth).toBeNull()
            expect(snapshot.selectedWeek).toBeNull()
            expect(snapshot.selectedWeekYear).toBeNull()
            expect(snapshot.yearExists).toBe(false)
            expect(snapshot.quarterExists).toBe(false)
            expect(snapshot.monthExists).toBe(false)
            expect(snapshot.weekExists).toBe(false)
        })

        test('should save and restore yearly selection', () => {
            const date = new Date(2024, 0, 1)
            context.updateForPeriod('yearly', date, true)

            const snapshot = context.saveSnapshot()

            expect(snapshot.selectedYear).toBe(2024)
            expect(snapshot.yearExists).toBe(true)

            // Create new context and restore
            const newContext = new SelectionContext()
            newContext.restoreSnapshot(snapshot)

            expect(newContext.selectedYear).toBe(2024)
            expect(newContext.exists('yearly')).toBe(true)
        })

        test('should save and restore quarterly selection', () => {
            const yearDate = new Date(2024, 0, 1)
            context.updateForPeriod('yearly', yearDate, true)

            const quarterDate = new Date(2024, 3, 1) // Q2
            context.updateForPeriod('quarterly', quarterDate, true)

            const snapshot = context.saveSnapshot()

            expect(snapshot.selectedYear).toBe(2024)
            expect(snapshot.selectedQuarter).toBe(2)
            expect(snapshot.quarterExists).toBe(true)

            // Create new context and restore
            const newContext = new SelectionContext()
            newContext.restoreSnapshot(snapshot)

            expect(newContext.selectedYear).toBe(2024)
            expect(newContext.selectedQuarter).toBe(2)
            expect(newContext.exists('quarterly')).toBe(true)
        })

        test('should save and restore monthly selection', () => {
            const date = new Date(2024, 10, 1) // November
            context.updateParentContext('yearly', date, true)
            context.updateParentContext('quarterly', date, true)
            context.updateForPeriod('monthly', date, true)

            const snapshot = context.saveSnapshot()

            expect(snapshot.selectedYear).toBe(2024)
            expect(snapshot.selectedQuarter).toBe(4)
            expect(snapshot.selectedMonth).toBe(10)
            expect(snapshot.monthExists).toBe(true)

            // Create new context and restore
            const newContext = new SelectionContext()
            newContext.restoreSnapshot(snapshot)

            expect(newContext.selectedYear).toBe(2024)
            expect(newContext.selectedQuarter).toBe(4)
            expect(newContext.selectedMonth).toBe(10)
            expect(newContext.exists('monthly')).toBe(true)
        })

        test('should save and restore weekly selection', () => {
            const date = new Date(2024, 11, 16) // Week 51 of 2024
            context.updateParentContext('yearly', date, true)
            context.updateParentContext('quarterly', date, true)
            context.updateParentContext('monthly', date, true)
            context.updateForPeriod('weekly', date, true)

            const snapshot = context.saveSnapshot()

            expect(snapshot.selectedWeek).not.toBeNull()
            expect(snapshot.selectedWeekYear).toBe(2024)
            expect(snapshot.weekExists).toBe(true)

            // Create new context and restore
            const newContext = new SelectionContext()
            newContext.restoreSnapshot(snapshot)

            expect(newContext.selectedWeek).toBe(snapshot.selectedWeek)
            expect(newContext.selectedWeekYear).toBe(2024)
            expect(newContext.exists('weekly')).toBe(true)
        })

        test('should preserve all state through save/restore cycle', () => {
            // Set up a complex state
            const yearDate = new Date(2023, 0, 1)
            context.updateForPeriod('yearly', yearDate, true)

            const quarterDate = new Date(2023, 6, 1) // Q3
            context.updateForPeriod('quarterly', quarterDate, false) // Note: doesn't exist

            const monthDate = new Date(2023, 7, 1) // August
            context.updateForPeriod('monthly', monthDate, true)

            const weekDate = new Date(2023, 7, 14) // Week in August
            context.updateForPeriod('weekly', weekDate, false) // Note: doesn't exist

            const snapshot = context.saveSnapshot()

            // Create new context and restore
            const newContext = new SelectionContext()
            newContext.restoreSnapshot(snapshot)

            // Verify all values match
            expect(newContext.selectedYear).toBe(context.selectedYear)
            expect(newContext.selectedQuarter).toBe(context.selectedQuarter)
            expect(newContext.selectedMonth).toBe(context.selectedMonth)
            expect(newContext.selectedWeek).toBe(context.selectedWeek)
            expect(newContext.selectedWeekYear).toBe(context.selectedWeekYear)
            expect(newContext.exists('yearly')).toBe(context.exists('yearly'))
            expect(newContext.exists('quarterly')).toBe(context.exists('quarterly'))
            expect(newContext.exists('monthly')).toBe(context.exists('monthly'))
            expect(newContext.exists('weekly')).toBe(context.exists('weekly'))
        })
    })

    describe('hasSelection', () => {
        test('should return false for default state', () => {
            expect(context.hasSelection()).toBe(false)
        })

        test('should return false when only year is set (default)', () => {
            // Year is always set by default, so hasSelection should be false
            expect(context.hasSelection()).toBe(false)
        })

        test('should return true when quarter is selected', () => {
            const date = new Date(2024, 3, 1)
            context.updateForPeriod('quarterly', date, true)
            expect(context.hasSelection()).toBe(true)
        })

        test('should return true when month is selected', () => {
            const date = new Date(2024, 5, 1)
            context.updateForPeriod('monthly', date, true)
            expect(context.hasSelection()).toBe(true)
        })

        test('should return true when week is selected', () => {
            const date = new Date(2024, 5, 10)
            context.updateForPeriod('weekly', date, true)
            expect(context.hasSelection()).toBe(true)
        })
    })

    describe('updateForPeriod clears child contexts', () => {
        test('updating year should clear quarter, month, week', () => {
            // Set up child selections first
            context.updateParentContext('quarterly', new Date(2024, 3, 1), true)
            context.updateParentContext('monthly', new Date(2024, 3, 1), true)
            context.updateParentContext('weekly', new Date(2024, 3, 8), true)

            expect(context.selectedQuarter).not.toBeNull()
            expect(context.selectedMonth).not.toBeNull()
            expect(context.selectedWeek).not.toBeNull()

            // Now update year - should clear all children
            context.updateForPeriod('yearly', new Date(2023, 0, 1), true)

            expect(context.selectedYear).toBe(2023)
            expect(context.selectedQuarter).toBeNull()
            expect(context.selectedMonth).toBeNull()
            expect(context.selectedWeek).toBeNull()
        })

        test('updating quarter should clear month and week but not year', () => {
            context.updateParentContext('yearly', new Date(2024, 0, 1), true)
            context.updateParentContext('monthly', new Date(2024, 5, 1), true)
            context.updateParentContext('weekly', new Date(2024, 5, 10), true)

            // Update quarter
            context.updateForPeriod('quarterly', new Date(2024, 0, 1), true) // Q1

            expect(context.selectedYear).toBe(2024) // Preserved
            expect(context.selectedQuarter).toBe(1)
            expect(context.selectedMonth).toBeNull() // Cleared
            expect(context.selectedWeek).toBeNull() // Cleared
        })

        test('updating month should clear week but not year or quarter', () => {
            context.updateParentContext('yearly', new Date(2024, 0, 1), true)
            context.updateParentContext('quarterly', new Date(2024, 0, 1), true)
            context.updateParentContext('weekly', new Date(2024, 0, 8), true)

            // Update month
            context.updateForPeriod('monthly', new Date(2024, 1, 1), true) // February

            expect(context.selectedYear).toBe(2024) // Preserved
            expect(context.selectedQuarter).toBe(1) // Preserved
            expect(context.selectedMonth).toBe(1)
            expect(context.selectedWeek).toBeNull() // Cleared
        })
    })

    describe('updateParentContext does not clear child contexts', () => {
        test('updating parent year should not clear children', () => {
            context.updateParentContext('quarterly', new Date(2024, 3, 1), true)
            context.updateParentContext('monthly', new Date(2024, 3, 1), true)
            context.updateParentContext('weekly', new Date(2024, 3, 8), true)

            const quarterBefore = context.selectedQuarter
            const monthBefore = context.selectedMonth
            const weekBefore = context.selectedWeek

            // Update year as parent - should NOT clear children
            context.updateParentContext('yearly', new Date(2024, 0, 1), true)

            expect(context.selectedQuarter).toBe(quarterBefore)
            expect(context.selectedMonth).toBe(monthBefore)
            expect(context.selectedWeek).toBe(weekBefore)
        })
    })
})
