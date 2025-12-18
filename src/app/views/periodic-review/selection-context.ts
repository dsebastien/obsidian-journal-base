import type { PeriodType } from '../../types'
import { getYear, getMonth, getQuarter, getWeek, getISOWeekYear } from '../../../utils/date-utils'

/**
 * Manages the selection context for the periodic review view.
 * Tracks which periods are selected and whether they have existing notes.
 */
export class SelectionContext {
    // Selected values
    private _selectedYear: number = new Date().getFullYear()
    private _selectedQuarter: number | null = null // 1-4 or null
    private _selectedMonth: number | null = null // 0-11 or null
    private _selectedWeek: number | null = null // ISO week number or null
    private _selectedWeekYear: number | null = null // ISO week year (can differ from calendar year)

    // Existence flags - whether the selected period has an existing note
    private _yearExists: boolean = false
    private _quarterExists: boolean = false
    private _monthExists: boolean = false
    private _weekExists: boolean = false

    // Getters
    get selectedYear(): number {
        return this._selectedYear
    }
    get selectedQuarter(): number | null {
        return this._selectedQuarter
    }
    get selectedMonth(): number | null {
        return this._selectedMonth
    }
    get selectedWeek(): number | null {
        return this._selectedWeek
    }
    get selectedWeekYear(): number | null {
        return this._selectedWeekYear
    }

    /**
     * Check if a period type's selected note exists.
     */
    exists(periodType: PeriodType): boolean {
        switch (periodType) {
            case 'yearly':
                return this._yearExists
            case 'quarterly':
                return this._quarterExists
            case 'monthly':
                return this._monthExists
            case 'weekly':
                return this._weekExists
            case 'daily':
                return true // Daily doesn't have children, existence not tracked
        }
    }

    /**
     * Set the existence flag for a period type.
     */
    setExists(periodType: PeriodType, exists: boolean): void {
        switch (periodType) {
            case 'yearly':
                this._yearExists = exists
                break
            case 'quarterly':
                this._quarterExists = exists
                break
            case 'monthly':
                this._monthExists = exists
                break
            case 'weekly':
                this._weekExists = exists
                break
            case 'daily':
                // Daily has no children, no need to track
                break
        }
    }

    /**
     * Update the context for a period type selection.
     * Also clears child contexts when a parent period changes.
     */
    updateForPeriod(periodType: PeriodType, date: Date, exists: boolean): void {
        switch (periodType) {
            case 'yearly':
                this._selectedYear = getYear(date)
                this._yearExists = exists
                // Clear child contexts
                this._selectedQuarter = null
                this._quarterExists = false
                this._selectedMonth = null
                this._monthExists = false
                this._selectedWeek = null
                this._selectedWeekYear = null
                this._weekExists = false
                break

            case 'quarterly':
                this._selectedQuarter = getQuarter(date)
                this._quarterExists = exists
                // Clear child contexts
                this._selectedMonth = null
                this._monthExists = false
                this._selectedWeek = null
                this._selectedWeekYear = null
                this._weekExists = false
                break

            case 'monthly':
                this._selectedMonth = getMonth(date)
                this._monthExists = exists
                // Clear child contexts
                this._selectedWeek = null
                this._selectedWeekYear = null
                this._weekExists = false
                break

            case 'weekly':
                this._selectedWeek = getWeek(date)
                this._selectedWeekYear = getISOWeekYear(date)
                this._weekExists = exists
                break

            case 'daily':
                // Daily has no child contexts
                break
        }
    }

    /**
     * Update context for a parent period without clearing child contexts.
     * Used when cascading upward from a child selection.
     */
    updateParentContext(periodType: PeriodType, date: Date, exists: boolean): void {
        switch (periodType) {
            case 'yearly':
                this._selectedYear = getYear(date)
                this._yearExists = exists
                break
            case 'quarterly':
                this._selectedQuarter = getQuarter(date)
                this._quarterExists = exists
                break
            case 'monthly':
                this._selectedMonth = getMonth(date)
                this._monthExists = exists
                break
            case 'weekly':
                this._selectedWeek = getWeek(date)
                this._selectedWeekYear = getISOWeekYear(date)
                this._weekExists = exists
                break
            case 'daily':
                break
        }
    }
}
