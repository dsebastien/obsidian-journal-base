/**
 * Period types for periodic notes
 */
export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export const PERIOD_TYPES: readonly PeriodType[] = [
    'daily',
    'weekly',
    'monthly',
    'quarterly',
    'yearly'
] as const
