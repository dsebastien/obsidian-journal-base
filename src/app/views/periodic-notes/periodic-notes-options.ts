import type { BasesAllOptions } from 'obsidian'
import { DEFAULT_FUTURE_PERIODS } from './periodic-notes.constants'

export function getPeriodicNotesViewOptions(): BasesAllOptions[] {
    return [
        {
            type: 'dropdown',
            key: 'mode',
            displayName: 'Period type',
            default: 'daily',
            options: {
                daily: 'Daily',
                weekly: 'Weekly',
                monthly: 'Monthly',
                quarterly: 'Quarterly',
                yearly: 'Yearly'
            }
        },
        {
            type: 'slider',
            key: 'futurePeriods',
            displayName: 'Future periods to show',
            min: 0,
            max: 12,
            step: 1,
            default: DEFAULT_FUTURE_PERIODS
        },
        {
            type: 'toggle',
            key: 'expandFirst',
            displayName: 'Expand first card',
            default: true
        },
        {
            type: 'toggle',
            key: 'showMissing',
            displayName: 'Show missing periods',
            default: true
        }
    ]
}
