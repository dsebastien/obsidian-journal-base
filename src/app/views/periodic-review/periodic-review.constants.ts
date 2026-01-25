import type { PeriodType } from '../../types'

export const PERIODIC_REVIEW_VIEW_TYPE = 'periodic-review'

/**
 * Period types ordered from smallest to largest granularity.
 * Used for column ordering and hierarchy traversal.
 */
export const PERIOD_TYPE_ORDER: readonly PeriodType[] = [
    'daily',
    'weekly',
    'monthly',
    'quarterly',
    'yearly'
] as const

/**
 * Human-readable labels for period types.
 */
export const PERIOD_TYPE_LABELS: Readonly<Record<PeriodType, string>> = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly'
}

/**
 * Get child period types for a given period type.
 * Returns types from largest to smallest (e.g., quarterly -> monthly -> weekly -> daily).
 */
export function getChildPeriodTypes(periodType: PeriodType): PeriodType[] {
    const index = PERIOD_TYPE_ORDER.indexOf(periodType)
    if (index <= 0) return []
    return [...PERIOD_TYPE_ORDER.slice(0, index)].reverse()
}

/**
 * Get parent period types for a given period type.
 * Returns types from smallest to largest (e.g., weekly -> monthly -> quarterly -> yearly).
 */
export function getParentPeriodTypes(periodType: PeriodType): PeriodType[] {
    const index = PERIOD_TYPE_ORDER.indexOf(periodType)
    if (index < 0 || index >= PERIOD_TYPE_ORDER.length - 1) return []
    return [...PERIOD_TYPE_ORDER.slice(index + 1)]
}

/**
 * Get the immediate parent period type.
 * Returns undefined for 'yearly' which has no parent.
 */
export function getImmediateParent(periodType: PeriodType): PeriodType | undefined {
    const parents = getParentPeriodTypes(periodType)
    return parents[0]
}
