import { describe, expect, test } from 'bun:test'
import { TFile, type BasesEntry } from 'obsidian'
import { DEFAULT_SETTINGS, type PeriodicNoteConfig, type PluginSettings } from '../../types'
import { PeriodCache } from './period-cache'

// A real (mock-module) TFile instance rather than a structural object put through
// a cast: `obsidianmd/no-tfile-tfolder-cast` forbids the cast, and the reviewer's
// ruleset also forbids disabling that rule inline.
function mockFile(basename: string): TFile {
    const file = new TFile()
    file.path = `Diary/${basename}.md`
    file.name = `${basename}.md`
    file.basename = basename
    file.extension = 'md'
    return file
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
        file.basename = '2026-06-28-Sunday'
        const after = cache.extractDate(file, cfg)
        expect(after?.getDate()).toBe(28)
    })
})

describe('PeriodCache.getEntriesByType', () => {
    const settings: PluginSettings = {
        ...DEFAULT_SETTINGS,
        daily: { enabled: true, folder: 'Diary', format: 'YYYY-MM-DD', template: '' },
        monthly: { enabled: true, folder: 'Months', format: 'YYYY-MM', template: '' }
    }

    function entryAt(path: string): BasesEntry {
        const file = mockFile(path.split('/').pop() ?? '')
        file.path = `${path}.md`
        return { file } as unknown as BasesEntry
    }

    const data = [
        entryAt('Diary/2026-06-01'),
        entryAt('Months/2026-05'),
        entryAt('Diary/2026-06-03'),
        entryAt('Inbox/note'),
        entryAt('Months/2026-06'),
        entryAt('Diary/2026-06-02')
    ]
    const basenames = (entries: BasesEntry[]): string[] => entries.map((e) => e.file.basename)

    test('returns the entries of one period type, newest first', () => {
        const cache = new PeriodCache()

        expect(basenames(cache.getEntriesByType(data, 'daily', settings, 1))).toEqual([
            '2026-06-03',
            '2026-06-02',
            '2026-06-01'
        ])
        expect(basenames(cache.getEntriesByType(data, 'monthly', settings, 1))).toEqual([
            '2026-06',
            '2026-05'
        ])
        expect(cache.getEntriesByType(data, 'weekly', settings, 1)).toEqual([])
    })

    test('returns the cached list for the same data version', () => {
        const cache = new PeriodCache()

        const first = cache.getEntriesByType(data, 'daily', settings, 1)
        expect(cache.getEntriesByType(data, 'daily', settings, 1)).toBe(first)
    })

    test('reads new data when the data version changes', () => {
        const cache = new PeriodCache()
        cache.getEntriesByType(data, 'daily', settings, 1)
        cache.getEntriesByType(data, 'monthly', settings, 1)

        const newer = [...data, entryAt('Diary/2026-06-04'), entryAt('Months/2026-07')]

        expect(basenames(cache.getEntriesByType(newer, 'daily', settings, 2))[0]).toBe('2026-06-04')
        expect(basenames(cache.getEntriesByType(newer, 'monthly', settings, 2))[0]).toBe('2026-07')
    })

    test('a new data version does not parse again the file names it already knows', () => {
        const cache = new PeriodCache()
        const formatDaily = settings.daily.format
        let formatReads = 0
        // The format is read once for each file name that is parsed
        const countingSettings: PluginSettings = {
            ...settings,
            daily: {
                ...settings.daily,
                get format(): string {
                    formatReads++
                    return formatDaily
                }
            }
        }

        cache.getEntriesByType(data, 'daily', countingSettings, 1)
        const readsOfFirstVersion = formatReads
        expect(readsOfFirstVersion).toBeGreaterThan(0)

        cache.getEntriesByType(data, 'daily', countingSettings, 2)
        const readsOfSecondVersion = formatReads - readsOfFirstVersion

        // Only the cache checks read the format now (one per entry), no parse
        expect(readsOfSecondVersion).toBeLessThan(readsOfFirstVersion)
    })
})
