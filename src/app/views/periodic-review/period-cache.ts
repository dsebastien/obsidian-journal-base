import type { TFile, BasesEntry } from 'obsidian'
import type { PeriodType, PeriodicNoteConfig, PluginSettings } from '../../types'
import {
    extractDateFromNote,
    filterEntriesByPeriodType,
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
    // Date extraction cache - WeakMap so entries are garbage collected when TFile is removed
    private dateCache: WeakMap<TFile, Date | null> = new WeakMap()

    // Entries by period type - invalidated when data changes
    private entriesByTypeCache: Map<PeriodType, BasesEntry[]> = new Map()
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
        if (this.dateCache.has(file)) {
            return this.dateCache.get(file) ?? null
        }

        const date = extractDateFromNote(file, config)
        this.dateCache.set(file, date)
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
            this.entriesCacheDataVersion = dataVersion
        }

        const cached = this.entriesByTypeCache.get(periodType)
        if (cached) {
            return cached
        }

        const entries = filterEntriesByPeriodType(data, periodType, settings)
        const config = settings[periodType]
        const sorted = sortEntriesByDate(entries, config, false)

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
