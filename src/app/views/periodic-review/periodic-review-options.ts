import type { SliderOption, ToggleOption, ViewOption } from 'obsidian'

export function getPeriodicReviewViewOptions(): ViewOption[] {
    return [
        {
            type: 'toggle',
            key: 'showDaily',
            displayName: 'Show daily column',
            default: true
        } as ToggleOption,
        {
            type: 'toggle',
            key: 'showWeekly',
            displayName: 'Show weekly column',
            default: true
        } as ToggleOption,
        {
            type: 'toggle',
            key: 'showMonthly',
            displayName: 'Show monthly column',
            default: true
        } as ToggleOption,
        {
            type: 'toggle',
            key: 'showQuarterly',
            displayName: 'Show quarterly column',
            default: false
        } as ToggleOption,
        {
            type: 'toggle',
            key: 'showYearly',
            displayName: 'Show yearly column',
            default: false
        } as ToggleOption,
        {
            type: 'slider',
            key: 'columnWidth',
            displayName: 'Column width',
            min: 300,
            max: 600,
            step: 50,
            default: 400
        } as SliderOption
    ]
}
