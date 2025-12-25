import type { PeriodType } from '../../types'
import {
    getYear,
    getMonth,
    getQuarter,
    getWeek,
    getISOWeekYear,
    getEndOfPeriod,
    doesPeriodOverlapParent
} from '../../../utils/date-utils'

/**
 * Snapshot of the selection context state for save/restore operations.
 */
export interface SelectionContextSnapshot {
    selectedYear: number
    selectedQuarter: number | null
    selectedMonth: number | null
    selectedWeek: number | null
    selectedWeekYear: number | null
    yearExists: boolean
    quarterExists: boolean
    monthExists: boolean
    weekExists: boolean
}

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
                // Also update year from the date (implicit parent)
                this._selectedYear = getYear(date)
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
                // Also update parent values from the date
                this._selectedYear = getYear(date)
                this._selectedQuarter = getQuarter(date)
                this._selectedMonth = getMonth(date)
                this._monthExists = exists
                // Clear child contexts
                this._selectedWeek = null
                this._selectedWeekYear = null
                this._weekExists = false
                break

            case 'weekly': {
                // Check if the week overlaps with the currently selected parent period
                // If so, preserve the parent context to avoid unexpected selection changes
                // This handles weeks that span month/quarter/year boundaries
                const weekDate = date

                // Check overlap from most specific (month) to least specific (year)
                if (this._selectedMonth !== null) {
                    const monthStart = new Date(this._selectedYear, this._selectedMonth, 1)
                    const monthEnd = getEndOfPeriod(monthStart, 'monthly')
                    if (doesPeriodOverlapParent(weekDate, 'weekly', monthStart, monthEnd)) {
                        // Week overlaps current month - only update week selection
                        this._selectedWeek = getWeek(weekDate)
                        this._selectedWeekYear = getISOWeekYear(weekDate)
                        this._weekExists = exists
                        break
                    }
                }

                if (this._selectedQuarter !== null) {
                    const quarterMonth = (this._selectedQuarter - 1) * 3
                    const quarterStart = new Date(this._selectedYear, quarterMonth, 1)
                    const quarterEnd = getEndOfPeriod(quarterStart, 'quarterly')
                    if (doesPeriodOverlapParent(weekDate, 'weekly', quarterStart, quarterEnd)) {
                        // Week overlaps current quarter - update month and week, preserve quarter/year
                        this._selectedMonth = getMonth(weekDate)
                        this._selectedWeek = getWeek(weekDate)
                        this._selectedWeekYear = getISOWeekYear(weekDate)
                        this._weekExists = exists
                        break
                    }
                }

                // No overlap with current selection or no selection - update all parent values
                this._selectedYear = getYear(weekDate)
                this._selectedQuarter = getQuarter(weekDate)
                this._selectedMonth = getMonth(weekDate)
                this._selectedWeek = getWeek(weekDate)
                this._selectedWeekYear = getISOWeekYear(weekDate)
                this._weekExists = exists
                break
            }

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

    /**
     * Create a snapshot of the current selection state.
     * Use this before data updates to preserve user selections.
     */
    saveSnapshot(): SelectionContextSnapshot {
        return {
            selectedYear: this._selectedYear,
            selectedQuarter: this._selectedQuarter,
            selectedMonth: this._selectedMonth,
            selectedWeek: this._selectedWeek,
            selectedWeekYear: this._selectedWeekYear,
            yearExists: this._yearExists,
            quarterExists: this._quarterExists,
            monthExists: this._monthExists,
            weekExists: this._weekExists
        }
    }

    /**
     * Restore selection state from a snapshot.
     * Used after data updates to maintain user selections.
     */
    restoreSnapshot(snapshot: SelectionContextSnapshot): void {
        this._selectedYear = snapshot.selectedYear
        this._selectedQuarter = snapshot.selectedQuarter
        this._selectedMonth = snapshot.selectedMonth
        this._selectedWeek = snapshot.selectedWeek
        this._selectedWeekYear = snapshot.selectedWeekYear
        this._yearExists = snapshot.yearExists
        this._quarterExists = snapshot.quarterExists
        this._monthExists = snapshot.monthExists
        this._weekExists = snapshot.weekExists
    }

    /**
     * Check if any selection has been made beyond the default year.
     */
    hasSelection(): boolean {
        return (
            this._selectedQuarter !== null ||
            this._selectedMonth !== null ||
            this._selectedWeek !== null
        )
    }
}
