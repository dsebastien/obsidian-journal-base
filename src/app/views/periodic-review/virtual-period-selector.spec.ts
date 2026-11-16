import { describe, expect, test } from 'bun:test'
import { TFile, type BasesEntry } from 'obsidian'
import { haveSameRows, type VirtualPeriodItem } from './virtual-period-selector'

function entry(path: string): BasesEntry {
    const file = new TFile()
    file.path = path
    return { file } as unknown as BasesEntry
}

function item(day: number, overrides: Partial<VirtualPeriodItem> = {}): VirtualPeriodItem {
    const label = `2026-01-${String(day).padStart(2, '0')}`
    return {
        date: new Date(2026, 0, day),
        label,
        entry: entry(`Journal/${label}.md`),
        isMissing: false,
        isCurrent: false,
        isDone: false,
        ...overrides
    }
}

describe('haveSameRows', () => {
    test('is true for the same rows built from new objects', () => {
        // Each data update builds new items, and Bases can give new entry objects
        expect(haveSameRows([item(2), item(1)], [item(2), item(1)])).toBe(true)
        expect(haveSameRows([], [])).toBe(true)
    })

    test('is false when a row is added or removed', () => {
        expect(haveSameRows([item(2), item(1)], [item(3), item(2), item(1)])).toBe(false)
        expect(haveSameRows([item(2), item(1)], [item(2)])).toBe(false)
    })

    test('is false when the order changes', () => {
        expect(haveSameRows([item(2), item(1)], [item(1), item(2)])).toBe(false)
    })

    test('is false when what a row shows changes', () => {
        const rows = [item(1)]

        expect(haveSameRows(rows, [item(1, { isDone: true })])).toBe(false)
        expect(haveSameRows(rows, [item(1, { isCurrent: true })])).toBe(false)
        expect(haveSameRows(rows, [item(1, { label: '2026-01-01 (Thursday)' })])).toBe(false)
    })

    test('is false when a missing period gets its note, or a note goes away', () => {
        const missing = item(1, { entry: null, isMissing: true })

        expect(haveSameRows([missing], [item(1)])).toBe(false)
        expect(haveSameRows([item(1)], [missing])).toBe(false)
    })

    test('is false when the note of a row is another file', () => {
        const moved = item(1, { entry: entry('Archive/2026-01-01.md') })

        expect(haveSameRows([item(1)], [moved])).toBe(false)
    })
})
