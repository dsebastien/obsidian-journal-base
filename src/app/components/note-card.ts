import { App, Component, MarkdownRenderer, TFile, debounce, Notice } from 'obsidian'
import type { Debouncer } from 'obsidian'
import type { PeriodType } from '../types'
import { getPeriodSuffix, isCurrentPeriod } from '../../utils/date-utils'
import { EmbeddableEditor } from '../services/embeddable-editor.service'

export type CardMode = 'view' | 'edit' | 'source'

// SVG icons for mode buttons
const VIEW_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
const EDIT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>`
const SOURCE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`

export interface NoteCardOptions {
    /** Whether the card can be folded/collapsed. Defaults to true. */
    foldable?: boolean
}

export class NoteCard extends Component {
    private containerEl!: HTMLElement
    private contentEl!: HTMLElement
    private expanded: boolean
    private contentLoaded: boolean = false
    private mode: CardMode = 'view'
    private editor: EmbeddableEditor | null = null
    private modeButtons: Map<CardMode, HTMLButtonElement> = new Map()
    private saveDebounced: Debouncer<[string], Promise<void>>
    private foldable: boolean

    constructor(
        parent: HTMLElement,
        private app: App,
        private file: TFile,
        private periodType: PeriodType,
        private noteDate: Date | null,
        initiallyExpanded: boolean = false,
        private onOpen?: (file: TFile) => void,
        options?: NoteCardOptions
    ) {
        super()
        this.foldable = options?.foldable ?? true
        this.expanded = this.foldable ? initiallyExpanded : true // Always expanded if not foldable
        this.saveDebounced = debounce((content: string) => this.saveContent(content), 1000, true)
        this.containerEl = this.render(parent)
    }

    private render(parent: HTMLElement): HTMLElement {
        const isCurrent = this.noteDate ? isCurrentPeriod(this.noteDate, this.periodType) : false
        const container = parent.createDiv({
            cls: `pn-card ${this.expanded ? 'pn-card--expanded' : ''} ${isCurrent ? 'pn-card--current' : ''}`
        })

        // Header
        const header = container.createDiv({ cls: 'pn-card__header' })

        // Build title with period suffix if date is available
        const suffix = this.noteDate ? getPeriodSuffix(this.noteDate, this.periodType) : ''
        const titleText = suffix ? `${this.file.basename} ${suffix}` : this.file.basename
        const titleEl = header.createSpan({ cls: 'pn-card__title', text: titleText })

        // Button container for action buttons
        const actionsEl = header.createDiv({ cls: 'pn-card__actions' })

        // Mode toggle buttons
        const modeToggleEl = actionsEl.createDiv({ cls: 'pn-card__mode-toggle' })
        this.createModeButton(modeToggleEl, 'view', VIEW_ICON, 'Reading view')
        this.createModeButton(modeToggleEl, 'edit', EDIT_ICON, 'Live preview')
        this.createModeButton(modeToggleEl, 'source', SOURCE_ICON, 'Source mode')
        this.updateModeButtons()

        // Open button (opens in new tab)
        const openBtn = actionsEl.createEl('button', {
            cls: 'pn-card__action-btn clickable-icon',
            attr: { 'aria-label': 'Open in new tab' }
        })
        openBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`
        this.registerDomEvent(openBtn, 'click', (e) => {
            e.stopPropagation()
            this.onOpen?.(this.file)
        })

        // Toggle icon (only if foldable)
        if (this.foldable) {
            const toggleIcon = header.createSpan({ cls: 'pn-card__toggle' })
            toggleIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
        }

        // Content area
        this.contentEl = container.createDiv({ cls: 'pn-card__content' })

        // Click header to toggle (only if foldable)
        if (this.foldable) {
            this.registerDomEvent(header, 'click', () => this.toggle())
        }

        // Double-click title to open
        this.registerDomEvent(titleEl, 'dblclick', (e) => {
            e.stopPropagation()
            this.onOpen?.(this.file)
        })

        // Load content if initially expanded
        if (this.expanded) {
            this.loadContent()
        }

        return container
    }

    toggle(): void {
        // Don't toggle if not foldable
        if (!this.foldable) return

        this.expanded = !this.expanded
        this.containerEl.classList.toggle('pn-card--expanded', this.expanded)

        if (this.expanded && !this.contentLoaded) {
            this.loadContent()
        }
    }

    expand(): void {
        if (!this.expanded) {
            this.toggle()
        }
    }

    collapse(): void {
        if (this.expanded) {
            this.toggle()
        }
    }

    private async loadContent(): Promise<void> {
        if (this.contentLoaded && this.mode === 'view') return

        this.contentEl.empty()
        this.destroyEditor()

        try {
            const content = await this.app.vault.cachedRead(this.file)

            if (this.mode === 'view') {
                // Render read-only markdown
                await MarkdownRenderer.render(
                    this.app,
                    content,
                    this.contentEl,
                    this.file.path,
                    this
                )
                this.contentLoaded = true
            } else {
                // Create embedded editor
                const editorContainer = this.contentEl.createDiv({ cls: 'pn-card__editor' })
                this.editor = new EmbeddableEditor(this.app, editorContainer, {
                    initialContent: content,
                    file: this.file,
                    mode: this.mode === 'edit' ? 'preview' : 'source',
                    onChange: (newContent) => {
                        this.saveDebounced(newContent)
                    },
                    onEscape: () => {
                        // Switch back to view mode on Escape
                        this.setMode('view')
                    }
                })
                this.addChild(this.editor)
                this.contentLoaded = true
            }
        } catch (error) {
            console.error('Failed to load note content:', error)
            this.contentEl.createDiv({
                cls: 'pn-card__error',
                text: 'Failed to load content'
            })
        }
    }

    private createModeButton(
        container: HTMLElement,
        mode: CardMode,
        icon: string,
        label: string
    ): void {
        const btn = container.createEl('button', {
            cls: 'pn-card__mode-btn clickable-icon',
            attr: { 'aria-label': label }
        })
        btn.innerHTML = icon
        this.modeButtons.set(mode, btn)

        this.registerDomEvent(btn, 'click', (e) => {
            e.stopPropagation()
            this.setMode(mode)
        })
    }

    private updateModeButtons(): void {
        for (const [mode, btn] of this.modeButtons) {
            btn.classList.toggle('pn-card__mode-btn--active', mode === this.mode)
        }
    }

    setMode(mode: CardMode): void {
        if (mode === this.mode) return

        // Save any pending changes before switching modes
        if (this.editor && this.mode !== 'view') {
            this.saveContent(this.editor.getValue())
        }

        this.mode = mode
        this.updateModeButtons()

        // Force reload content with new mode
        this.contentLoaded = false
        if (this.expanded) {
            this.loadContent()
        }
    }

    getMode(): CardMode {
        return this.mode
    }

    private async saveContent(content: string): Promise<void> {
        try {
            await this.app.vault.modify(this.file, content)
        } catch (error) {
            console.error('Failed to save content:', error)
            new Notice('Failed to save changes')
        }
    }

    private destroyEditor(): void {
        if (this.editor) {
            this.removeChild(this.editor)
            this.editor = null
        }
    }

    getFile(): TFile {
        return this.file
    }

    isExpanded(): boolean {
        return this.expanded
    }

    /**
     * Get the container DOM element for this card
     */
    getElement(): HTMLElement {
        return this.containerEl
    }

    /**
     * Check if this card has an active/focused editor
     */
    hasActiveEditor(): boolean {
        return this.editor !== null && this.editor.hasFocus()
    }

    /**
     * Refresh the card content without destroying the card.
     * If the card has an active editor, the refresh is skipped to preserve user edits.
     * @param force - If true, refresh even if editor is active (use with caution)
     * @returns true if content was refreshed, false if skipped
     */
    async refreshContent(force: boolean = false): Promise<boolean> {
        // Skip refresh if editor is active and not forced
        if (this.hasActiveEditor() && !force) {
            return false
        }

        // Only refresh if expanded and content is loaded
        if (!this.expanded || !this.contentLoaded) {
            return false
        }

        // If in view mode, re-render the markdown
        if (this.mode === 'view') {
            this.contentEl.empty()
            try {
                const content = await this.app.vault.cachedRead(this.file)
                await MarkdownRenderer.render(
                    this.app,
                    content,
                    this.contentEl,
                    this.file.path,
                    this
                )
                return true
            } catch (error) {
                console.error('Failed to refresh note content:', error)
                return false
            }
        }

        // If in edit/source mode with an editor, update the content
        // but only if the file content differs from editor content
        if (this.editor) {
            try {
                const fileContent = await this.app.vault.cachedRead(this.file)
                const editorContent = this.editor.getValue()

                // Only update if content differs (external change)
                if (fileContent !== editorContent) {
                    // For safety, don't auto-update if editor has focus
                    if (!this.editor.hasFocus()) {
                        this.editor.setValue(fileContent)
                        return true
                    }
                }
            } catch (error) {
                console.error('Failed to check file content:', error)
            }
        }

        return false
    }

    /**
     * Get the current state of this card for restoration
     */
    getState(): { expanded: boolean; mode: CardMode } {
        return {
            expanded: this.expanded,
            mode: this.mode
        }
    }

    /**
     * Restore state without re-rendering (used during reconciliation)
     */
    restoreState(state: { expanded: boolean; mode: CardMode }): void {
        if (state.expanded !== this.expanded) {
            this.toggle()
        }
        if (state.mode !== this.mode) {
            this.setMode(state.mode)
        }
    }

    override onunload(): void {
        this.destroyEditor()
    }
}
