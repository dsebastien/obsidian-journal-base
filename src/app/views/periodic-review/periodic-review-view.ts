import { BasesView, BasesEntry, Notice, type TFile, debounce } from 'obsidian'
import type { QueryController, Debouncer } from 'obsidian'
import type JournalBasesPlugin from '../../../main'
import type { PeriodType, PeriodicNoteConfig, LifeTrackerPluginFileProvider } from '../../types'
import { FoldableColumn, CreateNoteButton, NoteCard } from '../../components'
import { NoteCreationService } from '../../services/note-creation.service'
import { extractDateFromNote, getEnabledPeriodTypes } from '../../../utils/periodic-note-utils'
import {
    getStartOfPeriod,
    formatFilenameWithSuffix,
    isCurrentPeriod
} from '../../../utils/date-utils'
import {
    PERIODIC_REVIEW_VIEW_TYPE,
    PERIOD_TYPE_ORDER,
    PERIOD_TYPE_LABELS,
    getChildPeriodTypes,
    getParentPeriodTypes
} from './periodic-review.constants'
import { SelectionContext, type SelectionContextSnapshot } from './selection-context'
import { generatePeriodsForContext } from './period-generator'
import { filterEntriesByContext } from './entry-filter'
import { PeriodCache } from './period-cache'
import { VirtualPeriodSelector, type VirtualPeriodItem } from './virtual-period-selector'

// Plus icon for create button in column header
const PLUS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`

interface ColumnState {
    periodType: PeriodType
    column: FoldableColumn
    selectedDate: Date | null
    entries: BasesEntry[]
    noteCard: NoteCard | null
    virtualSelector: VirtualPeriodSelector | null
    needsRefresh: boolean
}

export class PeriodicReviewView extends BasesView implements LifeTrackerPluginFileProvider {
    override type = PERIODIC_REVIEW_VIEW_TYPE

    private plugin: JournalBasesPlugin
    private containerEl!: HTMLElement
    private columnsEl!: HTMLElement
    private noteCreationService: NoteCreationService
    private columns: Map<PeriodType, ColumnState> = new Map()
    private context: SelectionContext = new SelectionContext()
    private enabledTypes: PeriodType[] = []
    private visibleTypes: PeriodType[] = []
    private isFirstLoad: boolean = true
    private unsubscribeFromSettings: (() => void) | null = null
    private unsubscribeFromDoneReviews: (() => void) | null = null

    // Performance optimization: caching and debouncing
    private cache: PeriodCache = new PeriodCache()
    private dataVersion: number = 0
    private debouncedDataUpdate: Debouncer<[], void>

    constructor(controller: QueryController, scrollEl: HTMLElement, plugin: JournalBasesPlugin) {
        super(controller)
        this.plugin = plugin
        this.noteCreationService = new NoteCreationService(this.app)
        this.containerEl = scrollEl.createDiv({ cls: 'periodic-review-view' })
        this.columnsEl = this.containerEl.createDiv({ cls: 'pr-columns' })

        // Initialize debounced data update (50ms debounce for rapid file changes)
        this.debouncedDataUpdate = debounce(
            () => {
                this.doDataUpdate()
            },
            50,
            true
        )

        // Register as active file provider for commands (Life Tracker compatibility)
        this.plugin.setActiveFileProvider(this)

        // Subscribe to plugin settings changes to re-render when configuration changes
        this.unsubscribeFromSettings = this.plugin.onSettingsChange(() => {
            this.onDataUpdated()
        })

        // Subscribe to done reviews changes to refresh checkmarks
        this.unsubscribeFromDoneReviews = this.plugin.onDoneReviewsChange(() => {
            this.refreshDoneStates()
        })

        // Setup scroll listener for lazy column refresh
        this.setupViewportObserver()
    }

    /**
     * Refresh done states for all virtual selectors and NoteCards.
     * Called when done reviews are updated.
     */
    private refreshDoneStates(): void {
        for (const [periodType, state] of this.columns) {
            if (state.virtualSelector) {
                state.virtualSelector.refreshDoneStates((date) =>
                    this.plugin.isDone(date, periodType)
                )
            }
            // Also refresh NoteCard done state if present
            if (state.noteCard && state.selectedDate) {
                const isDone = this.plugin.isDone(state.selectedDate, periodType)
                state.noteCard.setDoneState(isDone)
            }
        }
    }

    /**
     * Setup scroll listener to refresh columns that need updating when they come into view.
     */
    private setupViewportObserver(): void {
        this.registerDomEvent(this.columnsEl, 'scroll', () => {
            this.checkDeferredRefreshes()
        })
    }

    /**
     * Check if any columns marked for refresh are now in viewport.
     */
    private checkDeferredRefreshes(): void {
        for (const state of this.columns.values()) {
            if (state.needsRefresh && this.isColumnInViewport(state)) {
                this.refreshColumn(state)
            }
        }
    }

    /**
     * Check if a column is visible in the viewport.
     */
    private isColumnInViewport(state: ColumnState): boolean {
        const el = state.column.getElement()
        const rect = el.getBoundingClientRect()
        const containerRect = this.containerEl.getBoundingClientRect()

        return rect.left < containerRect.right && rect.right > containerRect.left
    }

    /**
     * Refresh a column that was marked for deferred update.
     */
    private refreshColumn(state: ColumnState): void {
        const config = this.plugin.settings[state.periodType]
        this.updateVirtualSelector(state, config)
        state.needsRefresh = false
    }

    /**
     * Compatibility with the Life Tracker plugin.
     * Get files from this view for commands.
     * Only returns daily notes (Life Tracker only works with daily notes).
     * If the daily NoteCard is being edited, that file is returned.
     * Otherwise returns the currently selected daily note if any.
     */
    getFiles(): TFile[] {
        // Only return the daily column's file
        const dailyState = this.columns.get('daily')
        if (!dailyState?.noteCard) {
            return []
        }

        // Check if the daily NoteCard is currently focused (actively being edited)
        if (dailyState.noteCard.hasActiveEditor()) {
            return [dailyState.noteCard.getFile()]
        }

        // Return the daily note
        return [dailyState.noteCard.getFile()]
    }

    /**
     * Compatibility with the Life Tracker plugin.
     */
    getFilterMode(): 'never' {
        return 'never'
    }

    /**
     * Called when Base data updates. Uses debouncing to batch rapid updates.
     */
    override onDataUpdated(): void {
        // Increment data version for cache invalidation
        this.dataVersion++
        this.cache.incrementDataVersion()

        // Use debounced update to batch rapid file changes
        this.debouncedDataUpdate()
    }

    /**
     * Actual data update logic (called after debounce).
     */
    private doDataUpdate(): void {
        // Check if we can do an incremental update (structure unchanged, just data changed)
        const newEnabledTypes = getEnabledPeriodTypes(this.plugin.settings)
        const newVisibleTypes = this.getVisiblePeriodTypes(newEnabledTypes)
        const structureChanged = this.hasStructureChanged(newEnabledTypes, newVisibleTypes)

        // If structure hasn't changed and we have columns, do incremental update
        if (!structureChanged && this.columns.size > 0 && !this.isFirstLoad) {
            this.incrementalUpdate()
            return
        }

        // Full rebuild needed
        // Save current selection state before rebuilding
        const savedSnapshot = this.context.saveSnapshot()
        const hadSelection = !this.isFirstLoad

        this.cleanupColumns()
        this.columnsEl.empty()

        this.enabledTypes = newEnabledTypes
        this.visibleTypes = newVisibleTypes
        if (this.enabledTypes.length === 0) {
            this.renderEmptyState('No period types are enabled. Configure them in plugin settings.')
            return
        }

        if (newVisibleTypes.length === 0) {
            this.renderEmptyState(
                'No columns are enabled for this view. Enable columns in view options.'
            )
            return
        }

        const columnWidth = (this.config.get('columnWidth') as number) ?? 400

        // Create columns for each visible period type in order
        for (const periodType of PERIOD_TYPE_ORDER) {
            if (!newVisibleTypes.includes(periodType)) continue

            const config = this.plugin.settings[periodType]
            if (!config.enabled) continue

            // Use cache for entries
            const entries = this.cache.getEntriesByType(
                this.data.data,
                periodType,
                this.plugin.settings,
                this.dataVersion
            )
            this.createColumn(periodType, config, entries, columnWidth)
        }

        if (hadSelection) {
            // Restore previous selection after data update
            this.restoreSelection(savedSnapshot)
        } else {
            // First load - auto-select most recent
            this.autoSelectMostRecent()
            this.isFirstLoad = false
        }
    }

    /**
     * Check if the view structure has changed (enabled types, visible columns)
     */
    private hasStructureChanged(
        newEnabledTypes: PeriodType[],
        newVisibleTypes: PeriodType[]
    ): boolean {
        // Check if enabled types changed
        if (newEnabledTypes.length !== this.enabledTypes.length) return true
        for (const type of newEnabledTypes) {
            if (!this.enabledTypes.includes(type)) return true
        }

        // Check if visible columns changed
        const currentVisibleTypes = Array.from(this.columns.keys())
        if (newVisibleTypes.length !== currentVisibleTypes.length) return true
        for (const type of newVisibleTypes) {
            if (!currentVisibleTypes.includes(type)) return true
        }

        return false
    }

    /**
     * Perform an incremental update without rebuilding the entire view.
     * This preserves NoteCard instances and just refreshes their content.
     * Uses caching and virtual selector for optimal performance.
     */
    private incrementalUpdate(): void {
        // Update column width (in case view option changed)
        const columnWidth = (this.config.get('columnWidth') as number) ?? 400

        // Update entries for each column
        for (const [periodType, state] of this.columns) {
            const config = this.plugin.settings[periodType]
            if (!config.enabled) continue

            // Update column width
            state.column.setWidth(columnWidth)

            // Use cache for entries (major performance improvement)
            state.entries = this.cache.getEntriesByType(
                this.data.data,
                periodType,
                this.plugin.settings,
                this.dataVersion
            )

            // Update the virtual selector with new items
            this.updateVirtualSelector(state, config)

            // If there's a selected period, refresh the NoteCard
            // The refreshContent method preserves cursor position and scroll state
            if (state.selectedDate && state.noteCard) {
                state.noteCard.refreshContent()
            }
        }
    }

    private getVisiblePeriodTypes(enabledTypes: PeriodType[]): PeriodType[] {
        const configMap: Record<PeriodType, { key: string; default: boolean }> = {
            daily: { key: 'showDaily', default: true },
            weekly: { key: 'showWeekly', default: true },
            monthly: { key: 'showMonthly', default: true },
            quarterly: { key: 'showQuarterly', default: false },
            yearly: { key: 'showYearly', default: false }
        }

        return PERIOD_TYPE_ORDER.filter((pt) => {
            const cfg = configMap[pt]
            const show = (this.config.get(cfg.key) as boolean) ?? cfg.default
            return show && enabledTypes.includes(pt)
        }) as PeriodType[]
    }

    private createColumn(
        periodType: PeriodType,
        config: PeriodicNoteConfig,
        entries: BasesEntry[],
        width: number
    ): void {
        const column = new FoldableColumn(this.columnsEl, PERIOD_TYPE_LABELS[periodType])
        column.setWidth(width)

        // Create virtual selector for this column
        const selectorEl = column.getSelectorEl()
        const virtualSelector = new VirtualPeriodSelector(
            selectorEl,
            (date, entry) => {
                const columnState = this.columns.get(periodType)
                if (columnState) {
                    this.selectPeriod(columnState, date, entry)
                }
            },
            async (date) => {
                // Toggle done status for this period (cascades to children)
                await this.plugin.toggleDone(date, periodType)
            }
        )
        this.addChild(virtualSelector)

        const state: ColumnState = {
            periodType,
            column,
            selectedDate: null,
            entries,
            noteCard: null,
            virtualSelector,
            needsRefresh: false
        }
        this.columns.set(periodType, state)

        // Add create next year button for yearly column
        if (periodType === 'yearly') {
            this.renderCreateNextYearButton(state, config)
        }

        // Initialize the virtual selector with items
        this.updateVirtualSelector(state, config)
    }

    /**
     * Update the virtual selector with current items.
     * Uses caching for optimal performance.
     */
    private updateVirtualSelector(state: ColumnState, config: PeriodicNoteConfig): void {
        if (!state.virtualSelector) return

        const selectorEl = state.column.getSelectorEl()

        // Always clear any parent missing message divs first
        const parentMissingEl = selectorEl.querySelector('.pr-parent-missing')
        if (parentMissingEl) {
            parentMissingEl.remove()
        }

        const parentMissingMessage = this.getParentMissingMessage(state.periodType)
        if (parentMissingMessage) {
            state.virtualSelector.clear()
            this.renderParentMissingMessage(selectorEl, parentMissingMessage)
            state.column.getContentEl().empty()
            return
        }

        const items = this.buildVirtualItems(state, config)

        if (items.length === 0) {
            state.virtualSelector.showEmptyState('No periods available')
            return
        }

        state.virtualSelector.setItems(items)

        if (state.selectedDate) {
            state.virtualSelector.setSelection(state.selectedDate)
            state.virtualSelector.scrollToSelection()
        }
    }

    /**
     * Build the items array for the virtual selector.
     * Uses caching for filtered entries and generated periods.
     */
    private buildVirtualItems(state: ColumnState, config: PeriodicNoteConfig): VirtualPeriodItem[] {
        // Use cache for filtered entries
        // Use visibleTypes instead of enabledTypes so hidden columns don't affect filtering
        const filteredEntries = filterEntriesByContext(
            state.entries,
            state.periodType,
            config,
            this.context,
            this.visibleTypes,
            this.cache
        )

        const dateEntryMap = new Map<number, BasesEntry>()
        for (const entry of filteredEntries) {
            const date = this.cache.extractDate(entry.file, config)
            if (date) {
                const normalized = getStartOfPeriod(date, state.periodType)
                dateEntryMap.set(normalized.getTime(), entry)
            }
        }

        // Use cache for periods
        // Use visibleTypes instead of enabledTypes so hidden columns don't affect period generation
        const contextPeriods = this.cache.getPeriodsForContext(
            state.periodType,
            this.context,
            this.visibleTypes
        )

        // Include any dates from existing entries not in generated periods
        const contextPeriodSet = new Set(contextPeriods.map((d) => d.getTime()))
        for (const entryTime of dateEntryMap.keys()) {
            if (!contextPeriodSet.has(entryTime)) {
                contextPeriods.push(new Date(entryTime))
            }
        }

        // Sort newest to oldest
        contextPeriods.sort((a, b) => b.getTime() - a.getTime())

        const items: VirtualPeriodItem[] = []

        for (const date of contextPeriods) {
            const entry = dateEntryMap.get(date.getTime()) ?? null
            const label = formatFilenameWithSuffix(date, config.format, state.periodType)

            items.push({
                date,
                label,
                entry,
                isMissing: !entry,
                isCurrent: isCurrentPeriod(date, state.periodType),
                isDone: this.plugin.isDone(date, state.periodType)
            })
        }

        return items
    }

    private renderCreateNextYearButton(state: ColumnState, config: PeriodicNoteConfig): void {
        const headerActionsEl = state.column.getHeaderActionsEl()
        headerActionsEl.empty()

        // Find the latest year from existing entries
        const currentYear = new Date().getFullYear()
        let latestYear = currentYear

        for (const entry of state.entries) {
            const date = extractDateFromNote(entry.file, config)
            if (date) {
                const year = date.getFullYear()
                if (year > latestYear) {
                    latestYear = year
                }
            }
        }

        // Next year to create
        const nextYear = latestYear + 1
        const nextYearDate = new Date(nextYear, 0, 1)

        // Check if next year's note already exists
        const nextYearExists = state.entries.some((entry) => {
            const date = extractDateFromNote(entry.file, config)
            return date && date.getFullYear() === nextYear
        })

        if (nextYearExists) {
            return
        }

        // Create the "+" button
        const createBtn = headerActionsEl.createEl('button', {
            cls: 'pr-column__create-btn clickable-icon',
            attr: { 'aria-label': `Create ${nextYear} note` }
        })
        createBtn.innerHTML = PLUS_ICON

        createBtn.addEventListener('click', async (e) => {
            e.stopPropagation()
            createBtn.disabled = true
            createBtn.addClass('pr-column__create-btn--loading')

            const file = await this.noteCreationService.createPeriodicNote(
                nextYearDate,
                config,
                'yearly'
            )

            if (file) {
                const newEntry = { file } as BasesEntry
                state.entries = [...state.entries, newEntry]
                this.renderCreateNextYearButton(state, config)
                this.updateVirtualSelector(state, config)
                new Notice(`Created ${nextYear} note`)
            } else {
                createBtn.disabled = false
                createBtn.removeClass('pr-column__create-btn--loading')
            }
        })
    }

    private getParentMissingMessage(periodType: PeriodType): string | null {
        // Find the first visible parent that doesn't exist
        const parentTypes = getParentPeriodTypes(periodType)

        for (const parentType of parentTypes) {
            if (this.columns.has(parentType) && !this.context.exists(parentType)) {
                return `Select an existing ${parentType} note or create one first`
            }
        }

        return null
    }

    private renderParentMissingMessage(containerEl: HTMLElement, message: string): void {
        containerEl
            .createDiv({ cls: 'pr-parent-missing' })
            .createDiv({ cls: 'pr-parent-missing__text', text: message })
    }

    private getAvailableDatesForColumn(
        state: ColumnState,
        config: PeriodicNoteConfig
    ): { dates: Date[]; dateEntryMap: Map<number, BasesEntry> } {
        // Use visibleTypes instead of enabledTypes so hidden columns don't affect filtering
        const filteredEntries = filterEntriesByContext(
            state.entries,
            state.periodType,
            config,
            this.context,
            this.visibleTypes
        )
        const dateEntryMap = new Map<number, BasesEntry>()

        for (const entry of filteredEntries) {
            const date = extractDateFromNote(entry.file, config)
            if (date) {
                const normalized = getStartOfPeriod(date, state.periodType)
                dateEntryMap.set(normalized.getTime(), entry)
            }
        }

        // Use visibleTypes instead of enabledTypes so hidden columns don't affect period generation
        const contextPeriods = generatePeriodsForContext(
            state.periodType,
            this.context,
            this.visibleTypes
        )

        // Include any dates from existing entries that aren't in the generated periods
        // This ensures future notes (e.g., 2026 yearly) are shown if they exist
        const contextPeriodSet = new Set(contextPeriods.map((d) => d.getTime()))
        for (const entryTime of dateEntryMap.keys()) {
            if (!contextPeriodSet.has(entryTime)) {
                contextPeriods.push(new Date(entryTime))
            }
        }

        contextPeriods.sort((a, b) => b.getTime() - a.getTime())

        return { dates: contextPeriods, dateEntryMap }
    }

    private selectPeriod(state: ColumnState, date: Date, entry: BasesEntry | null): void {
        state.selectedDate = date
        const exists = entry !== null

        // Invalidate context-dependent caches when selection changes
        this.cache.invalidateContextCaches()

        this.context.updateForPeriod(state.periodType, date, exists)

        // Update virtual selector's selection (much faster than DOM manipulation)
        if (state.virtualSelector) {
            state.virtualSelector.setSelection(date)
        }

        this.renderColumnContent(state, entry)
        this.cascadeDownward(state.periodType)
    }

    /**
     * Navigate to the previous period in a column.
     * Since items are sorted newest first, "previous" means going backwards in time,
     * which is the next item in the array (higher index).
     */
    private navigateToPreviousPeriod(state: ColumnState): void {
        if (!state.virtualSelector || !state.selectedDate) return

        const config = this.plugin.settings[state.periodType]
        const items = this.buildVirtualItems(state, config)
        if (items.length === 0) return

        // Find current selection index
        const currentIndex = items.findIndex(
            (item) => item.date.getTime() === state.selectedDate!.getTime()
        )

        if (currentIndex === -1) return

        // Previous in time = higher index (since sorted newest first)
        const prevIndex = currentIndex + 1
        if (prevIndex >= items.length) return // Already at oldest

        const prevItem = items[prevIndex]
        if (prevItem) {
            this.selectPeriod(state, prevItem.date, prevItem.entry)
            state.virtualSelector.scrollToIndex(prevIndex)
        }
    }

    /**
     * Navigate to the next period in a column.
     * Since items are sorted newest first, "next" means going forward in time,
     * which is the previous item in the array (lower index).
     */
    private navigateToNextPeriod(state: ColumnState): void {
        if (!state.virtualSelector || !state.selectedDate) return

        const config = this.plugin.settings[state.periodType]
        const items = this.buildVirtualItems(state, config)
        if (items.length === 0) return

        // Find current selection index
        const currentIndex = items.findIndex(
            (item) => item.date.getTime() === state.selectedDate!.getTime()
        )

        if (currentIndex === -1) return

        // Next in time = lower index (since sorted newest first)
        const nextIndex = currentIndex - 1
        if (nextIndex < 0) return // Already at newest

        const nextItem = items[nextIndex]
        if (nextItem) {
            this.selectPeriod(state, nextItem.date, nextItem.entry)
            state.virtualSelector.scrollToIndex(nextIndex)
        }
    }

    /**
     * Check if there's a previous period available in the column.
     */
    private hasPreviousPeriod(state: ColumnState): boolean {
        if (!state.selectedDate) return false

        const config = this.plugin.settings[state.periodType]
        const items = this.buildVirtualItems(state, config)
        if (items.length === 0) return false

        const currentIndex = items.findIndex(
            (item) => item.date.getTime() === state.selectedDate!.getTime()
        )

        // Previous = higher index (since sorted newest first)
        return currentIndex !== -1 && currentIndex < items.length - 1
    }

    /**
     * Check if there's a next period available in the column.
     */
    private hasNextPeriod(state: ColumnState): boolean {
        if (!state.selectedDate) return false

        const config = this.plugin.settings[state.periodType]
        const items = this.buildVirtualItems(state, config)
        if (items.length === 0) return false

        const currentIndex = items.findIndex(
            (item) => item.date.getTime() === state.selectedDate!.getTime()
        )

        // Next = lower index (since sorted newest first)
        return currentIndex !== -1 && currentIndex > 0
    }

    /**
     * Cascade updates downward to child columns.
     * Updates all child columns to reflect the new parent selection.
     */
    private cascadeDownward(periodType: PeriodType): void {
        const childTypes = getChildPeriodTypes(periodType).filter((ct) => this.columns.has(ct))

        for (const childType of childTypes) {
            const childState = this.columns.get(childType)
            if (!childState) continue

            // Clear selection state
            childState.selectedDate = null
            this.context.setExists(childType, false)

            // Clear virtual selector selection before updating items
            if (childState.virtualSelector) {
                childState.virtualSelector.setSelection(null)
            }

            // Update the virtual selector with new items for the new context
            const config = this.plugin.settings[childType]
            this.updateVirtualSelector(childState, config)

            // Clear content area
            childState.column.getContentEl().empty()
            if (childState.noteCard) {
                childState.noteCard.unload()
                childState.noteCard = null
            }
        }
    }

    private renderColumnContent(state: ColumnState, entry: BasesEntry | null): void {
        const contentEl = state.column.getContentEl()

        // Cleanup existing NoteCard if present
        if (state.noteCard) {
            state.noteCard.unload()
            state.noteCard = null
        }

        contentEl.empty()

        if (!entry) {
            if (state.selectedDate) {
                this.renderCreateNoteUI(contentEl, state)
            }
            return
        }

        // Create NoteCard with the same component used in periodic notes view
        // In review view: not foldable, always source mode, no mode toggle buttons
        const isDone = state.selectedDate
            ? this.plugin.isDone(state.selectedDate, state.periodType)
            : false
        const hasPrev = this.hasPreviousPeriod(state)
        const hasNext = this.hasNextPeriod(state)
        state.noteCard = new NoteCard(
            contentEl,
            this.app,
            entry.file,
            state.periodType,
            state.selectedDate,
            true, // Always expanded
            (file) => {
                this.app.workspace.getLeaf('tab').openFile(file)
            },
            {
                foldable: false,
                forcedMode: 'source',
                hideModeToggle: true,
                isDone,
                onToggleDone: () => {
                    if (state.selectedDate) {
                        this.plugin.toggleDone(state.selectedDate, state.periodType)
                    }
                },
                onPrevious: hasPrev ? () => this.navigateToPreviousPeriod(state) : undefined,
                onNext: hasNext ? () => this.navigateToNextPeriod(state) : undefined
            }
        )
    }

    private renderCreateNoteUI(contentEl: HTMLElement, state: ColumnState): void {
        const config = this.plugin.settings[state.periodType]
        const createContainer = contentEl.createDiv({ cls: 'pr-create-note' })

        new CreateNoteButton(
            createContainer,
            state.selectedDate!,
            config,
            state.periodType,
            async (date) => {
                const file = await this.noteCreationService.createPeriodicNote(
                    date,
                    config,
                    state.periodType
                )
                if (file) {
                    const newEntry = { file } as BasesEntry
                    state.entries = [...state.entries, newEntry]
                    this.updateVirtualSelector(state, config)
                    if (state.selectedDate) {
                        this.selectPeriod(state, state.selectedDate, newEntry)
                    }
                    return true
                }
                return false
            },
            'large'
        )
    }

    private autoSelectMostRecent(): void {
        // Process columns from parent to child
        for (const periodType of [...PERIOD_TYPE_ORDER].reverse()) {
            const state = this.columns.get(periodType)
            if (!state) continue

            const config = this.plugin.settings[periodType]
            const { dateEntryMap } = this.getAvailableDatesForColumn(state, config)

            if (dateEntryMap.size === 0) continue

            const existingDates = Array.from(dateEntryMap.keys())
                .map((time) => new Date(time))
                .sort((a, b) => b.getTime() - a.getTime())

            const currentPeriodDate = getStartOfPeriod(new Date(), periodType)
            const currentPeriodEntry = dateEntryMap.get(currentPeriodDate.getTime())

            const selectedDate = currentPeriodEntry ? currentPeriodDate : existingDates[0]!
            const entry = dateEntryMap.get(selectedDate.getTime())!

            state.selectedDate = selectedDate
            this.context.updateForPeriod(periodType, selectedDate, true)
            // Update virtual selector selection
            if (state.virtualSelector) {
                state.virtualSelector.setSelection(selectedDate)
            }
            this.renderColumnContent(state, entry)
        }

        // Refresh child columns with proper context
        for (const periodType of [...PERIOD_TYPE_ORDER].reverse()) {
            const state = this.columns.get(periodType)
            if (!state || !state.selectedDate) continue

            this.cascadeDownwardWithSelection(periodType)
            break
        }
    }

    /**
     * Restore selection from a saved snapshot after data update.
     * This ensures user selections are preserved when new data is received.
     */
    private restoreSelection(snapshot: SelectionContextSnapshot): void {
        // Restore the context state
        this.context.restoreSnapshot(snapshot)

        // Process columns from parent to child to restore selections
        for (const periodType of [...PERIOD_TYPE_ORDER].reverse()) {
            const state = this.columns.get(periodType)
            if (!state) continue

            const config = this.plugin.settings[periodType]

            // Reconstruct the selected date from the snapshot
            const selectedDate = this.getDateFromSnapshot(periodType, snapshot)
            if (!selectedDate) continue

            // Find the entry for this date
            const { dateEntryMap } = this.getAvailableDatesForColumn(state, config)
            const entry = dateEntryMap.get(selectedDate.getTime())

            state.selectedDate = selectedDate
            // Update existence based on whether entry was found (it might be newly created)
            this.context.setExists(periodType, entry !== undefined)
            // Update virtual selector selection
            if (state.virtualSelector) {
                state.virtualSelector.setSelection(selectedDate)
            }
            this.renderColumnContent(state, entry ?? null)
        }

        // Refresh child columns with proper context
        for (const periodType of [...PERIOD_TYPE_ORDER].reverse()) {
            const state = this.columns.get(periodType)
            if (!state || !state.selectedDate) continue

            this.cascadeDownwardWithSelection(periodType)
            break
        }
    }

    /**
     * Reconstruct a Date object from a snapshot for a given period type.
     */
    private getDateFromSnapshot(
        periodType: PeriodType,
        snapshot: SelectionContextSnapshot
    ): Date | null {
        switch (periodType) {
            case 'yearly':
                return new Date(snapshot.selectedYear, 0, 1)
            case 'quarterly':
                if (snapshot.selectedQuarter === null) return null
                return new Date(snapshot.selectedYear, (snapshot.selectedQuarter - 1) * 3, 1)
            case 'monthly':
                if (snapshot.selectedMonth === null) return null
                return new Date(snapshot.selectedYear, snapshot.selectedMonth, 1)
            case 'weekly': {
                if (snapshot.selectedWeek === null || snapshot.selectedWeekYear === null)
                    return null
                // Reconstruct week date from ISO week number
                const jan4 = new Date(snapshot.selectedWeekYear, 0, 4)
                const jan4Day = jan4.getDay() || 7
                const mondayOfWeek1 = new Date(jan4)
                mondayOfWeek1.setDate(jan4.getDate() - jan4Day + 1)
                const weekDate = new Date(mondayOfWeek1)
                weekDate.setDate(mondayOfWeek1.getDate() + (snapshot.selectedWeek - 1) * 7)
                return weekDate
            }
            case 'daily':
                // Daily doesn't have a separate selection in context
                return null
        }
    }

    private cascadeDownwardWithSelection(periodType: PeriodType): void {
        const childTypes = getChildPeriodTypes(periodType).filter((ct) => this.columns.has(ct))

        for (const childType of childTypes) {
            const childState = this.columns.get(childType)
            if (!childState) continue

            const config = this.plugin.settings[childType]
            this.updateVirtualSelector(childState, config)

            if (childState.selectedDate && childState.virtualSelector) {
                childState.virtualSelector.setSelection(childState.selectedDate)
            }
        }
    }

    private renderEmptyState(message: string): void {
        const emptyEl = this.columnsEl.createDiv({ cls: 'pr-empty-state' })
        emptyEl.createDiv({ cls: 'pr-empty-state__icon' }).innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
            </svg>
        `
        emptyEl.createDiv({ cls: 'pr-empty-state__text', text: message })
    }

    private cleanupColumns(): void {
        for (const state of this.columns.values()) {
            // Unload NoteCard if present
            if (state.noteCard) {
                state.noteCard.unload()
            }
            // Unload virtual selector
            if (state.virtualSelector) {
                this.removeChild(state.virtualSelector)
            }
            state.column.unload()
        }
        this.columns.clear()
    }

    override onunload(): void {
        this.unsubscribeFromSettings?.()
        this.unsubscribeFromDoneReviews?.()
        this.cleanupColumns()
    }
}
