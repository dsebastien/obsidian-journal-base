import { BasesView, BasesEntry, MarkdownRenderer, TFile, Notice } from 'obsidian'
import type { QueryController } from 'obsidian'
import type JournalBasesPlugin from '../../../main'
import { PERIODIC_REVIEW_VIEW_TYPE } from './periodic-review.constants'
import type { PeriodType, PeriodicNoteConfig } from '../../types'
import { FoldableColumn, CreateNoteButton } from '../../components'
import { NoteCreationService } from '../../services/note-creation.service'
import {
    extractDateFromNote,
    getEnabledPeriodTypes,
    filterEntriesByPeriodType,
    sortEntriesByDate
} from '../../../utils/periodic-note-utils'
import {
    getStartOfPeriod,
    getEndOfPeriod,
    getPeriodLabel,
    getYear,
    getWeek,
    getMonth,
    getQuarter,
    findMissingDates,
    isPeriodStartWithinParent
} from '../../../utils/date-utils'

// Period type order for columns
const PERIOD_TYPE_ORDER: PeriodType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']

// Period type labels
const PERIOD_TYPE_LABELS: Record<PeriodType, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly'
}

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

    // Context for filtering - selected periods control what's shown in other columns
    private selectedYear: number = new Date().getFullYear()
    private selectedQuarter: number | null = null // 1-4 or null for "all"
    private selectedMonth: number | null = null // 0-11 or null for "all"
    private selectedWeek: number | null = null // Week number or null for "all"

    constructor(controller: QueryController, scrollEl: HTMLElement, plugin: JournalBasesPlugin) {
        super(controller)
        this.plugin = plugin
        this.noteCreationService = new NoteCreationService(this.app)
        this.containerEl = scrollEl.createDiv({ cls: 'periodic-review-view' })
        this.columnsEl = this.containerEl.createDiv({ cls: 'pr-columns' })
    }

    override onDataUpdated(): void {
        // Clear previous columns
        this.cleanupColumns()
        this.columnsEl.empty()

        // Get enabled period types from plugin settings
        const enabledTypes = getEnabledPeriodTypes(this.plugin.settings)

        if (enabledTypes.length === 0) {
            this.renderEmptyState('No period types are enabled. Configure them in plugin settings.')
            return
        }

        // Check which columns should be shown based on view config
        const visibleTypes = this.getVisiblePeriodTypes(enabledTypes)

        if (visibleTypes.length === 0) {
            this.renderEmptyState(
                'No columns are enabled for this view. Enable columns in view options.'
            )
            return
        }

        // Get column width from config
        const columnWidth = (this.config.get('columnWidth') as number) ?? 400

        // Create columns for each visible period type in order
        for (const periodType of PERIOD_TYPE_ORDER) {
            if (!visibleTypes.includes(periodType)) continue

            const config = this.plugin.settings[periodType]
            if (!config.enabled) continue

            // Get entries for this period type
            const entries = filterEntriesByPeriodType(
                this.data.data,
                periodType,
                this.plugin.settings
            )
            const sortedEntries = sortEntriesByDate(entries, config, false)

            // Create column
            this.createColumn(periodType, config, sortedEntries, columnWidth)
        }

        // Auto-select most recent entries on initial load
        this.autoSelectMostRecent()
    }

    private getVisiblePeriodTypes(enabledTypes: PeriodType[]): PeriodType[] {
        const visibleTypes: PeriodType[] = []

        const showDaily = (this.config.get('showDaily') as boolean) ?? true
        const showWeekly = (this.config.get('showWeekly') as boolean) ?? true
        const showMonthly = (this.config.get('showMonthly') as boolean) ?? true
        const showQuarterly = (this.config.get('showQuarterly') as boolean) ?? false
        const showYearly = (this.config.get('showYearly') as boolean) ?? false

        if (showDaily && enabledTypes.includes('daily')) visibleTypes.push('daily')
        if (showWeekly && enabledTypes.includes('weekly')) visibleTypes.push('weekly')
        if (showMonthly && enabledTypes.includes('monthly')) visibleTypes.push('monthly')
        if (showQuarterly && enabledTypes.includes('quarterly')) visibleTypes.push('quarterly')
        if (showYearly && enabledTypes.includes('yearly')) visibleTypes.push('yearly')

        return visibleTypes
    }

    private createColumn(
        periodType: PeriodType,
        config: PeriodicNoteConfig,
        entries: BasesEntry[],
        width: number
    ): void {
        const column = new FoldableColumn(this.columnsEl, PERIOD_TYPE_LABELS[periodType])

        // Set column width
        column.setWidth(width)

        // Store column state
        const state: ColumnState = {
            periodType,
            column,
            selectedDate: null,
            entries
        }
        this.columns.set(periodType, state)

        // Render period selector
        this.renderPeriodSelector(state, config)
    }

    private renderPeriodSelector(state: ColumnState, config: PeriodicNoteConfig): void {
        const selectorEl = state.column.getSelectorEl()
        selectorEl.empty()

        // Get view options
        const showMissing = (this.config.get('showMissing') as boolean) ?? true
        const futurePeriods = (this.config.get('futurePeriods') as number) ?? 1

        // Get filtered entries based on current context
        const filteredEntries = this.filterEntriesByContext(state.entries, state.periodType, config)

        // Extract dates from filtered entries
        const dateEntryMap = new Map<number, BasesEntry>()
        const existingDates: Date[] = []

        for (const entry of filteredEntries) {
            const date = extractDateFromNote(entry.file, config)
            if (date) {
                const normalized = getStartOfPeriod(date, state.periodType)
                dateEntryMap.set(normalized.getTime(), entry)
                existingDates.push(normalized)
            }
        }

        // Find missing dates and future periods if enabled
        let missingDates: Date[] = []
        if (showMissing) {
            missingDates = findMissingDates(existingDates, state.periodType, futurePeriods)
            // Filter missing dates by context as well
            missingDates = this.filterMissingDatesByContext(missingDates, state.periodType)
        }

        // Combine existing and missing dates, sort descending
        const allDates = this.combineAndSortDates(existingDates, missingDates, state.periodType)

        if (allDates.length === 0) {
            const emptyEl = selectorEl.createDiv({ cls: 'pr-period-item pr-period-item--missing' })
            emptyEl.textContent = 'No periods available'
            return
        }

        // Current time for future date detection
        const now = new Date().getTime()

        // Render selector items
        for (const date of allDates) {
            const entry = dateEntryMap.get(date.getTime())
            const label = getPeriodLabel(date, state.periodType)
            const isMissing = !entry
            const isFuture = date.getTime() > now

            const classes = ['pr-period-item']
            if (isMissing) classes.push('pr-period-item--missing')
            if (isFuture) classes.push('pr-period-item--future')

            const itemEl = selectorEl.createDiv({ cls: classes.join(' ') })
            itemEl.textContent = label

            // Check if this is the selected date
            if (state.selectedDate && date.getTime() === state.selectedDate.getTime()) {
                itemEl.addClass('pr-period-item--selected')
            }

            // Click handler
            itemEl.addEventListener('click', () => {
                this.selectPeriod(state, date, entry ?? null)
            })
        }
    }

    /**
     * Filter missing dates by the current context (year, quarter, month, week).
     */
    private filterMissingDatesByContext(dates: Date[], periodType: PeriodType): Date[] {
        return dates.filter((date) => {
            const year = getYear(date)

            switch (periodType) {
                case 'yearly':
                    return true

                case 'quarterly':
                    return year === this.selectedYear

                case 'monthly':
                    if (year !== this.selectedYear) return false
                    if (this.selectedQuarter !== null) {
                        return getQuarter(date) === this.selectedQuarter
                    }
                    return true

                case 'weekly': {
                    if (year !== this.selectedYear) return false

                    if (this.selectedMonth !== null) {
                        const monthStart = new Date(this.selectedYear, this.selectedMonth, 1)
                        const monthEnd = getEndOfPeriod(monthStart, 'monthly')
                        return isPeriodStartWithinParent(date, 'weekly', monthStart, monthEnd)
                    }

                    if (this.selectedQuarter !== null) {
                        const quarterMonth = (this.selectedQuarter - 1) * 3
                        const quarterStart = new Date(this.selectedYear, quarterMonth, 1)
                        const quarterEnd = getEndOfPeriod(quarterStart, 'quarterly')
                        return isPeriodStartWithinParent(date, 'weekly', quarterStart, quarterEnd)
                    }

                    return true
                }

                case 'daily':
                    if (year !== this.selectedYear) return false

                    if (this.selectedWeek !== null) {
                        return getWeek(date) === this.selectedWeek
                    }

                    if (this.selectedMonth !== null) {
                        return getMonth(date) === this.selectedMonth
                    }

                    if (this.selectedQuarter !== null) {
                        return getQuarter(date) === this.selectedQuarter
                    }

                    return true
            }
        })
    }

    /**
     * Combine existing and missing dates, removing duplicates and sorting descending.
     */
    private combineAndSortDates(
        existingDates: Date[],
        missingDates: Date[],
        periodType: PeriodType
    ): Date[] {
        const combined = new Map<number, Date>()

        for (const date of existingDates) {
            combined.set(date.getTime(), date)
        }

        for (const date of missingDates) {
            const normalized = getStartOfPeriod(date, periodType)
            if (!combined.has(normalized.getTime())) {
                combined.set(normalized.getTime(), normalized)
            }
        }

        // Sort descending (newest first)
        return Array.from(combined.values()).sort((a, b) => b.getTime() - a.getTime())
    }

    private filterEntriesByContext(
        entries: BasesEntry[],
        periodType: PeriodType,
        config: PeriodicNoteConfig
    ): BasesEntry[] {
        // Filter entries based on the current context (selected year, quarter, month, week)
        return entries.filter((entry) => {
            const date = extractDateFromNote(entry.file, config)
            if (!date) return false

            const year = getYear(date)

            switch (periodType) {
                case 'yearly':
                    // Years are not filtered by context
                    return true

                case 'quarterly':
                    // Quarters filtered by year only
                    return year === this.selectedYear

                case 'monthly':
                    // Months filtered by year and optionally quarter
                    if (year !== this.selectedYear) return false
                    if (this.selectedQuarter !== null) {
                        const quarter = getQuarter(date)
                        return quarter === this.selectedQuarter
                    }
                    return true

                case 'weekly': {
                    // Weeks filtered by year and optionally quarter/month
                    // Key: filter by week START within parent period
                    if (year !== this.selectedYear) return false

                    if (this.selectedMonth !== null) {
                        // Week START must be within selected month
                        const monthStart = new Date(this.selectedYear, this.selectedMonth, 1)
                        const monthEnd = getEndOfPeriod(monthStart, 'monthly')
                        return isPeriodStartWithinParent(date, 'weekly', monthStart, monthEnd)
                    }

                    if (this.selectedQuarter !== null) {
                        // Week START must be within selected quarter
                        const quarterMonth = (this.selectedQuarter - 1) * 3
                        const quarterStart = new Date(this.selectedYear, quarterMonth, 1)
                        const quarterEnd = getEndOfPeriod(quarterStart, 'quarterly')
                        return isPeriodStartWithinParent(date, 'weekly', quarterStart, quarterEnd)
                    }

                    return true
                }

                case 'daily': {
                    // Days filtered by year, optionally quarter/month, and optionally week
                    if (year !== this.selectedYear) return false

                    // If week is selected, filter by week
                    if (this.selectedWeek !== null) {
                        return getWeek(date) === this.selectedWeek
                    }

                    // If month is selected, filter by month
                    if (this.selectedMonth !== null) {
                        return getMonth(date) === this.selectedMonth
                    }

                    // If quarter is selected, filter by quarter
                    if (this.selectedQuarter !== null) {
                        return getQuarter(date) === this.selectedQuarter
                    }

                    return true
                }
            }
        })
    }

    private selectPeriod(state: ColumnState, date: Date, entry: BasesEntry | null): void {
        state.selectedDate = date

        // Determine which columns need cascading based on period type hierarchy
        const affectedColumns: PeriodType[] = []

        switch (state.periodType) {
            case 'yearly':
                this.selectedYear = getYear(date)
                // Clear all shorter period contexts
                this.selectedQuarter = null
                this.selectedMonth = null
                this.selectedWeek = null
                affectedColumns.push('quarterly', 'monthly', 'weekly', 'daily')
                break

            case 'quarterly':
                this.selectedQuarter = getQuarter(date)
                // Clear shorter period contexts
                this.selectedMonth = null
                this.selectedWeek = null
                affectedColumns.push('monthly', 'weekly', 'daily')
                break

            case 'monthly':
                this.selectedMonth = getMonth(date)
                // Clear shorter period contexts
                this.selectedWeek = null
                affectedColumns.push('weekly', 'daily')
                break

            case 'weekly':
                this.selectedWeek = getWeek(date)
                affectedColumns.push('daily')
                break

            case 'daily':
                // No cascading needed for daily
                break
        }

        // Update selector UI for current column
        this.updateSelectorUI(state)

        // Render content for current column
        this.renderColumnContent(state, entry)

        // Cascade: refresh affected columns and auto-select most recent
        for (const periodType of affectedColumns) {
            const affectedState = this.columns.get(periodType)
            if (affectedState) {
                // Clear the selection for this column
                affectedState.selectedDate = null

                // Refresh the selector with new filtered data
                const config = this.plugin.settings[periodType]
                this.renderPeriodSelector(affectedState, config)

                // Auto-select most recent in this column
                this.autoSelectSingleColumn(affectedState, config)
            }
        }
    }

    private updateSelectorUI(state: ColumnState): void {
        const selectorEl = state.column.getSelectorEl()
        const items = selectorEl.querySelectorAll('.pr-period-item')

        items.forEach((item) => {
            item.removeClass('pr-period-item--selected')
        })

        if (state.selectedDate) {
            const label = getPeriodLabel(state.selectedDate, state.periodType)
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
            // Show create button for missing note
            if (state.selectedDate) {
                this.renderCreateNoteUI(contentEl, state)
            }
            return
        }

        // Render note content
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
                    // Re-render with new file
                    const entries = filterEntriesByPeriodType(
                        this.data.data,
                        state.periodType,
                        this.plugin.settings
                    )
                    state.entries = entries
                    this.renderPeriodSelector(state, config)
                    // Find and select the new entry
                    const newEntry = entries.find((e) => e.file.path === file.path)
                    if (newEntry && state.selectedDate) {
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

            // Parse sections from content
            const sections = this.parseContentSections(content)

            if (sections.length === 0) {
                // Render full content without sections
                const markdownEl = contentEl.createDiv({ cls: 'pr-markdown-content' })
                await MarkdownRenderer.render(this.app, content, markdownEl, file.path, this)
            } else {
                // Render sections with copy buttons
                for (const section of sections) {
                    this.renderSection(contentEl, section, state, file)
                }
            }
        } catch (error) {
            console.error('Failed to load note content:', error)
            contentEl.createDiv({
                cls: 'pn-card__error',
                text: 'Failed to load content'
            })
        }
    }

    private parseContentSections(
        content: string
    ): { heading: string; content: string; level: number }[] {
        const sections: { heading: string; content: string; level: number }[] = []
        const lines = content.split('\n')

        let currentSection: { heading: string; content: string; level: number } | null = null
        const contentLines: string[] = []

        for (const line of lines) {
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)

            if (headingMatch) {
                // Save previous section
                if (currentSection) {
                    currentSection.content = contentLines.join('\n').trim()
                    sections.push(currentSection)
                    contentLines.length = 0
                }

                // Start new section
                currentSection = {
                    heading: headingMatch[2]!,
                    content: '',
                    level: headingMatch[1]!.length
                }
            } else if (currentSection) {
                contentLines.push(line)
            }
        }

        // Save last section
        if (currentSection) {
            currentSection.content = contentLines.join('\n').trim()
            sections.push(currentSection)
        }

        return sections
    }

    private renderSection(
        containerEl: HTMLElement,
        section: { heading: string; content: string; level: number },
        state: ColumnState,
        file: TFile
    ): void {
        const sectionEl = containerEl.createDiv({ cls: 'pr-section' })

        // Header with copy button
        const headerEl = sectionEl.createDiv({ cls: 'pr-section__header' })
        headerEl.createEl(`h${section.level}` as keyof HTMLElementTagNameMap, {
            cls: 'pr-section__title',
            text: section.heading
        })

        // Copy button - only show if there are other columns to copy to
        if (this.columns.size > 1) {
            const copyBtn = headerEl.createEl('button', {
                cls: 'pr-copy-btn',
                text: 'Copy to...'
            })
            copyBtn.addEventListener('click', () => {
                this.showCopyMenu(copyBtn, section, state)
            })
        }

        // Content
        const contentEl = sectionEl.createDiv({ cls: 'pr-section__content pr-markdown-content' })
        MarkdownRenderer.render(this.app, section.content, contentEl, file.path, this)
    }

    private showCopyMenu(
        button: HTMLElement,
        section: { heading: string; content: string; level: number },
        sourceState: ColumnState
    ): void {
        // Create simple menu
        const menu = document.createElement('div')
        menu.addClass('menu')
        menu.style.position = 'absolute'
        menu.style.zIndex = '1000'

        const rect = button.getBoundingClientRect()
        menu.style.top = `${rect.bottom + 5}px`
        menu.style.left = `${rect.left}px`

        // Add menu items for each other column
        for (const [periodType, state] of this.columns) {
            if (periodType === sourceState.periodType) continue
            if (!state.selectedDate) continue

            // Find the entry for the selected date
            const config = this.plugin.settings[periodType]
            const entry = state.entries.find((e) => {
                const date = extractDateFromNote(e.file, config)
                return (
                    date &&
                    getStartOfPeriod(date, periodType).getTime() === state.selectedDate!.getTime()
                )
            })

            if (!entry) continue

            const menuItem = menu.createDiv({ cls: 'menu-item' })
            menuItem.textContent = `${PERIOD_TYPE_LABELS[periodType]}: ${getPeriodLabel(state.selectedDate, periodType)}`

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

        // Click outside to close
        const closeMenu = (e: MouseEvent) => {
            if (!menu.contains(e.target as Node)) {
                if (menu.parentNode) {
                    document.body.removeChild(menu)
                }
                document.removeEventListener('click', closeMenu)
            }
        }

        document.body.appendChild(menu)
        setTimeout(() => document.addEventListener('click', closeMenu), 0)
    }

    private async copySectionToFile(
        section: { heading: string; content: string; level: number },
        targetFile: TFile
    ): Promise<void> {
        try {
            const content = await this.app.vault.cachedRead(targetFile)
            const headingPrefix = '#'.repeat(section.level)
            const sectionHeader = `${headingPrefix} ${section.heading}`

            // Check if section already exists
            const sectionRegex = new RegExp(
                `^${headingPrefix}\\s+${this.escapeRegex(section.heading)}\\s*$`,
                'm'
            )

            if (sectionRegex.test(content)) {
                // Append to existing section
                const newContent = this.appendToSection(content, section)
                await this.app.vault.modify(targetFile, newContent)
                new Notice(`Appended to "${section.heading}" in ${targetFile.basename}`)
            } else {
                // Add new section at the end
                const newContent = `${content.trimEnd()}\n\n${sectionHeader}\n\n${section.content}\n`
                await this.app.vault.modify(targetFile, newContent)
                new Notice(`Added "${section.heading}" to ${targetFile.basename}`)
            }

            // Refresh target column
            this.refreshAllColumns()
        } catch (error) {
            console.error('Failed to copy section:', error)
            new Notice('Failed to copy section')
        }
    }

    private appendToSection(
        content: string,
        section: { heading: string; content: string; level: number }
    ): string {
        const lines = content.split('\n')
        const headingPrefix = '#'.repeat(section.level)
        const sectionRegex = new RegExp(
            `^${headingPrefix}\\s+${this.escapeRegex(section.heading)}\\s*$`
        )

        let inTargetSection = false
        let insertIndex = -1

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!

            if (sectionRegex.test(line)) {
                inTargetSection = true
                continue
            }

            if (inTargetSection) {
                // Check if we hit another heading of same or higher level
                const headingMatch = line.match(/^(#{1,6})\s+/)
                if (headingMatch && headingMatch[1]!.length <= section.level) {
                    insertIndex = i
                    break
                }
            }
        }

        // If we didn't find a next section, append at the end
        if (insertIndex === -1) {
            insertIndex = lines.length
        }

        // Insert content before the next section
        lines.splice(insertIndex, 0, '', section.content)

        return lines.join('\n')
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    private refreshAllColumns(): void {
        // Re-render all column contents
        for (const state of this.columns.values()) {
            if (state.selectedDate) {
                const config = this.plugin.settings[state.periodType]
                const entry = state.entries.find((e) => {
                    const date = extractDateFromNote(e.file, config)
                    return (
                        date &&
                        getStartOfPeriod(date, state.periodType).getTime() ===
                            state.selectedDate!.getTime()
                    )
                })
                this.renderColumnContent(state, entry ?? null)
            }
        }
    }

    private autoSelectMostRecent(): void {
        // Auto-select entries in each column, preferring current period then falling back to closest
        // Process in reverse order (yearly first) so cascading works properly
        const columnTypes = Array.from(this.columns.keys()).reverse()

        for (const periodType of columnTypes) {
            const state = this.columns.get(periodType)
            if (!state) continue

            const config = this.plugin.settings[periodType]
            const filteredEntries = this.filterEntriesByContext(state.entries, periodType, config)

            if (filteredEntries.length > 0) {
                // Try to find entry for current period first
                const currentPeriodDate = getStartOfPeriod(new Date(), periodType)
                const currentPeriodEntry = filteredEntries.find((entry) => {
                    const date = extractDateFromNote(entry.file, config)
                    if (!date) return false
                    return (
                        getStartOfPeriod(date, periodType).getTime() === currentPeriodDate.getTime()
                    )
                })

                if (currentPeriodEntry) {
                    // Current period exists, select it
                    this.selectPeriod(state, currentPeriodDate, currentPeriodEntry)
                } else {
                    // Fall back to most recent
                    const sortedEntries = sortEntriesByDate(filteredEntries, config, false)
                    const mostRecent = sortedEntries[0]
                    if (mostRecent) {
                        const date = extractDateFromNote(mostRecent.file, config)
                        if (date) {
                            this.selectPeriod(state, getStartOfPeriod(date, periodType), mostRecent)
                        }
                    }
                }
            }
        }
    }

    /**
     * Auto-select an entry in a single column without triggering cascading.
     * Prefers the current period, falls back to most recent.
     * Used when cascading from a parent period selection.
     */
    private autoSelectSingleColumn(state: ColumnState, config: PeriodicNoteConfig): void {
        const filteredEntries = this.filterEntriesByContext(state.entries, state.periodType, config)

        if (filteredEntries.length > 0) {
            // Try to find entry for current period first
            const currentPeriodDate = getStartOfPeriod(new Date(), state.periodType)
            const currentPeriodEntry = filteredEntries.find((entry) => {
                const date = extractDateFromNote(entry.file, config)
                if (!date) return false
                return (
                    getStartOfPeriod(date, state.periodType).getTime() ===
                    currentPeriodDate.getTime()
                )
            })

            if (currentPeriodEntry) {
                // Current period exists, select it
                state.selectedDate = currentPeriodDate
                this.updateSelectorUI(state)
                this.renderColumnContent(state, currentPeriodEntry)
                return
            }

            // Fall back to most recent
            const sortedEntries = sortEntriesByDate(filteredEntries, config, false)
            const mostRecent = sortedEntries[0]
            if (mostRecent) {
                const date = extractDateFromNote(mostRecent.file, config)
                if (date) {
                    const normalizedDate = getStartOfPeriod(date, state.periodType)
                    state.selectedDate = normalizedDate
                    this.updateSelectorUI(state)
                    this.renderColumnContent(state, mostRecent)
                    return
                }
            }
        }

        // No entries available - clear content
        state.selectedDate = null
        this.updateSelectorUI(state)
        state.column.getContentEl().empty()
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
        this.cleanupColumns()
    }
}
