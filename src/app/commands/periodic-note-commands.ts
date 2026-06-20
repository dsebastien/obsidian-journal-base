import { Notice } from 'obsidian'
import type { JournalBasesPlugin } from '../plugin'
import type { PeriodType, PeriodicNoteConfig } from '../types'
import { PERIOD_TYPES } from '../types'
import { NoteCreationService } from '../services/note-creation.service'
import { getEnabledPeriodTypes } from '../../utils/periodic-note-utils'
import {
    formatDate,
    getStartOfPeriod,
    getNextPeriod,
    getPreviousPeriod
} from '../../utils/date-utils'

/**
 * Which period, relative to "now", a command targets.
 */
export type PeriodOffset = 'current' | 'previous' | 'next'

/**
 * Human-readable possessive phrases used to build command names, e.g.
 * "Open today's note" or "Open last week's note".
 */
export const PERIOD_PHRASES: Readonly<Record<PeriodType, Record<PeriodOffset, string>>> = {
    daily: { current: "today's", previous: "yesterday's", next: "tomorrow's" },
    weekly: { current: "this week's", previous: "last week's", next: "next week's" },
    monthly: { current: "this month's", previous: "last month's", next: "next month's" },
    quarterly: { current: "this quarter's", previous: "last quarter's", next: "next quarter's" },
    yearly: { current: "this year's", previous: "last year's", next: "next year's" }
}

/**
 * Lower-case period labels used in notices (e.g. "No daily note ...").
 */
export const PERIOD_LABEL: Readonly<Record<PeriodType, string>> = {
    daily: 'daily',
    weekly: 'weekly',
    monthly: 'monthly',
    quarterly: 'quarterly',
    yearly: 'yearly'
}

/**
 * Resolve the date a command targets for a given period type and offset,
 * relative to the supplied "now" date. Always normalized to the start of
 * the period.
 */
export function resolveTargetDate(periodType: PeriodType, offset: PeriodOffset, now: Date): Date {
    const start = getStartOfPeriod(now, periodType)
    switch (offset) {
        case 'current':
            return start
        case 'previous':
            return getStartOfPeriod(getPreviousPeriod(start, periodType), periodType)
        case 'next':
            return getStartOfPeriod(getNextPeriod(start, periodType), periodType)
    }
}

/**
 * Build the vault path of the periodic note for a given config and date.
 */
export function resolvePeriodNotePath(
    config: PeriodicNoteConfig,
    date: Date,
    periodType: PeriodType
): string {
    const normalized = getStartOfPeriod(date, periodType)
    const filename = formatDate(normalized, config.format)
    return config.folder ? `${config.folder}/${filename}.md` : `${filename}.md`
}

/**
 * Open the periodic note for the target date, creating it if it doesn't exist.
 * Opens in the active leaf, falling back to a new tab.
 */
async function openOrCreatePeriodNote(
    plugin: JournalBasesPlugin,
    service: NoteCreationService,
    periodType: PeriodType,
    offset: PeriodOffset
): Promise<void> {
    const config = plugin.settings[periodType]
    const date = resolveTargetDate(periodType, offset, new Date())
    const path = resolvePeriodNotePath(config, date, periodType)

    // Reuse the existing note silently; only notify when we actually create one.
    const existing = plugin.app.vault.getFileByPath(path)
    if (existing) {
        await service.openPeriodicNote(existing, false)
        return
    }

    const file = await service.createPeriodicNote(date, config, periodType)
    if (file) {
        await service.openPeriodicNote(file, false)
    }
}

/**
 * Toggle the done state of the current-period note. Does nothing (beyond a
 * notice) when the note doesn't exist, since done state lives in frontmatter.
 */
async function toggleDoneForCurrent(
    plugin: JournalBasesPlugin,
    periodType: PeriodType
): Promise<void> {
    const config = plugin.settings[periodType]
    const date = resolveTargetDate(periodType, 'current', new Date())
    const path = resolvePeriodNotePath(config, date, periodType)

    const file = plugin.app.vault.getFileByPath(path)
    if (!file) {
        new Notice(`No ${PERIOD_LABEL[periodType]} note for the current period`)
        return
    }

    await plugin.toggleDone(date, periodType, file)
}

/**
 * Create any missing current-period notes across all enabled period types.
 * Shows a single summary notice.
 */
async function createAllCurrentNotes(
    plugin: JournalBasesPlugin,
    service: NoteCreationService
): Promise<void> {
    const enabled = getEnabledPeriodTypes(plugin.settings)
    let created = 0

    for (const periodType of enabled) {
        const config = plugin.settings[periodType]
        const date = resolveTargetDate(periodType, 'current', new Date())
        const path = resolvePeriodNotePath(config, date, periodType)

        if (plugin.app.vault.getFileByPath(path)) continue

        const file = await service.createPeriodicNote(date, config, periodType)
        if (file) created++
    }

    new Notice(
        created === 0
            ? 'All current-period notes already exist'
            : `Created ${created} note${created === 1 ? '' : 's'} for the current period`
    )
}

/**
 * Register all periodic-note commands.
 *
 * Per-period commands use checkCallback so they only appear when the period
 * type is enabled in settings (which can change at runtime). Command IDs are
 * derived from the stable period type, never from the display phrases, so they
 * remain stable across renames.
 */
export function registerPeriodicNoteCommands(plugin: JournalBasesPlugin): void {
    const service = new NoteCreationService(plugin.app)

    for (const periodType of PERIOD_TYPES) {
        const phrases = PERIOD_PHRASES[periodType]

        // Open / create current, previous, next
        const offsets: PeriodOffset[] = ['current', 'previous', 'next']
        for (const offset of offsets) {
            plugin.addCommand({
                id: `open-${offset}-${periodType}`,
                name: `Open ${phrases[offset]} note`,
                checkCallback: (checking: boolean): boolean => {
                    if (!plugin.settings[periodType].enabled) return false
                    if (!checking) {
                        void openOrCreatePeriodNote(plugin, service, periodType, offset)
                    }
                    return true
                }
            })
        }

        // Toggle done for the current period
        plugin.addCommand({
            id: `toggle-done-current-${periodType}`,
            name: `Toggle done state for ${phrases.current} note`,
            checkCallback: (checking: boolean): boolean => {
                if (!plugin.settings[periodType].enabled) return false
                if (!checking) {
                    void toggleDoneForCurrent(plugin, periodType)
                }
                return true
            }
        })
    }

    // Create all missing current-period notes in one shot
    plugin.addCommand({
        id: 'create-all-current-notes',
        name: 'Create all missing notes for the current period',
        checkCallback: (checking: boolean): boolean => {
            if (getEnabledPeriodTypes(plugin.settings).length === 0) return false
            if (!checking) {
                void createAllCurrentNotes(plugin, service)
            }
            return true
        }
    })
}
