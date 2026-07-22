import { describe, expect, test } from 'bun:test'
import type { TFile } from 'obsidian'
import { detectPeriodType, extractDateFromNote, getFilenameFormat } from './periodic-note-utils'
import type { PluginSettings } from '../app/types'
import { DEFAULT_SETTINGS } from '../app/types'

interface MockTFile {
    path: string
    name: string
    basename: string
    extension: string
}

function mockFile(path: string): TFile {
    const basename = path.split('/').pop()?.replace(/\.md$/, '') ?? ''
    const file: MockTFile = {
        path,
        name: `${basename}.md`,
        basename,
        extension: 'md'
    }
    // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast -- structural mock for unit tests; detectPeriodType only reads file.path
    return file as unknown as TFile
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
