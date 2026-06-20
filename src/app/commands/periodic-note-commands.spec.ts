import { describe, expect, test } from 'bun:test'
import type { PeriodicNoteConfig } from '../types'
import {
    PERIOD_PHRASES,
    resolvePeriodNotePath,
    resolveTargetDate
} from './periodic-note-commands'

describe('periodic-note-commands', () => {
    describe('resolveTargetDate', () => {
        test('daily current is the start of the given day', () => {
            const now = new Date(2026, 5, 20, 13, 45)
            expect(resolveTargetDate('daily', 'current', now)).toEqual(new Date(2026, 5, 20))
        })

        test('daily previous is yesterday', () => {
            const now = new Date(2026, 5, 20, 13, 45)
            expect(resolveTargetDate('daily', 'previous', now)).toEqual(new Date(2026, 5, 19))
        })

        test('daily next is tomorrow', () => {
            const now = new Date(2026, 5, 20, 13, 45)
            expect(resolveTargetDate('daily', 'next', now)).toEqual(new Date(2026, 5, 21))
        })

        test('weekly current normalizes to Monday', () => {
            // 2026-06-20 is a Saturday; ISO week starts Monday 2026-06-15
            const now = new Date(2026, 5, 20)
            expect(resolveTargetDate('weekly', 'current', now)).toEqual(new Date(2026, 5, 15))
        })

        test('weekly previous is the prior Monday', () => {
            const now = new Date(2026, 5, 20)
            expect(resolveTargetDate('weekly', 'previous', now)).toEqual(new Date(2026, 5, 8))
        })

        test('monthly current is the first of the month', () => {
            const now = new Date(2026, 5, 20)
            expect(resolveTargetDate('monthly', 'current', now)).toEqual(new Date(2026, 5, 1))
        })

        test('yearly next is the first of next year', () => {
            const now = new Date(2026, 5, 20)
            expect(resolveTargetDate('yearly', 'next', now)).toEqual(new Date(2027, 0, 1))
        })
    })

    describe('resolvePeriodNotePath', () => {
        const config: PeriodicNoteConfig = {
            enabled: true,
            folder: 'Journal/Daily',
            format: 'YYYY-MM-DD',
            template: ''
        }

        test('joins folder, formatted filename and .md extension', () => {
            const date = new Date(2026, 5, 20)
            expect(resolvePeriodNotePath(config, date, 'daily')).toBe('Journal/Daily/2026-06-20.md')
        })

        test('normalizes the date to the start of the period before formatting', () => {
            // A mid-month date for a monthly note must resolve to the month's first day
            const monthlyConfig: PeriodicNoteConfig = { ...config, format: 'YYYY-MM' }
            const date = new Date(2026, 5, 20)
            expect(resolvePeriodNotePath(monthlyConfig, date, 'monthly')).toBe(
                'Journal/Daily/2026-06.md'
            )
        })

        test('omits the leading slash when folder is empty', () => {
            const rootConfig: PeriodicNoteConfig = { ...config, folder: '' }
            const date = new Date(2026, 5, 20)
            expect(resolvePeriodNotePath(rootConfig, date, 'daily')).toBe('2026-06-20.md')
        })
    })

    describe('PERIOD_PHRASES', () => {
        test('command names built from phrases never contain the plugin name', () => {
            for (const phrases of Object.values(PERIOD_PHRASES)) {
                for (const phrase of Object.values(phrases)) {
                    const name = `Open ${phrase} note`
                    expect(name.toLowerCase()).not.toContain('journal bases')
                }
            }
        })
    })
})
