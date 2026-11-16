import type { TFile, BasesEntry } from 'obsidian'
import type { PeriodType, PeriodicNoteConfig, PluginSettings } from '../../types'
import {
    extractDateFromNote,
    groupEntriesByPeriodType,
    sortEntriesByDate
} from '../../../utils/periodic-note-utils'
import type { SelectionContext } from './selection-context'
import { generatePeriodsForContext } from './period-generator'

/**
 * Centralized caching for expensive periodic review operations.
 * Provides significant performance improvements by avoiding redundant computations.
 *
 * Key optimizations:
 * - Date extraction cached with WeakMap (auto-garbage collected)
 * - Entries by period type cached (invalidated when data version changes)
 * - Generated periods cached (invalidated when context changes)
 */
export class PeriodCache {
    // Date extraction cache - WeakMap so entries are garbage collected when TFile is removed.
    // Keyed on the TFile but also stamped with the basename and format the cached date
    // was derived from: a rename (Obsidian reuses the TFile instance, mutating basename)
    // or a periodic-note format change (e.g. syncFromPeriodicNotesPlugin copying a new
    // format into settings) must invalidate the entry, otherwise a stale — often null —
    // date keeps rendering the note grey. See issue #42.
    private dateCache: WeakMap<TFile, { basename: string; format: string; date: Date | null }> =
        new WeakMap()

    // Entries by period type - invalidated when data changes
    private entriesByTypeCache: Map<PeriodType, BasesEntry[]> = new Map()
    // All entries split by period type, unsorted - built once per data version
    private entryGroups: Map<PeriodType, BasesEntry[]> | null = null
    private entriesCacheDataVersion: number = -1

    // Generated periods cache - invalidated when context changes
    private periodsCache: Map<PeriodType, Date[]> = new Map()
    private periodsCacheContextHash: string = ''

    private currentDataVersion: number = 0

    /**
     * Extract date from note with caching.
     * Uses WeakMap so cache entries are automatically cleaned when TFile is garbage collected.
     */
    extractDate(file: TFile, config: PeriodicNoteConfig): Date | null {
        const cached = this.dateCache.get(file)
        if (cached && cached.basename === file.basename && cached.format === config.format) {
            return cached.date
        }

        const date = extractDateFromNote(file, config)
        this.dateCache.set(file, { basename: file.basename, format: config.format, date })
        return date
    }

    /**
     * Get entries filtered by period type with caching.
     * Cache is invalidated when data version changes.
     */
    getEntriesByType(
        data: BasesEntry[],
        periodType: PeriodType,
        settings: PluginSettings,
        dataVersion: number
    ): BasesEntry[] {
        // Invalidate cache if data changed
        if (dataVersion !== this.entriesCacheDataVersion) {
            this.entriesByTypeCache.clear()
            this.entryGroups = null
            this.entriesCacheDataVersion = dataVersion
        }

        const cached = this.entriesByTypeCache.get(periodType)
        if (cached) {
            return cached
        }

        // One pass over the data for all period types, and not one pass per
        // column. The sort reads each date through the date cache, which outlives
        // a data version: after the first update a file name is parsed again only
        // when the file was renamed or the format changed.
        this.entryGroups ??= groupEntriesByPeriodType(data, settings)
        const entries = this.entryGroups.get(periodType) ?? []
        const config = settings[periodType]
        const sorted = sortEntriesByDate(entries, config, false, (file, cfg) =>
            this.extractDate(file, cfg)
        )

        this.entriesByTypeCache.set(periodType, sorted)
        return sorted
    }

    /**
     * Get generated periods for context with caching.
     * Cache is invalidated when context or visible columns change.
     */
    getPeriodsForContext(
        periodType: PeriodType,
        context: SelectionContext,
        visibleTypes: PeriodType[]
    ): Date[] {
        const contextHash = this.hashContext(context, visibleTypes)

        // Invalidate cache if context or visible columns changed
        if (contextHash !== this.periodsCacheContextHash) {
            this.periodsCache.clear()
            this.periodsCacheContextHash = contextHash
        }

        const cached = this.periodsCache.get(periodType)
        if (cached) {
            return [...cached] // Return a copy to prevent mutation
        }

        const periods = generatePeriodsForContext(periodType, context, visibleTypes)
        this.periodsCache.set(periodType, periods)
        return [...periods] // Return a copy
    }

    /**
     * Invalidate all caches (call when data fundamentally changes).
     */
    invalidateAll(): void {
        this.entriesByTypeCache.clear()
        this.entryGroups = null
        this.periodsCache.clear()
        this.periodsCacheContextHash = ''
        this.currentDataVersion++
    }

    /**
     * Invalidate context-dependent caches (call when selection changes).
     */
    invalidateContextCaches(): void {
        this.periodsCache.clear()
        this.periodsCacheContextHash = ''
    }

    /**
     * Get current data version for cache invalidation.
     */
    getDataVersion(): number {
        return this.currentDataVersion
    }

    /**
     * Increment data version (call when new data arrives).
     */
    incrementDataVersion(): void {
        this.currentDataVersion++
    }

    private hashContext(context: SelectionContext, visibleTypes: PeriodType[]): string {
        return JSON.stringify({
            year: context.selectedYear,
            quarter: context.selectedQuarter,
            month: context.selectedMonth,
            week: context.selectedWeek,
            weekYear: context.selectedWeekYear,
            visible: [...visibleTypes].sort()
        })
    }
}
