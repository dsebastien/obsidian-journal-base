import { BasesView, BasesEntry, type TFile } from 'obsidian'
import type { QueryController } from 'obsidian'
import type JournalBasesPlugin from '../../../main'
import { PERIODIC_NOTES_VIEW_TYPE } from './periodic-notes.constants'
import type { PeriodType, PeriodicNoteConfig, LifeTrackerPluginFileProvider } from '../../types'
import { NoteCard } from '../../components/note-card'
import type { CardMode } from '../../components/note-card'
import { CreateNoteButton } from '../../components/create-note-button'
import { PeriodTabs } from '../../components/period-tabs'
import { NoteCreationService } from '../../services/note-creation.service'
import {
    detectPeriodType,
    extractDateFromNote,
    getEnabledPeriodTypes
} from '../../../utils/periodic-note-utils'
import { findMissingDates, getStartOfPeriod, sortDatesDescending } from '../../../utils/date-utils'

/**
 * State for preserving card state during reconciliation
 */
interface CardState {
    expanded: boolean
    mode: CardMode
    hasActiveEditor: boolean
}

export class PeriodicNotesView extends BasesView implements LifeTrackerPluginFileProvider {
    override type = PERIODIC_NOTES_VIEW_TYPE

    private plugin: JournalBasesPlugin
    private containerEl!: HTMLElement
    private cardsContainerEl: HTMLElement | null = null
    private noteCreationService: NoteCreationService
    private noteCards: Map<string, NoteCard> = new Map() // Keyed by file path
    private currentMode: PeriodType | null = null
    private currentEntries: BasesEntry[] = [] // Filtered entries for the current mode

    constructor(controller: QueryController, scrollEl: HTMLElement, plugin: JournalBasesPlugin) {
        super(controller)
        this.plugin = plugin
        this.noteCreationService = new NoteCreationService(this.app)
        this.containerEl = scrollEl.createDiv({ cls: 'periodic-notes-view' })

        // Register as active file provider for commands
        this.plugin.setActiveFileProvider(this)
    }

    /**
     * Compatibility with the Life Tracker plugin
     * Get files from this view for commands.
     * If cards are being edited, those are returned
     * Otherwise returns all the current Base view files sorted newest to oldest.
     */
    getFiles(): TFile[] {
        // Check if any card is currently focused (actively being edited)
        const activeNotes: TFile[] = []
        for (const card of this.noteCards.values()) {
            if (card.hasActiveEditor()) {
                activeNotes.push(card.getFile())
            }
        }
        if (activeNotes.length > 0) {
            return activeNotes
        }

        // currentEntries is already sorted newest to oldest
        return this.currentEntries.map((entry) => entry.file)
    }

    /**
     * Compatibility with the Life Tracker plugin
     * @returns
     */
    getFilterMode(): 'never' {
        return 'never'
    }

    override onDataUpdated(): void {
        // Get current options from view config
        const mode = (this.config.get('mode') as PeriodType) ?? 'daily'
        const futurePeriods = (this.config.get('futurePeriods') as number) ?? 3
        const expandFirst = (this.config.get('expandFirst') as boolean) ?? true
        const showMissing = (this.config.get('showMissing') as boolean) ?? true

        // Check if mode changed - requires full rebuild
        const modeChanged = this.currentMode !== mode
        this.currentMode = mode

        // Check if mode is enabled in plugin settings
        const periodConfig = this.plugin.settings[mode]
        if (!periodConfig?.enabled) {
            this.cleanupCards()
            this.containerEl.empty()
            this.cardsContainerEl = null
            this.renderEmptyState(
                `${this.capitalize(mode)} notes are not configured. Enable them in plugin settings.`
            )
            return
        }

        // Get enabled period types for tabs
        const enabledTypes = getEnabledPeriodTypes(this.plugin.settings)
        if (enabledTypes.length === 0) {
            this.cleanupCards()
            this.containerEl.empty()
            this.cardsContainerEl = null
            this.renderEmptyState('No period types are enabled. Configure them in plugin settings.')
            return
        }

        // Filter entries by current mode and sort by date descending (newest to oldest)
        this.currentEntries = this.data.data
            .filter((entry) => detectPeriodType(entry.file, this.plugin.settings) === mode)
            .map((entry) => ({
                entry,
                date: extractDateFromNote(entry.file, periodConfig)
            }))
            .filter((e): e is { entry: BasesEntry; date: Date } => e.date !== null)
            .sort((a, b) => b.date.getTime() - a.date.getTime())
            .map((e) => e.entry)

        // Extract dates from entries
        const existingDates = this.currentEntries
            .map((e) => extractDateFromNote(e.file, periodConfig))
            .filter((d): d is Date => d !== null)

        // Find missing dates if enabled
        let missingDates: Date[] = []
        if (showMissing) {
            missingDates = findMissingDates(existingDates, mode, futurePeriods)
        }

        // Create a combined list of dates (existing + missing) sorted newest to oldest
        const allDates = this.mergeAndSortDates(
            this.currentEntries,
            missingDates,
            periodConfig,
            mode
        )

        if (allDates.length === 0) {
            this.cleanupCards()
            this.containerEl.empty()
            this.cardsContainerEl = null
            this.renderEmptyState('No notes found. Create your first note or check Base filters.')
            return
        }

        // If mode changed or container doesn't exist, do a full rebuild
        if (modeChanged || !this.cardsContainerEl) {
            this.cleanupCards()
            this.containerEl.empty()

            // Render mode tabs
            this.renderModeTabs(enabledTypes, mode)

            // Render cards container
            this.cardsContainerEl = this.containerEl.createDiv({ cls: 'pn-cards' })

            // Render cards for each date
            let isFirst = true
            for (const item of allDates) {
                if (item.entry) {
                    this.renderNoteCard(
                        this.cardsContainerEl,
                        item.entry,
                        item.date,
                        mode,
                        isFirst && expandFirst
                    )
                } else if (item.date && showMissing) {
                    this.renderMissingCard(this.cardsContainerEl, item.date, periodConfig, mode)
                }
                isFirst = false
            }
        } else {
            // Reconcile existing cards with new data
            this.reconcileCards(allDates, periodConfig, mode, showMissing)
        }
    }

    /**
     * Reconcile existing cards with new data, preserving state where possible
     */
    private reconcileCards(
        allDates: Array<{ date: Date; entry: BasesEntry | null }>,
        config: PeriodicNoteConfig,
        periodType: PeriodType,
        showMissing: boolean
    ): void {
        if (!this.cardsContainerEl) return

        // Capture current state of all cards
        const cardStates = new Map<string, CardState>()
        for (const [path, card] of this.noteCards) {
            cardStates.set(path, {
                expanded: card.isExpanded(),
                mode: card.getMode(),
                hasActiveEditor: card.hasActiveEditor()
            })
        }

        // Build set of file paths in new data
        const newFilePaths = new Set<string>()
        for (const item of allDates) {
            if (item.entry) {
                newFilePaths.add(item.entry.file.path)
            }
        }

        // Remove cards that are no longer in the data
        const cardsToRemove: string[] = []
        for (const [path, card] of this.noteCards) {
            if (!newFilePaths.has(path)) {
                card.unload()
                cardsToRemove.push(path)
            }
        }
        for (const path of cardsToRemove) {
            this.noteCards.delete(path)
        }

        // Refresh existing cards (if they don't have active editors)
        for (const [path, card] of this.noteCards) {
            const state = cardStates.get(path)
            // Skip refresh if editor is active - the data update was likely caused by this editor
            if (state && !state.hasActiveEditor) {
                card.refreshContent()
            }
        }

        // Rebuild the DOM order to match new data order
        // We need to preserve the DOM elements but reorder them
        this.rebuildCardOrder(allDates, config, periodType, showMissing, cardStates)
    }

    /**
     * Rebuild the card order in DOM to match the new data order.
     * Uses smart DOM manipulation to preserve focus on active editors.
     */
    private rebuildCardOrder(
        allDates: Array<{ date: Date; entry: BasesEntry | null }>,
        config: PeriodicNoteConfig,
        periodType: PeriodType,
        showMissing: boolean,
        cardStates: Map<string, CardState>
    ): void {
        if (!this.cardsContainerEl) return

        // Check if any card has an active editor - we need to be careful not to disrupt it
        let activeEditorPath: string | null = null
        for (const [path, state] of cardStates) {
            if (state.hasActiveEditor) {
                activeEditorPath = path
                break
            }
        }

        // Build the expected order of elements
        const expectedOrder: Array<{
            type: 'card' | 'missing'
            path?: string
            entry?: BasesEntry
            date: Date
        }> = []

        for (const item of allDates) {
            if (item.entry) {
                expectedOrder.push({
                    type: 'card',
                    path: item.entry.file.path,
                    entry: item.entry,
                    date: item.date
                })
            } else if (item.date && showMissing) {
                expectedOrder.push({
                    type: 'missing',
                    date: item.date
                })
            }
        }

        // If there's an active editor, use careful DOM manipulation
        if (activeEditorPath) {
            this.reconcileDOMWithActiveEditor(
                expectedOrder,
                config,
                periodType,
                cardStates,
                activeEditorPath
            )
        } else {
            // No active editor - safe to do simple rebuild
            this.cardsContainerEl.empty()
            for (const item of expectedOrder) {
                if (item.type === 'card' && item.entry) {
                    const existingCard = this.noteCards.get(item.path!)
                    if (existingCard) {
                        this.cardsContainerEl.appendChild(this.getCardElement(existingCard))
                    } else {
                        this.createCardElement(item.entry, item.date, periodType, cardStates)
                    }
                } else if (item.type === 'missing') {
                    this.renderMissingCard(this.cardsContainerEl, item.date, config, periodType)
                }
            }
        }
    }

    /**
     * Reconcile DOM when there's an active editor, being careful not to disrupt focus.
     * Uses insertBefore to reorder elements without detaching the active card.
     */
    private reconcileDOMWithActiveEditor(
        expectedOrder: Array<{
            type: 'card' | 'missing'
            path?: string
            entry?: BasesEntry
            date: Date
        }>,
        config: PeriodicNoteConfig,
        periodType: PeriodType,
        cardStates: Map<string, CardState>,
        activeEditorPath: string
    ): void {
        if (!this.cardsContainerEl) return

        // Get current children (we'll work with these)
        const currentChildren = Array.from(this.cardsContainerEl.children) as HTMLElement[]

        // Build a map of existing elements by their card path
        const elementByPath = new Map<string, HTMLElement>()
        for (const [path, card] of this.noteCards) {
            elementByPath.set(path, card.getElement())
        }

        // Remove "missing" cards (they don't have stable identity, will be recreated)
        // But keep track of their positions to avoid unnecessary DOM changes
        for (const child of currentChildren) {
            if (child.classList.contains('pn-create-card')) {
                child.remove()
            }
        }

        // Now process the expected order
        let insertPosition: HTMLElement | null = null

        for (let i = expectedOrder.length - 1; i >= 0; i--) {
            const item = expectedOrder[i]!

            if (item.type === 'card' && item.path) {
                const existingCard = this.noteCards.get(item.path)
                if (existingCard) {
                    const element = existingCard.getElement()
                    // Only move if not already in correct position
                    if (element.nextSibling !== insertPosition) {
                        // Skip moving the active editor's element to preserve focus
                        if (item.path !== activeEditorPath) {
                            this.cardsContainerEl.insertBefore(element, insertPosition)
                        }
                    }
                    insertPosition = element
                } else if (item.entry) {
                    // Create new card
                    const newElement = this.createCardElement(
                        item.entry,
                        item.date,
                        periodType,
                        cardStates
                    )
                    if (insertPosition) {
                        this.cardsContainerEl.insertBefore(newElement, insertPosition)
                    }
                    insertPosition = newElement
                }
            } else if (item.type === 'missing') {
                // Create missing card placeholder
                const tempContainer = document.createElement('div')
                this.renderMissingCard(tempContainer, item.date, config, periodType)
                const missingElement = tempContainer.firstElementChild as HTMLElement
                if (missingElement) {
                    if (insertPosition) {
                        this.cardsContainerEl.insertBefore(missingElement, insertPosition)
                    } else {
                        this.cardsContainerEl.appendChild(missingElement)
                    }
                    insertPosition = missingElement
                }
            }
        }
    }

    /**
     * Get the DOM element for a card
     */
    private getCardElement(card: NoteCard): HTMLElement {
        return card.getElement()
    }

    /**
     * Create a new card element and add it to the container
     */
    private createCardElement(
        entry: BasesEntry,
        date: Date,
        periodType: PeriodType,
        cardStates: Map<string, CardState>
    ): HTMLElement {
        const previousState = cardStates.get(entry.file.path)
        const shouldExpand = previousState?.expanded ?? false

        const card = new NoteCard(
            this.cardsContainerEl!,
            this.app,
            entry.file,
            periodType,
            date,
            shouldExpand,
            (file) => {
                this.app.workspace.getLeaf('tab').openFile(file)
            }
        )
        this.noteCards.set(entry.file.path, card)

        // Restore mode if there was a previous state
        if (previousState && previousState.mode !== 'view') {
            card.setMode(previousState.mode)
        }

        // Return the last child added to container (the card's element)
        return this.cardsContainerEl!.lastElementChild as HTMLElement
    }

    private mergeAndSortDates(
        entries: BasesEntry[],
        missingDates: Date[],
        config: PeriodicNoteConfig,
        periodType: PeriodType
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

        // Always sort dates descending (newest to oldest) - Base sort order is ignored
        const sortedDates = sortDatesDescending(items.map((i) => i.date))
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
        this.noteCards.set(entry.file.path, card)
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
        for (const card of this.noteCards.values()) {
            card.unload()
        }
        this.noteCards.clear()
    }

    override onunload(): void {
        // Unregister as file provider
        this.plugin.setActiveFileProvider(null)
        this.cleanupCards()
    }
}
