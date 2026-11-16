import { describe, expect, test } from 'bun:test'
import { TFile, type BasesEntry } from 'obsidian'
import {
    createPeriodTypeDetector,
    detectPeriodType,
    extractDateFromNote,
    filterEntriesByPeriodType,
    getFilenameFormat,
    groupEntriesByPeriodType,
    sortEntriesByDate
} from './periodic-note-utils'
import type { PluginSettings } from '../app/types'
import { DEFAULT_SETTINGS } from '../app/types'

// A real (mock-module) TFile instance rather than a structural object put through
// a cast: `obsidianmd/no-tfile-tfolder-cast` forbids the cast, and the reviewer's
// ruleset also forbids disabling that rule inline.
function mockFile(path: string): TFile {
    const basename = path.split('/').pop()?.replace(/\.md$/, '') ?? ''
    const file = new TFile()
    file.path = path
    file.name = `${basename}.md`
    file.basename = basename
    file.extension = 'md'
    return file
}

function buildSettings(overrides: Partial<PluginSettings>): PluginSettings {
    return {
        ...DEFAULT_SETTINGS,
        ...overrides
    }
}

describe('getFilenameFormat', () => {
    test('returns format unchanged when there is no path separator', () => {
        expect(getFilenameFormat('YYYY-MM-DD')).toBe('YYYY-MM-DD')
        expect(getFilenameFormat('gggg-[W]ww')).toBe('gggg-[W]ww')
    })

    test('returns portion after the last separator', () => {
        expect(getFilenameFormat('YYYY/WW/YYYY-MM-DD')).toBe('YYYY-MM-DD')
        expect(getFilenameFormat('YYYY/gggg-[W]ww')).toBe('gggg-[W]ww')
    })

    test('falls back to full format when trailing separator leaves no filename', () => {
        expect(getFilenameFormat('YYYY-MM-DD/')).toBe('YYYY-MM-DD/')
    })
})

describe('detectPeriodType', () => {
    test('returns the period type matching the configured folder', () => {
        const settings = buildSettings({
            daily: {
                enabled: true,
                folder: 'Journal/Daily',
                format: 'YYYY-MM-DD',
                template: ''
            },
            weekly: {
                enabled: true,
                folder: 'Journal/Weekly',
                format: 'gggg-[W]ww',
                template: ''
            }
        })

        expect(detectPeriodType(mockFile('Journal/Daily/2026-05-15.md'), settings)).toBe('daily')
        expect(detectPeriodType(mockFile('Journal/Weekly/2026-W20.md'), settings)).toBe('weekly')
    })

    test('returns null when the file is outside every configured folder', () => {
        const settings = buildSettings({
            daily: { enabled: true, folder: 'Daily', format: 'YYYY-MM-DD', template: '' }
        })

        expect(detectPeriodType(mockFile('Inbox/note.md'), settings)).toBeNull()
    })

    test('ignores period types that are disabled or have no folder', () => {
        const settings = buildSettings({
            daily: { enabled: false, folder: 'Journal/Daily', format: 'YYYY-MM-DD', template: '' },
            weekly: { enabled: true, folder: '', format: 'gggg-[W]ww', template: '' }
        })

        expect(detectPeriodType(mockFile('Journal/Daily/2026-05-15.md'), settings)).toBeNull()
        expect(detectPeriodType(mockFile('Journal/Weekly/2026-W20.md'), settings)).toBeNull()
    })

    // Issue #44 — non-regression
    // https://github.com/dsebastien/obsidian-journal-base/issues/44
    describe('issue #44 — several period types sharing one folder', () => {
        const sharedFolderSettings = buildSettings({
            daily: {
                enabled: true,
                folder: 'DAILY',
                format: 'YYYY/YYYY.Q/YYYY-MM-DD',
                template: ''
            },
            weekly: {
                enabled: true,
                folder: 'DAILY',
                format: 'YYYY/gggg-[W]ww',
                template: ''
            }
        })

        test('weekly notes are recognised when daily and weekly share a folder', () => {
            expect(detectPeriodType(mockFile('DAILY/2026/2026-W35.md'), sharedFolderSettings)).toBe(
                'weekly'
            )
        })

        test('daily notes keep their type when daily and weekly share a folder', () => {
            expect(
                detectPeriodType(mockFile('DAILY/2026/2026.3/2026-08-31.md'), sharedFolderSettings)
            ).toBe('daily')
        })

        test('a name matching no configured format falls back to the folder match', () => {
            expect(detectPeriodType(mockFile('DAILY/Scratch.md'), sharedFolderSettings)).toBe(
                'daily'
            )
        })

        test('a nested folder still wins over a same-folder format match', () => {
            const settings = buildSettings({
                daily: { enabled: true, folder: 'Journal', format: 'YYYY-MM-DD', template: '' },
                weekly: {
                    enabled: true,
                    folder: 'Journal/Weekly',
                    format: 'gggg-[W]ww',
                    template: ''
                }
            })

            // The daily format would round-trip this name, but the weekly folder is
            // more specific, so folder specificity still decides.
            expect(detectPeriodType(mockFile('Journal/Weekly/2026-W11.md'), settings)).toBe(
                'weekly'
            )
        })
    })

    // Issue #41 — non-regression
    // https://github.com/dsebastien/obsidian-journal-base/issues/41
    describe('issue #41 — nested folder prefixes', () => {
        test('weekly notes are not misclassified as daily when weekly folder is nested under daily folder', () => {
            const settings = buildSettings({
                daily: {
                    enabled: true,
                    folder: 'Journal',
                    format: 'YYYY-MM-DD',
                    template: ''
                },
                weekly: {
                    enabled: true,
                    folder: 'Journal/Weekly',
                    format: 'gggg-[W]ww',
                    template: ''
                }
            })

            expect(detectPeriodType(mockFile('Journal/Weekly/2026-W11.md'), settings)).toBe(
                'weekly'
            )
            expect(detectPeriodType(mockFile('Journal/2026-05-15.md'), settings)).toBe('daily')
        })

        test('most-specific folder wins regardless of period-type ordering', () => {
            const settings = buildSettings({
                daily: { enabled: true, folder: 'a', format: 'YYYY-MM-DD', template: '' },
                weekly: { enabled: true, folder: 'a/b', format: 'gggg-[W]ww', template: '' },
                monthly: { enabled: true, folder: 'a/b/c', format: 'YYYY-MM', template: '' },
                quarterly: { enabled: true, folder: 'a/b/c/d', format: 'YYYY-[Q]Q', template: '' },
                yearly: { enabled: true, folder: 'a/b/c/d/e', format: 'YYYY', template: '' }
            })

            expect(detectPeriodType(mockFile('a/b/c/d/e/2026.md'), settings)).toBe('yearly')
            expect(detectPeriodType(mockFile('a/b/c/d/2026-Q1.md'), settings)).toBe('quarterly')
            expect(detectPeriodType(mockFile('a/b/c/2026-01.md'), settings)).toBe('monthly')
            expect(detectPeriodType(mockFile('a/b/2026-W01.md'), settings)).toBe('weekly')
            expect(detectPeriodType(mockFile('a/2026-01-01.md'), settings)).toBe('daily')
        })

        test('startsWith without path-segment boundary does not produce false matches', () => {
            const settings = buildSettings({
                daily: { enabled: true, folder: 'Journal', format: 'YYYY-MM-DD', template: '' }
            })

            // `JournalArchive/...` starts with `Journal` but is a different folder.
            expect(detectPeriodType(mockFile('JournalArchive/2024-01-01.md'), settings)).toBeNull()
        })

        test('files placed directly at the configured folder root are still detected', () => {
            const settings = buildSettings({
                weekly: {
                    enabled: true,
                    folder: 'Journal/Weekly',
                    format: 'gggg-[W]ww',
                    template: ''
                }
            })

            expect(detectPeriodType(mockFile('Journal/Weekly/2026-W11.md'), settings)).toBe(
                'weekly'
            )
        })
    })
})

// Issue #42 — nested folder paths + custom formats
// https://github.com/dsebastien/obsidian-journal-base/issues/42
// The reporter's daily notes live at Diary/01 Daily/{{YYYY}}/{{MM-MMMM}}/ with a
// weekday-suffixed filename. detectPeriodType matches on folder alone, and
// extractDateFromNote must reduce the path-prefixed format to just the filename
// portion and still parse the weekday-suffixed basename.
describe('extractDateFromNote — issue #42 nested folders and custom formats', () => {
    test('detects a daily note in a deeply nested folder with a space in the folder name', () => {
        const settings = buildSettings({
            daily: {
                enabled: true,
                folder: 'Diary/01 Daily',
                format: 'Diary/01 Daily/YYYY/MM-MMMM/YYYY-MM-DD-dddd',
                template: ''
            }
        })
        const file = mockFile('Diary/01 Daily/2026/06-June/2026-06-27-Saturday.md')

        expect(detectPeriodType(file, settings)).toBe('daily')

        const date = extractDateFromNote(file, settings.daily)
        expect(date).not.toBeNull()
        expect(date?.getFullYear()).toBe(2026)
        expect(date?.getMonth()).toBe(5) // June
        expect(date?.getDate()).toBe(27)
    })

    test('reduces a path-prefixed format to its filename portion before parsing', () => {
        // getFilenameFormat drops the folder tokens; only YYYY-MM-DD-dddd is matched.
        expect(getFilenameFormat('Diary/01 Daily/YYYY/MM-MMMM/YYYY-MM-DD-dddd')).toBe(
            'YYYY-MM-DD-dddd'
        )
    })

    test('detects a monthly note using a month-name subfolder (YYYY-MM-MMMM)', () => {
        const config = {
            enabled: true,
            folder: 'Diary/02 Monthly',
            format: 'Diary/02 Monthly/YYYY/YYYY-MM-MMMM',
            template: ''
        }
        const file = mockFile('Diary/02 Monthly/2026/2026-06-June.md')

        const date = extractDateFromNote(file, config)
        expect(date).not.toBeNull()
        expect(date?.getFullYear()).toBe(2026)
        expect(date?.getMonth()).toBe(5) // June
    })
})

// Performance pass of 2026-11-16: a base with a few thousand periodic notes is
// classified and sorted on every data update. These helpers must give the same
// results as the per-file functions, with less work.
describe('classifying and sorting many entries', () => {
    const settings = buildSettings({
        daily: { enabled: true, folder: 'Journal', format: 'YYYY-MM-DD', template: '' },
        weekly: { enabled: true, folder: 'Journal/Weekly', format: 'gggg-[W]ww', template: '' },
        monthly: { enabled: true, folder: 'Journal', format: 'YYYY-MM', template: '' },
        quarterly: {
            enabled: false,
            folder: 'Journal/Quarterly',
            format: 'YYYY-[Q]Q',
            template: ''
        }
    })

    function entry(path: string): BasesEntry {
        return { file: mockFile(path) } as unknown as BasesEntry
    }

    const paths = [
        'Journal/2026-05-15.md',
        'Journal/Weekly/2026-W20.md',
        'Journal/2026-05.md',
        'Inbox/note.md',
        'Journal/Quarterly/2026-Q2.md',
        'Journal/2026-05-14.md',
        'Journal/Scratch.md',
        'JournalArchive/2024-01-01.md'
    ]

    test('createPeriodTypeDetector gives the result of detectPeriodType for every file', () => {
        const detect = createPeriodTypeDetector(settings)

        for (const path of paths) {
            expect(detect(mockFile(path))).toBe(detectPeriodType(mockFile(path), settings))
        }
    })

    test('groupEntriesByPeriodType gives the groups of filterEntriesByPeriodType', () => {
        const entries = paths.map(entry)
        const groups = groupEntriesByPeriodType(entries, settings)

        for (const periodType of ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const) {
            expect(groups.get(periodType) ?? []).toEqual(
                filterEntriesByPeriodType(entries, periodType, settings)
            )
        }
        // A file that matches no enabled period type is in no group
        const grouped = [...groups.values()].flat().map((e) => e.file.path)
        expect(grouped).not.toContain('Inbox/note.md')
        expect(grouped).not.toContain('JournalArchive/2024-01-01.md')
    })

    describe('sortEntriesByDate', () => {
        const names = [
            '2026-03-01',
            'not-a-date',
            '2026-01-15',
            '2026-12-31',
            'draft',
            '2026-01-15'
        ]
        const entries = names.map((name, index) => entry(`Journal/${index}/${name}.md`))
        const basenames = (sorted: BasesEntry[]): string[] => sorted.map((e) => e.file.basename)

        test('sorts newest first by default, entries without a date last', () => {
            expect(basenames(sortEntriesByDate(entries, settings.daily))).toEqual([
                '2026-12-31',
                '2026-03-01',
                '2026-01-15',
                '2026-01-15',
                'not-a-date',
                'draft'
            ])
        })

        test('sorts oldest first when ascending, entries without a date first', () => {
            expect(basenames(sortEntriesByDate(entries, settings.daily, true))).toEqual([
                'not-a-date',
                'draft',
                '2026-01-15',
                '2026-01-15',
                '2026-03-01',
                '2026-12-31'
            ])
        })

        test('keeps the input order of entries with the same date, and does not change the input', () => {
            const sorted = sortEntriesByDate(entries, settings.daily)

            expect(sorted[2]).toBe(entries[2] as BasesEntry)
            expect(sorted[3]).toBe(entries[5] as BasesEntry)
            expect(basenames(entries)).toEqual(names)
        })

        test('reads the date of each entry once', () => {
            const many = Array.from({ length: 200 }, (_, index) =>
                entry(`Journal/2026-01-${String((index % 28) + 1).padStart(2, '0')}.md`)
            )
            let reads = 0

            sortEntriesByDate(many, settings.daily, false, (file, config) => {
                reads++
                return extractDateFromNote(file, config)
            })

            expect(reads).toBe(many.length)
        })
    })
})
