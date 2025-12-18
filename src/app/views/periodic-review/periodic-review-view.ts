import { BasesView, BasesEntry, Notice, type TFile } from 'obsidian'
import type { QueryController } from 'obsidian'
import type JournalBasesPlugin from '../../../main'
import type { PeriodType, PeriodicNoteConfig, LifeTrackerPluginFileProvider } from '../../types'
import { FoldableColumn, CreateNoteButton, NoteCard, type CardMode } from '../../components'
import { NoteCreationService } from '../../services/note-creation.service'
import {
    extractDateFromNote,
    getEnabledPeriodTypes,
    filterEntriesByPeriodType,
    sortEntriesByDate
} from '../../../utils/periodic-note-utils'
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

// Plus icon for create button in column header
const PLUS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`

/**
 * State for preserving NoteCard state during reconciliation
 */
interface NoteCardState {
    expanded: boolean
    mode: CardMode
    hasActiveEditor: boolean
}

interface ColumnState {
    periodType: PeriodType
    column: FoldableColumn
    selectedDate: Date | null
    entries: BasesEntry[]
    noteCard: NoteCard | null
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
    private isFirstLoad: boolean = true
    private unsubscribeFromSettings: (() => void) | null = null
    private savedNoteCardStates: Map<string, NoteCardState> = new Map()

    constructor(controller: QueryController, scrollEl: HTMLElement, plugin: JournalBasesPlugin) {
        super(controller)
        this.plugin = plugin
        this.noteCreationService = new NoteCreationService(this.app)
        this.containerEl = scrollEl.createDiv({ cls: 'periodic-review-view' })
        this.columnsEl = this.containerEl.createDiv({ cls: 'pr-columns' })

        // Register as active file provider for commands (Life Tracker compatibility)
        this.plugin.setActiveFileProvider(this)

        // Subscribe to plugin settings changes to re-render when configuration changes
        this.unsubscribeFromSettings = this.plugin.onSettingsChange(() => {
            this.onDataUpdated()
        })
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

    override onDataUpdated(): void {
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

        // Save NoteCard states before cleanup (keyed by file path)
        const savedNoteCardStates = this.captureNoteCardStates()

        this.cleanupColumns()
        this.columnsEl.empty()
        this.savedNoteCardStates = savedNoteCardStates

        this.enabledTypes = newEnabledTypes
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

            const entries = filterEntriesByPeriodType(
                this.data.data,
                periodType,
                this.plugin.settings
            )
            const sortedEntries = sortEntriesByDate(entries, config, false)
            this.createColumn(periodType, config, sortedEntries, columnWidth)
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
     */
    private incrementalUpdate(): void {
        // Update entries for each column
        for (const [periodType, state] of this.columns) {
            const config = this.plugin.settings[periodType]
            if (!config.enabled) continue

            const entries = filterEntriesByPeriodType(
                this.data.data,
                periodType,
                this.plugin.settings
            )
            state.entries = sortEntriesByDate(entries, config, false)

            // Update the period selector (in case entries changed)
            this.renderPeriodSelector(state, config)

            // If there's a selected period, refresh the NoteCard
            if (state.selectedDate && state.noteCard) {
                // Skip refresh if editor is active - the data update was likely caused by this editor
                if (!state.noteCard.hasActiveEditor()) {
                    state.noteCard.refreshContent()
                }
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

        const state: ColumnState = {
            periodType,
            column,
            selectedDate: null,
            entries,
            noteCard: null
        }
        this.columns.set(periodType, state)

        // Add create next year button for yearly column
        if (periodType === 'yearly') {
            this.renderCreateNextYearButton(state, config)
        }

        this.renderPeriodSelector(state, config)
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
                this.renderPeriodSelector(state, config)
                new Notice(`Created ${nextYear} note`)
            } else {
                createBtn.disabled = false
                createBtn.removeClass('pr-column__create-btn--loading')
            }
        })
    }

    private renderPeriodSelector(state: ColumnState, config: PeriodicNoteConfig): void {
        const selectorEl = state.column.getSelectorEl()
        selectorEl.empty()

        const parentMissingMessage = this.getParentMissingMessage(state.periodType)
        if (parentMissingMessage) {
            this.renderParentMissingMessage(selectorEl, parentMissingMessage)
            state.column.getContentEl().empty()
            return
        }

        const { dates, dateEntryMap } = this.getAvailableDatesForColumn(state, config)

        if (dates.length === 0) {
            selectorEl.createDiv({
                cls: 'pr-period-item pr-period-item--missing',
                text: 'No periods available'
            })
            return
        }

        const now = Date.now()

        for (const date of dates) {
            const entry = dateEntryMap.get(date.getTime())
            const label = formatFilenameWithSuffix(date, config.format, state.periodType)
            const isMissing = !entry
            const isFuture = date.getTime() > now

            const classes = ['pr-period-item']
            if (isMissing) classes.push('pr-period-item--missing')
            if (isFuture) classes.push('pr-period-item--future')
            if (isCurrentPeriod(date, state.periodType)) {
                classes.push('pr-period-item--current')
            }
            if (state.selectedDate && date.getTime() === state.selectedDate.getTime()) {
                classes.push('pr-period-item--selected')
            }

            const itemEl = selectorEl.createDiv({ cls: classes.join(' '), text: label })
            itemEl.addEventListener('click', () => this.selectPeriod(state, date, entry ?? null))
        }
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
        const filteredEntries = filterEntriesByContext(
            state.entries,
            state.periodType,
            config,
            this.context,
            this.enabledTypes
        )
        const dateEntryMap = new Map<number, BasesEntry>()

        for (const entry of filteredEntries) {
            const date = extractDateFromNote(entry.file, config)
            if (date) {
                const normalized = getStartOfPeriod(date, state.periodType)
                dateEntryMap.set(normalized.getTime(), entry)
            }
        }

        const contextPeriods = generatePeriodsForContext(
            state.periodType,
            this.context,
            this.enabledTypes
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

        this.context.updateForPeriod(state.periodType, date, exists)
        this.updateSelectorUI(state)
        this.renderColumnContent(state, entry)
        this.cascadeDownward(state.periodType)
    }

    private cascadeDownward(periodType: PeriodType): void {
        const childTypes = getChildPeriodTypes(periodType).filter((ct) => this.columns.has(ct))

        for (const childType of childTypes) {
            const childState = this.columns.get(childType)
            if (!childState) continue

            childState.selectedDate = null
            this.context.setExists(childType, false)

            const config = this.plugin.settings[childType]
            this.renderPeriodSelector(childState, config)
            childState.column.getContentEl().empty()
        }
    }

    private updateSelectorUI(state: ColumnState): void {
        const selectorEl = state.column.getSelectorEl()
        const items = selectorEl.querySelectorAll('.pr-period-item')

        items.forEach((item) => item.removeClass('pr-period-item--selected'))

        if (state.selectedDate) {
            const config = this.plugin.settings[state.periodType]
            const label = formatFilenameWithSuffix(
                state.selectedDate,
                config.format,
                state.periodType
            )
            items.forEach((item) => {
                if (item.textContent === label) {
                    item.addClass('pr-period-item--selected')
                }
            })
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

        // Check for saved state for this file (to restore editor mode)
        const savedState = this.savedNoteCardStates.get(entry.file.path)

        // Create NoteCard with the same component used in periodic notes view
        // In review view, cards are not foldable (always expanded)
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
            { foldable: false }
        )

        // Restore editor mode if there was a previous state
        if (savedState && savedState.mode !== 'view') {
            state.noteCard.setMode(savedState.mode)
        }
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
                    this.renderPeriodSelector(state, config)
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
            this.updateSelectorUI(state)
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
            this.updateSelectorUI(state)
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
            this.renderPeriodSelector(childState, config)

            if (childState.selectedDate) {
                this.updateSelectorUI(childState)
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

    /**
     * Capture the state of all NoteCards before cleanup.
     * Returns a map keyed by file path.
     */
    private captureNoteCardStates(): Map<string, NoteCardState> {
        const states = new Map<string, NoteCardState>()
        for (const state of this.columns.values()) {
            if (state.noteCard) {
                states.set(state.noteCard.getFile().path, {
                    expanded: state.noteCard.isExpanded(),
                    mode: state.noteCard.getMode(),
                    hasActiveEditor: state.noteCard.hasActiveEditor()
                })
            }
        }
        return states
    }

    private cleanupColumns(): void {
        for (const state of this.columns.values()) {
            // Unload NoteCard if present
            if (state.noteCard) {
                state.noteCard.unload()
            }
            state.column.unload()
        }
        this.columns.clear()
    }

    override onunload(): void {
        this.unsubscribeFromSettings?.()
        this.cleanupColumns()
    }
}
