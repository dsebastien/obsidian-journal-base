import type { TFile, BasesEntry } from 'obsidian'
import type { PluginSettings } from '../app/types/plugin-settings.intf'
import type { PeriodType, PeriodicNoteConfig } from '../app/types/periodic-note.types'
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
 * Detect the period type of a file based on its path
 */
export function detectPeriodType(file: TFile, settings: PluginSettings): PeriodType | null {
    const periodTypes: PeriodType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']

    for (const periodType of periodTypes) {
        const config = settings[periodType]
        if (config.enabled && config.folder && file.path.startsWith(config.folder)) {
            return periodType
        }
    }

    return null
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
 * Group Base entries by period type
 */
export function groupEntriesByPeriod(
    entries: BasesEntry[],
    settings: PluginSettings
): Map<PeriodType, BasesEntry[]> {
    const groups = new Map<PeriodType, BasesEntry[]>()

    for (const entry of entries) {
        const periodType = detectPeriodType(entry.file, settings)
        if (periodType) {
            const existing = groups.get(periodType)
            if (existing) {
                existing.push(entry)
            } else {
                groups.set(periodType, [entry])
            }
        }
    }

    return groups
}

/**
 * Get the expected file path for a periodic note
 */
export function getExpectedFilePath(date: Date, config: PeriodicNoteConfig): string {
    const filename = formatDate(date, config.format)
    return `${config.folder}/${filename}.md`
}

/**
 * Get the expected filename (without extension) for a periodic note
 */
export function getExpectedFilename(date: Date, config: PeriodicNoteConfig): string {
    return formatDate(date, config.format)
}

/**
 * Check if a file matches the expected path pattern for a period type
 */
export function isValidPeriodicNote(file: TFile, config: PeriodicNoteConfig): boolean {
    // Check if in correct folder
    if (!file.path.startsWith(config.folder)) {
        return false
    }

    // Check if filename matches format (can be parsed back)
    const filenameFormat = getFilenameFormat(config.format)
    const date = parseDateFromFormat(file.basename, filenameFormat)
    return date !== null
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

/**
 * Check if any period type is enabled
 */
export function hasAnyEnabledPeriodType(settings: PluginSettings): boolean {
    return getEnabledPeriodTypes(settings).length > 0
}

/**
 * Extract dates from entries and filter out invalid ones
 */
export function extractValidDates(
    entries: BasesEntry[],
    config: PeriodicNoteConfig
): { entry: BasesEntry; date: Date }[] {
    const results: { entry: BasesEntry; date: Date }[] = []

    for (const entry of entries) {
        const date = extractDateFromNote(entry.file, config)
        if (date) {
            results.push({ entry, date })
        }
    }

    return results
}

/**
 * Find an entry matching a specific date
 */
export function findEntryByDate(
    entries: BasesEntry[],
    targetDate: Date,
    config: PeriodicNoteConfig
): BasesEntry | null {
    const targetTime = targetDate.getTime()

    for (const entry of entries) {
        const date = extractDateFromNote(entry.file, config)
        if (date && date.getTime() === targetTime) {
            return entry
        }
    }

    return null
}
