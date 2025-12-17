import { BasesView, BasesEntry } from 'obsidian'
import type { QueryController } from 'obsidian'
import type JournalBasesPlugin from '../../../main'
import { PERIODIC_NOTES_VIEW_TYPE } from './periodic-notes.constants'
import type { PeriodType, PeriodicNoteConfig } from '../../types/periodic-note.types'
import { NoteCard } from '../../components/note-card'
import { CreateNoteButton } from '../../components/create-note-button'
import { PeriodTabs } from '../../components/period-tabs'
import { NoteCreationService } from '../../services/note-creation.service'
import {
    detectPeriodType,
    extractDateFromNote,
    getEnabledPeriodTypes
} from '../../../utils/periodic-note-utils'
import {
    findMissingDates,
    getStartOfPeriod,
    sortDatesDescending,
    sortDatesAscending
} from '../../../utils/date-utils'

export class PeriodicNotesView extends BasesView {
    override type = PERIODIC_NOTES_VIEW_TYPE

    private plugin: JournalBasesPlugin
    private containerEl!: HTMLElement
    private noteCreationService: NoteCreationService
    private noteCards: NoteCard[] = []

    constructor(controller: QueryController, scrollEl: HTMLElement, plugin: JournalBasesPlugin) {
        super(controller)
        this.plugin = plugin
        this.noteCreationService = new NoteCreationService(this.app)
        this.containerEl = scrollEl.createDiv({ cls: 'periodic-notes-view' })
    }

    override onDataUpdated(): void {
        // Clean up previous cards
        this.cleanupCards()
        this.containerEl.empty()

        // Get current options from view config
        const mode = (this.config.get('mode') as PeriodType) ?? 'daily'
        const futurePeriods = (this.config.get('futurePeriods') as number) ?? 3
        const expandFirst = (this.config.get('expandFirst') as boolean) ?? true
        const showMissing = (this.config.get('showMissing') as boolean) ?? true

        // Check if mode is enabled in plugin settings
        const periodConfig = this.plugin.settings[mode]
        if (!periodConfig?.enabled) {
            this.renderEmptyState(
                `${this.capitalize(mode)} notes are not configured. Enable them in plugin settings.`
            )
            return
        }

        // Get enabled period types for tabs
        const enabledTypes = getEnabledPeriodTypes(this.plugin.settings)
        if (enabledTypes.length === 0) {
            this.renderEmptyState('No period types are enabled. Configure them in plugin settings.')
            return
        }

        // Render mode tabs
        this.renderModeTabs(enabledTypes, mode)

        // Filter entries by current mode (preserves Base sort order)
        const entries = this.data.data.filter(
            (entry) => detectPeriodType(entry.file, this.plugin.settings) === mode
        )

        // Determine sort direction from Base configuration
        const sortConfig = this.config.getSort()
        const firstSort = sortConfig[0]
        const isAscending = firstSort?.direction === 'ASC'

        // Extract dates from entries
        const existingDates = entries
            .map((e) => extractDateFromNote(e.file, periodConfig))
            .filter((d): d is Date => d !== null)

        // Find missing dates if enabled
        let missingDates: Date[] = []
        if (showMissing) {
            missingDates = findMissingDates(existingDates, mode, futurePeriods)
        }

        // Create a combined list of dates (existing + missing) sorted according to Base config
        const allDates = this.mergeAndSortDates(
            entries,
            missingDates,
            periodConfig,
            mode,
            isAscending
        )

        if (allDates.length === 0) {
            this.renderEmptyState('No notes found. Create your first note or check Base filters.')
            return
        }

        // Render cards container
        const cardsEl = this.containerEl.createDiv({ cls: 'pn-cards' })

        // Render cards for each date
        let isFirst = true
        for (const item of allDates) {
            if (item.entry) {
                this.renderNoteCard(cardsEl, item.entry, item.date, mode, isFirst && expandFirst)
            } else if (item.date && showMissing) {
                this.renderMissingCard(cardsEl, item.date, periodConfig, mode)
            }
            isFirst = false
        }
    }

    private mergeAndSortDates(
        entries: BasesEntry[],
        missingDates: Date[],
        config: PeriodicNoteConfig,
        periodType: PeriodType,
        ascending: boolean
    ): Array<{ date: Date; entry: BasesEntry | null }> {
        const items: Array<{ date: Date; entry: BasesEntry | null }> = []

        // Add existing entries
        for (const entry of entries) {
            const date = extractDateFromNote(entry.file, config)
            if (date) {
                items.push({ date, entry })
            }
        }

        // Add missing dates
        for (const date of missingDates) {
            // Check if this date already has an entry
            const normalizedDate = getStartOfPeriod(date, periodType)
            const exists = items.some(
                (item) =>
                    getStartOfPeriod(item.date, periodType).getTime() === normalizedDate.getTime()
            )
            if (!exists) {
                items.push({ date: normalizedDate, entry: null })
            }
        }

        // Sort dates according to Base configuration
        const sortedDates = ascending
            ? sortDatesAscending(items.map((i) => i.date))
            : sortDatesDescending(items.map((i) => i.date))
        const dateToItem = new Map(
            items.map((i) => [getStartOfPeriod(i.date, periodType).getTime(), i])
        )

        return sortedDates.map((d) => {
            const key = getStartOfPeriod(d, periodType).getTime()
            return dateToItem.get(key) ?? { date: d, entry: null }
        })
    }

    private renderModeTabs(enabledTypes: PeriodType[], currentMode: PeriodType): void {
        new PeriodTabs(this.containerEl, enabledTypes, currentMode, (newMode) => {
            this.config.set('mode', newMode)
            this.onDataUpdated()
        })
    }

    private renderNoteCard(
        container: HTMLElement,
        entry: BasesEntry,
        noteDate: Date | null,
        periodType: PeriodType,
        expanded: boolean
    ): void {
        const card = new NoteCard(
            container,
            this.app,
            entry.file,
            periodType,
            noteDate,
            expanded,
            (file) => {
                this.app.workspace.getLeaf('tab').openFile(file)
            }
        )
        this.noteCards.push(card)
    }

    private renderMissingCard(
        container: HTMLElement,
        date: Date,
        config: PeriodicNoteConfig,
        periodType: PeriodType
    ): void {
        new CreateNoteButton(container, date, config, periodType, async (d) => {
            const file = await this.noteCreationService.createPeriodicNote(d, config, periodType)
            if (file) {
                // Refresh view to show the new note
                this.onDataUpdated()
                return true
            }
            return false
        })
    }

    private renderEmptyState(message: string): void {
        const emptyEl = this.containerEl.createDiv({ cls: 'pn-empty-state' })
        emptyEl.createDiv({ cls: 'pn-empty-state__icon' }).innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
        `
        emptyEl.createDiv({ cls: 'pn-empty-state__text', text: message })
    }

    private capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1)
    }

    private cleanupCards(): void {
        for (const card of this.noteCards) {
            card.unload()
        }
        this.noteCards = []
    }

    override onunload(): void {
        this.cleanupCards()
    }
}
