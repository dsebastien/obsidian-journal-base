import { describe, expect, test } from 'bun:test'
import type { TFile } from 'obsidian'
import type { PeriodicNoteConfig } from '../../types'
import { PeriodCache } from './period-cache'

interface MockTFile {
    path: string
    name: string
    basename: string
    extension: string
}

function mockFile(basename: string): TFile {
    const file: MockTFile = {
        path: `Diary/${basename}.md`,
        name: `${basename}.md`,
        basename,
        extension: 'md'
    }
    // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast -- structural mock for unit tests; extractDate only reads file.basename
    return file as unknown as TFile
}

function config(format: string): PeriodicNoteConfig {
    return { enabled: true, folder: 'Diary', format, template: '' }
}

describe('PeriodCache.extractDate', () => {
    test('caches the parsed date for the same file and format', () => {
        const cache = new PeriodCache()
        const file = mockFile('2026-06-27-Saturday')

        const first = cache.extractDate(file, config('YYYY-MM-DD-dddd'))
        const second = cache.extractDate(file, config('YYYY-MM-DD-dddd'))

        expect(first).not.toBeNull()
        // Same instance proves the second call was a cache hit, not a recompute.
        expect(second).toBe(first)
    })

    // Issue #42 — the residual "still grey after navigating away and back" cause.
    // The cache used to be keyed on the TFile alone, so a null parsed under one format
    // stuck for the file's lifetime even after the effective format changed (e.g. a
    // syncFromPeriodicNotesPlugin update). It must re-derive when the format changes.
    test('does not serve a stale date when the format changes', () => {
        const cache = new PeriodCache()
        const file = mockFile('2026-06-June')

        // Under a day format this basename has no day → null, and null gets cached.
        const asDaily = cache.extractDate(file, config('YYYY-MM-DD'))
        expect(asDaily).toBeNull()

        // Switching to the month-name format must recompute, not return the cached null.
        const asMonthly = cache.extractDate(file, config('YYYY-MM-MMMM'))
        expect(asMonthly).not.toBeNull()
        expect(asMonthly?.getFullYear()).toBe(2026)
        expect(asMonthly?.getMonth()).toBe(5) // June
    })

    // Obsidian mutates the same TFile instance on rename; the cache must notice the
    // new basename rather than replay the previous date.
    test('does not serve a stale date when the file is renamed', () => {
        const cache = new PeriodCache()
        const file = mockFile('2026-06-27-Saturday')
        const cfg = config('YYYY-MM-DD-dddd')

        const before = cache.extractDate(file, cfg)
        expect(before?.getDate()).toBe(27)

        // Simulate a rename: same TFile object, new basename.
        ;(file as unknown as MockTFile).basename = '2026-06-28-Sunday'
        const after = cache.extractDate(file, cfg)
        expect(after?.getDate()).toBe(28)
    })
})
