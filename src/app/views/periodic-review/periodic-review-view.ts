import { BasesView, BasesEntry, MarkdownRenderer, TFile, Notice } from 'obsidian'
import type { QueryController } from 'obsidian'
import type JournalBasesPlugin from '../../../main'
import type { PeriodType, PeriodicNoteConfig } from '../../types'
import { FoldableColumn, CreateNoteButton } from '../../components'
import { NoteCreationService } from '../../services/note-creation.service'
import {
    extractDateFromNote,
    getEnabledPeriodTypes,
    filterEntriesByPeriodType,
    sortEntriesByDate
} from '../../../utils/periodic-note-utils'
import { getStartOfPeriod, formatFilenameWithSuffix } from '../../../utils/date-utils'
import {
    parseMarkdownSections,
    sectionExists,
    appendToSection,
    addSection,
    type MarkdownSection
} from '../../../utils/markdown-section-utils'
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

interface ColumnState {
    periodType: PeriodType
    column: FoldableColumn
    selectedDate: Date | null
    entries: BasesEntry[]
}

export class PeriodicReviewView extends BasesView {
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

    constructor(controller: QueryController, scrollEl: HTMLElement, plugin: JournalBasesPlugin) {
        super(controller)
        this.plugin = plugin
        this.noteCreationService = new NoteCreationService(this.app)
        this.containerEl = scrollEl.createDiv({ cls: 'periodic-review-view' })
        this.columnsEl = this.containerEl.createDiv({ cls: 'pr-columns' })

        // Subscribe to plugin settings changes to re-render when configuration changes
        this.unsubscribeFromSettings = this.plugin.onSettingsChange(() => {
            this.onDataUpdated()
        })
    }

    override onDataUpdated(): void {
        // Save current selection state before rebuilding
        const savedSnapshot = this.context.saveSnapshot()
        const hadSelection = !this.isFirstLoad

        this.cleanupColumns()
        this.columnsEl.empty()

        this.enabledTypes = getEnabledPeriodTypes(this.plugin.settings)
        if (this.enabledTypes.length === 0) {
            this.renderEmptyState('No period types are enabled. Configure them in plugin settings.')
            return
        }

        const visibleTypes = this.getVisiblePeriodTypes(this.enabledTypes)
        if (visibleTypes.length === 0) {
            this.renderEmptyState(
                'No columns are enabled for this view. Enable columns in view options.'
            )
            return
        }

        const columnWidth = (this.config.get('columnWidth') as number) ?? 400

        // Create columns for each visible period type in order
        for (const periodType of PERIOD_TYPE_ORDER) {
            if (!visibleTypes.includes(periodType)) continue

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

        const state: ColumnState = { periodType, column, selectedDate: null, entries }
        this.columns.set(periodType, state)
        this.renderPeriodSelector(state, config)
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
        contextPeriods.sort((a, b) => b.getTime() - a.getTime())

        return { dates: contextPeriods, dateEntryMap }
    }

    private selectPeriod(state: ColumnState, date: Date, entry: BasesEntry | null): void {
        state.selectedDate = date
        const exists = entry !== null

        this.context.updateForPeriod(state.periodType, date, exists)
        this.cascadeUpward(state.periodType, date, exists)
        this.updateSelectorUI(state)
        this.renderColumnContent(state, entry)
        this.cascadeDownward(state.periodType)
    }

    private cascadeUpward(periodType: PeriodType, date: Date, exists: boolean): void {
        if (!exists) return

        const parentTypes = getParentPeriodTypes(periodType).filter((pt) => this.columns.has(pt))

        for (const parentType of parentTypes) {
            const parentState = this.columns.get(parentType)
            if (!parentState) continue

            const parentDate = getStartOfPeriod(date, parentType)
            const config = this.plugin.settings[parentType]

            const parentEntry = parentState.entries.find((e) => {
                const entryDate = extractDateFromNote(e.file, config)
                return (
                    entryDate &&
                    getStartOfPeriod(entryDate, parentType).getTime() === parentDate.getTime()
                )
            })

            parentState.selectedDate = parentDate
            this.context.updateParentContext(parentType, parentDate, parentEntry !== null)
            this.updateSelectorUI(parentState)
            this.renderColumnContent(parentState, parentEntry ?? null)
        }
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

    private async renderColumnContent(state: ColumnState, entry: BasesEntry | null): Promise<void> {
        const contentEl = state.column.getContentEl()
        contentEl.empty()

        if (!entry) {
            if (state.selectedDate) {
                this.renderCreateNoteUI(contentEl, state)
            }
            return
        }

        await this.renderNoteContent(contentEl, entry.file, state)
    }

    private renderCreateNoteUI(contentEl: HTMLElement, state: ColumnState): void {
        const config = this.plugin.settings[state.periodType]
        const createContainer = contentEl.createDiv({ cls: 'pr-create-note' })

        createContainer.createDiv({
            cls: 'pr-create-note__message',
            text: `This ${state.periodType} note doesn't exist yet.`
        })

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
            }
        )
    }

    private async renderNoteContent(
        contentEl: HTMLElement,
        file: TFile,
        state: ColumnState
    ): Promise<void> {
        try {
            const content = await this.app.vault.cachedRead(file)
            const sections = parseMarkdownSections(content)

            if (sections.length === 0) {
                const markdownEl = contentEl.createDiv({ cls: 'pr-markdown-content' })
                await MarkdownRenderer.render(this.app, content, markdownEl, file.path, this)
            } else {
                for (const section of sections) {
                    this.renderSection(contentEl, section, state, file)
                }
            }
        } catch (error) {
            console.error('Failed to load note content:', error)
            contentEl.createDiv({ cls: 'pn-card__error', text: 'Failed to load content' })
        }
    }

    private renderSection(
        containerEl: HTMLElement,
        section: MarkdownSection,
        state: ColumnState,
        file: TFile
    ): void {
        const sectionEl = containerEl.createDiv({ cls: 'pr-section' })
        const headerEl = sectionEl.createDiv({ cls: 'pr-section__header' })

        headerEl.createEl(`h${section.level}` as keyof HTMLElementTagNameMap, {
            cls: 'pr-section__title',
            text: section.heading
        })

        if (this.columns.size > 1) {
            const copyBtn = headerEl.createEl('button', { cls: 'pr-copy-btn', text: 'Copy to...' })
            copyBtn.addEventListener('click', () => this.showCopyMenu(copyBtn, section, state))
        }

        const contentEl = sectionEl.createDiv({ cls: 'pr-section__content pr-markdown-content' })
        MarkdownRenderer.render(this.app, section.content, contentEl, file.path, this)
    }

    private showCopyMenu(
        button: HTMLElement,
        section: MarkdownSection,
        sourceState: ColumnState
    ): void {
        const menu = document.createElement('div')
        menu.addClass('menu')
        menu.style.position = 'absolute'
        menu.style.zIndex = '1000'

        const rect = button.getBoundingClientRect()
        menu.style.top = `${rect.bottom + 5}px`
        menu.style.left = `${rect.left}px`

        for (const [periodType, state] of this.columns) {
            if (periodType === sourceState.periodType || !state.selectedDate) continue

            const config = this.plugin.settings[periodType]
            const entry = this.findEntryForDate(state, config)
            if (!entry) continue

            const menuItem = menu.createDiv({ cls: 'menu-item' })
            menuItem.textContent = `${PERIOD_TYPE_LABELS[periodType]}: ${formatFilenameWithSuffix(state.selectedDate, config.format, periodType)}`
            menuItem.addEventListener('click', async () => {
                await this.copySectionToFile(section, entry.file)
                document.body.removeChild(menu)
            })
        }

        if (menu.children.length === 0) {
            const emptyItem = menu.createDiv({ cls: 'menu-item' })
            emptyItem.textContent = 'No target notes available'
            emptyItem.style.opacity = '0.5'
        }

        const closeMenu = (e: MouseEvent): void => {
            if (!menu.contains(e.target as Node)) {
                if (menu.parentNode) document.body.removeChild(menu)
                document.removeEventListener('click', closeMenu)
            }
        }

        document.body.appendChild(menu)
        setTimeout(() => document.addEventListener('click', closeMenu), 0)
    }

    private findEntryForDate(
        state: ColumnState,
        config: PeriodicNoteConfig
    ): BasesEntry | undefined {
        return state.entries.find((e) => {
            const date = extractDateFromNote(e.file, config)
            return (
                date &&
                getStartOfPeriod(date, state.periodType).getTime() === state.selectedDate!.getTime()
            )
        })
    }

    private async copySectionToFile(section: MarkdownSection, targetFile: TFile): Promise<void> {
        try {
            const content = await this.app.vault.cachedRead(targetFile)
            let newContent: string

            if (sectionExists(content, section.heading, section.level)) {
                newContent = appendToSection(content, section, section.content)
                await this.app.vault.modify(targetFile, newContent)
                new Notice(`Appended to "${section.heading}" in ${targetFile.basename}`)
            } else {
                newContent = addSection(content, section)
                await this.app.vault.modify(targetFile, newContent)
                new Notice(`Added "${section.heading}" to ${targetFile.basename}`)
            }

            this.refreshAllColumns()
        } catch (error) {
            console.error('Failed to copy section:', error)
            new Notice('Failed to copy section')
        }
    }

    private refreshAllColumns(): void {
        for (const state of this.columns.values()) {
            if (state.selectedDate) {
                const config = this.plugin.settings[state.periodType]
                const entry = this.findEntryForDate(state, config)
                this.renderColumnContent(state, entry ?? null)
            }
        }
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

    private cleanupColumns(): void {
        for (const state of this.columns.values()) {
            state.column.unload()
        }
        this.columns.clear()
    }

    override onunload(): void {
        this.unsubscribeFromSettings?.()
        this.cleanupColumns()
    }
}
