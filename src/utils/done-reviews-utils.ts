import type { App, TFile } from 'obsidian'
import type { PeriodType, PluginSettings } from '../app/types'
import { PERIOD_TYPES } from '../app/types'
import {
    formatDateAsFilename,
    getStartOfPeriod,
    getEndOfPeriod,
    formatDate,
    parseDateFromFormat
} from './date-utils'
import { isNoteDone, setNoteDone } from './frontmatter-utils'

/**
 * Get the period identifier (formatted date string) for a given date and period type.
 * Uses the format setting from plugin settings.
 */
export function getPeriodIdentifier(
    date: Date,
    periodType: PeriodType,
    settings: PluginSettings
): string {
    const config = settings[periodType]
    return formatDateAsFilename(date, config.format)
}

/**
 * Get the expected file path for a periodic note.
 */
export function getPeriodicNotePath(
    date: Date,
    periodType: PeriodType,
    settings: PluginSettings
): string {
    const config = settings[periodType]
    const filename = formatDate(date, config.format)
    // Normalize folder path to remove trailing slash
    const folder = config.folder.endsWith('/') ? config.folder.slice(0, -1) : config.folder
    return `${folder}/${filename}.md`
}

/**
 * Find the TFile for a periodic note if it exists.
 */
export function findPeriodicNoteFile(
    app: App,
    date: Date,
    periodType: PeriodType,
    settings: PluginSettings
): TFile | null {
    const path = getPeriodicNotePath(date, periodType, settings)
    const file = app.vault.getAbstractFileByPath(path)
    return file instanceof app.vault.adapter.constructor ? null : (file as TFile | null)
}

/**
 * Get all child period types for a given period type.
 * Returns types in order from largest to smallest.
 */
function getChildPeriodTypes(periodType: PeriodType): PeriodType[] {
    const typeIndex = PERIOD_TYPES.indexOf(periodType)
    // PERIOD_TYPES is ordered: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']
    // We want children (smaller periods), which come earlier in the array
    return PERIOD_TYPES.slice(0, typeIndex)
}

/**
 * Get all markdown files in a folder (and subfolders) using Obsidian's API.
 * Uses app.vault.getMarkdownFiles() for efficiency.
 */
function getMarkdownFilesInFolder(app: App, folderPath: string): TFile[] {
    const normalizedFolder = folderPath.endsWith('/') ? folderPath : `${folderPath}/`
    return app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(normalizedFolder))
}

/**
 * Check if a date falls within a period range (inclusive).
 */
function isDateInPeriod(date: Date, periodStart: Date, periodEnd: Date): boolean {
    const time = date.getTime()
    return time >= periodStart.getTime() && time <= periodEnd.getTime()
}

/**
 * Extract the filename format from a full format string that may include path components.
 * E.g., "YYYY/WW/YYYY-MM-DD" → "YYYY-MM-DD"
 */
function getFilenameFormat(format: string): string {
    const parts = format.split('/')
    return parts[parts.length - 1] ?? format
}

/**
 * Find all periodic notes in a folder that fall within a date range.
 * Parses file paths using the format string to extract dates.
 * Handles formats with path separators (e.g., "YYYY/YYYY-MM-DD").
 */
function findNotesInPeriod(
    app: App,
    folderPath: string,
    format: string,
    periodStart: Date,
    periodEnd: Date
): TFile[] {
    const allFiles = getMarkdownFilesInFolder(app, folderPath)
    const matchingFiles: TFile[] = []

    // Extract just the filename format (last segment after /)
    const filenameFormat = getFilenameFormat(format)

    for (const file of allFiles) {
        const parsedDate = parseDateFromFormat(file.basename, filenameFormat)
        if (parsedDate && isDateInPeriod(parsedDate, periodStart, periodEnd)) {
            matchingFiles.push(file)
        }
    }

    return matchingFiles
}

/**
 * Check if a periodic note is marked as done by reading its frontmatter.
 * Returns false if the note doesn't exist.
 */
export function isPeriodDone(
    app: App,
    date: Date,
    periodType: PeriodType,
    settings: PluginSettings
): boolean {
    const path = getPeriodicNotePath(date, periodType, settings)
    const file = app.vault.getAbstractFileByPath(path)

    if (!file || !(file instanceof Object && 'extension' in file)) {
        return false
    }

    return isNoteDone(app, file as TFile, settings.donePropertyName)
}

/**
 * Mark a period and all its child periods as done (or not done).
 * This is the cascade logic that runs when marking a parent period.
 * Scans ALL enabled periodic note folders to find existing notes that fall within the period.
 * Only updates notes that exist - doesn't create new files.
 *
 * @param app - Obsidian app instance
 * @param date - The date of the period being marked
 * @param periodType - The type of period being marked
 * @param settings - Plugin settings (for format strings and folders)
 * @param isDone - Whether to mark as done (true) or not done (false)
 */
export async function markPeriodWithCascade(
    app: App,
    date: Date,
    periodType: PeriodType,
    settings: PluginSettings,
    isDone: boolean
): Promise<void> {
    const filesToUpdate: TFile[] = []
    const periodStart = getStartOfPeriod(date, periodType)
    const periodEnd = getEndOfPeriod(date, periodType)

    // Get all period types that should be updated (the marked type + all child types)
    const childTypes = getChildPeriodTypes(periodType)
    const typesToUpdate: PeriodType[] = [periodType, ...childTypes]

    // Scan all enabled period type folders
    for (const type of typesToUpdate) {
        const config = settings[type]
        if (!config.enabled || !config.folder) continue

        // Find all notes in this folder that fall within the period
        const matchingFiles = findNotesInPeriod(
            app,
            config.folder,
            config.format,
            periodStart,
            periodEnd
        )

        for (const file of matchingFiles) {
            // Avoid duplicates
            if (!filesToUpdate.some((f) => f.path === file.path)) {
                filesToUpdate.push(file)
            }
        }
    }

    // Update all found files
    for (const file of filesToUpdate) {
        await setNoteDone(app, file, isDone, settings.donePropertyName)
    }
}
