import { describe, expect, test } from 'bun:test'
import type { PeriodType } from '../../types'
import { getColumnFoldedConfigKey } from './periodic-review.constants'

describe('getColumnFoldedConfigKey', () => {
    test('returns a stable per-period key', () => {
        // These keys are persisted in users' Base files — changing them silently
        // drops remembered column state, so pin the exact format.
        expect(getColumnFoldedConfigKey('daily')).toBe('folded_daily')
        expect(getColumnFoldedConfigKey('weekly')).toBe('folded_weekly')
        expect(getColumnFoldedConfigKey('monthly')).toBe('folded_monthly')
        expect(getColumnFoldedConfigKey('quarterly')).toBe('folded_quarterly')
        expect(getColumnFoldedConfigKey('yearly')).toBe('folded_yearly')
    })

    test('produces a distinct key per period type', () => {
        const types: PeriodType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']
        const keys = types.map(getColumnFoldedConfigKey)
        expect(new Set(keys).size).toBe(types.length)
    })
})
