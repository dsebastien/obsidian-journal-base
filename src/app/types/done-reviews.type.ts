import type { PeriodType } from './period-type.type'

/**
 * Tracks which periodic reviews have been marked as done.
 * Keys are formatted date strings based on the period's format setting:
 * - daily: "2025-10-10"
 * - weekly: "2025-W01"
 * - monthly: "2025-10"
 * - quarterly: "2025-Q4"
 * - yearly: "2025"
 */
export type DoneReviews = {
    [K in PeriodType]: Record<string, boolean>
}

export const DEFAULT_DONE_REVIEWS: DoneReviews = {
    daily: {},
    weekly: {},
    monthly: {},
    quarterly: {},
    yearly: {}
}
