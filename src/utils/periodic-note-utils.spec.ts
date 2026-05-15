import { describe, expect, test } from 'bun:test'
import type { TFile } from 'obsidian'
import { detectPeriodType, getFilenameFormat } from './periodic-note-utils'
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
