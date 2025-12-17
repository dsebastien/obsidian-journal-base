import type { DropdownOption, SliderOption, ToggleOption, ViewOption } from 'obsidian'
import { DEFAULT_FUTURE_PERIODS } from './periodic-notes.constants'

export function getPeriodicNotesViewOptions(): ViewOption[] {
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
        } as DropdownOption,
        {
            type: 'slider',
            key: 'futurePeriods',
            displayName: 'Future periods to show',
            min: 0,
            max: 12,
            step: 1,
            default: DEFAULT_FUTURE_PERIODS
        } as SliderOption,
        {
            type: 'toggle',
            key: 'expandFirst',
            displayName: 'Expand first card',
            default: true
        } as ToggleOption,
        {
            type: 'toggle',
            key: 'showMissing',
            displayName: 'Show missing periods',
            default: true
        } as ToggleOption
    ]
}
