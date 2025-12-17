import { BasesView, BasesEntry, MarkdownRenderer, TFile, Notice } from 'obsidian'
import type { QueryController } from 'obsidian'
import type JournalBasesPlugin from '../../../main'
import { PERIODIC_REVIEW_VIEW_TYPE } from './periodic-review.constants'
import type { PeriodType, PeriodicNoteConfig } from '../../types'
import { FoldableColumn } from '../../components/foldable-column'
import { CreateNoteButton } from '../../components/create-note-button'
import { NoteCreationService } from '../../services/note-creation.service'
import {
    extractDateFromNote,
    getEnabledPeriodTypes,
    filterEntriesByPeriodType,
    sortEntriesByDate
} from '../../../utils/periodic-note-utils'
import {
    getStartOfPeriod,
    getPeriodLabel,
    sortDatesDescending,
    getYear,
    getWeek
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

    // Context for filtering - selected year controls what's shown in other columns
    private selectedYear: number = new Date().getFullYear()
    private selectedWeek: number = getWeek(new Date())

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
        column.getElement().style.minWidth = `${width}px`
        column.getElement().style.maxWidth = `${width}px`

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

        // Get filtered entries based on current context
        const filteredEntries = this.filterEntriesByContext(state.entries, state.periodType, config)

        // Extract dates from filtered entries
        const dateEntryMap = new Map<number, BasesEntry>()
        const dates: Date[] = []

        for (const entry of filteredEntries) {
            const date = extractDateFromNote(entry.file, config)
            if (date) {
                const normalized = getStartOfPeriod(date, state.periodType)
                dateEntryMap.set(normalized.getTime(), entry)
                dates.push(normalized)
            }
        }

        // Sort dates descending
        const sortedDates = sortDatesDescending(dates)

        if (sortedDates.length === 0) {
            const emptyEl = selectorEl.createDiv({ cls: 'pr-period-item pr-period-item--missing' })
            emptyEl.textContent = 'No notes available'
            return
        }

        // Render selector items
        for (const date of sortedDates) {
            const entry = dateEntryMap.get(date.getTime())
            const label = getPeriodLabel(date, state.periodType)

            const itemEl = selectorEl.createDiv({
                cls: `pr-period-item ${entry ? '' : 'pr-period-item--missing'}`
            })
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

    private filterEntriesByContext(
        entries: BasesEntry[],
        periodType: PeriodType,
        config: PeriodicNoteConfig
    ): BasesEntry[] {
        // Filter entries based on the current context (selected year, month, etc.)
        return entries.filter((entry) => {
            const date = extractDateFromNote(entry.file, config)
            if (!date) return false

            const year = getYear(date)

            switch (periodType) {
                case 'yearly':
                    // Show all years
                    return true
                case 'quarterly':
                    // Show quarters for selected year
                    return year === this.selectedYear
                case 'monthly':
                    // Show months for selected year
                    return year === this.selectedYear
                case 'weekly':
                    // Show weeks for selected year
                    return year === this.selectedYear
                case 'daily':
                    // Show days for selected week and year
                    return year === this.selectedYear && getWeek(date) === this.selectedWeek
            }
        })
    }

    private selectPeriod(state: ColumnState, date: Date, entry: BasesEntry | null): void {
        state.selectedDate = date

        // Update context based on period type
        const year = getYear(date)
        if (state.periodType === 'yearly') {
            this.selectedYear = year
            // Refresh other columns to filter by new year
            this.refreshAllSelectors()
        } else if (state.periodType === 'weekly') {
            this.selectedWeek = getWeek(date)
            // Refresh daily column to filter by new week
            this.refreshColumnSelector('daily')
        }

        // Update selector UI
        this.updateSelectorUI(state)

        // Render content
        this.renderColumnContent(state, entry)
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

    private refreshAllSelectors(): void {
        for (const [periodType, state] of this.columns) {
            if (periodType !== 'yearly') {
                const config = this.plugin.settings[periodType]
                this.renderPeriodSelector(state, config)
            }
        }
    }

    private refreshColumnSelector(periodType: PeriodType): void {
        const state = this.columns.get(periodType)
        if (state) {
            const config = this.plugin.settings[periodType]
            this.renderPeriodSelector(state, config)
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
        // Auto-select the most recent entry in each column
        for (const [periodType, state] of this.columns) {
            const config = this.plugin.settings[periodType]
            const filteredEntries = this.filterEntriesByContext(state.entries, periodType, config)

            if (filteredEntries.length > 0) {
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
