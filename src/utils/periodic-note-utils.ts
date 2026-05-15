import type { TFile, BasesEntry } from 'obsidian'
import type { PluginSettings, PeriodType, PeriodicNoteConfig } from '../app/types'
import { parseDateFromFormat } from './date-utils'

/**
 * Extract the filename portion of a format string.
 * Format strings may include path separators (e.g., 'YYYY/WW/YYYY-MM-DD').
 * This function returns only the portion after the last path separator.
 *
 * @example
 * getFilenameFormat('YYYY/WW/YYYY-MM-DD') // Returns 'YYYY-MM-DD'
 * getFilenameFormat('YYYY-MM-DD') // Returns 'YYYY-MM-DD'
 * getFilenameFormat('gggg-[W]ww') // Returns 'gggg-[W]ww'
 */
export function getFilenameFormat(format: string): string {
    const lastSeparatorIndex = format.lastIndexOf('/')
    if (lastSeparatorIndex === -1) {
        return format
    }
    const filenameFormat = format.slice(lastSeparatorIndex + 1)
    return filenameFormat || format
}

/**
 * Detect the period type of a file based on its path.
 *
 * Matches the most specific (longest) configured folder first so a nested
 * weekly folder like `Journal/Weekly` is not shadowed by a parent daily
 * folder like `Journal`. Also enforces a path-segment boundary so
 * `JournalArchive/foo.md` is not treated as a child of `Journal`.
 */
export function detectPeriodType(file: TFile, settings: PluginSettings): PeriodType | null {
    const candidates = (['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as PeriodType[])
        .map((periodType) => ({ periodType, config: settings[periodType] }))
        .filter(({ config }) => config.enabled && config.folder)
        .sort((a, b) => b.config.folder.length - a.config.folder.length)

    for (const { periodType, config } of candidates) {
        if (isPathInFolder(file.path, config.folder)) {
            return periodType
        }
    }

    return null
}

function isPathInFolder(filePath: string, folder: string): boolean {
    if (filePath === folder) return true
    return filePath.startsWith(folder.endsWith('/') ? folder : `${folder}/`)
}

/**
 * Extract the date from a periodic note file.
 * Uses only the filename portion of the format string to match against the file's basename.
 */
export function extractDateFromNote(file: TFile, config: PeriodicNoteConfig): Date | null {
    const basename = file.basename
    const filenameFormat = getFilenameFormat(config.format)
    return parseDateFromFormat(basename, filenameFormat)
}

/**
 * Filter entries to only include those matching a specific period type
 */
export function filterEntriesByPeriodType(
    entries: BasesEntry[],
    periodType: PeriodType,
    settings: PluginSettings
): BasesEntry[] {
    return entries.filter((entry) => detectPeriodType(entry.file, settings) === periodType)
}

/**
 * Sort entries by date (newest first by default)
 */
export function sortEntriesByDate(
    entries: BasesEntry[],
    config: PeriodicNoteConfig,
    ascending: boolean = false
): BasesEntry[] {
    return [...entries].sort((a, b) => {
        const dateA = extractDateFromNote(a.file, config)
        const dateB = extractDateFromNote(b.file, config)

        if (!dateA && !dateB) return 0
        if (!dateA) return ascending ? -1 : 1
        if (!dateB) return ascending ? 1 : -1

        const diff = dateA.getTime() - dateB.getTime()
        return ascending ? diff : -diff
    })
}

/**
 * Get enabled period types from settings
 */
export function getEnabledPeriodTypes(settings: PluginSettings): PeriodType[] {
    const periodTypes: PeriodType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']
    return periodTypes.filter((pt) => settings[pt].enabled)
}
