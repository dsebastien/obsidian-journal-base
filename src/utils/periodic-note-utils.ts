import type { TFile, BasesEntry } from 'obsidian'
import type { PluginSettings, PeriodType, PeriodicNoteConfig } from '../app/types'
import { parseDateFromFormat, formatDate } from './date-utils'

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
 * Check whether a file's basename is actually produced by a config's format.
 *
 * Parsing alone is too permissive: `2026-W35` parses under several patterns.
 * Round-tripping (parse, then re-format and compare) only accepts a basename
 * that the format could itself have generated, which is what makes two period
 * types sharing one folder distinguishable.
 */
function matchesFormat(basename: string, format: string): boolean {
    const filenameFormat = getFilenameFormat(format)
    const parsed = parseDateFromFormat(basename, filenameFormat)
    if (!parsed) return false

    try {
        return formatDate(parsed, filenameFormat) === basename
    } catch {
        return false
    }
}

/**
 * Detect the period type of a file based on its path.
 *
 * Matches the most specific (longest) configured folder first so a nested
 * weekly folder like `Journal/Weekly` is not shadowed by a parent daily
 * folder like `Journal`. Also enforces a path-segment boundary so
 * `JournalArchive/foo.md` is not treated as a child of `Journal`.
 *
 * Several period types may legitimately share one folder (e.g. daily and
 * weekly notes both under `Journal`, told apart by their formats). When that
 * happens the folder alone cannot decide, so the file's basename is matched
 * against each candidate's format and the one that actually produced the name
 * wins. Folder specificity still takes precedence, and a file whose name fits
 * no candidate format falls back to the most specific folder match so
 * previously detected notes keep their type.
 */
export function detectPeriodType(file: TFile, settings: PluginSettings): PeriodType | null {
    const candidates = (['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as PeriodType[])
        .map((periodType) => ({ periodType, config: settings[periodType] }))
        .filter(({ config }) => config.enabled && config.folder)
        .sort((a, b) => b.config.folder.length - a.config.folder.length)

    const folderMatches = candidates.filter(({ config }) =>
        isPathInFolder(file.path, config.folder)
    )

    if (folderMatches.length === 0) {
        return null
    }

    // Only the most specific folder competes: a nested folder still wins outright
    // over a parent one, so format matching is used solely to break ties between
    // period types configured with the very same folder.
    const bestFolderLength = folderMatches[0]!.config.folder.length
    const tied = folderMatches.filter(({ config }) => config.folder.length === bestFolderLength)

    if (tied.length > 1) {
        const formatMatch = tied.find(({ config }) => matchesFormat(file.basename, config.format))
        if (formatMatch) {
            return formatMatch.periodType
        }
    }

    return tied[0]!.periodType
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
