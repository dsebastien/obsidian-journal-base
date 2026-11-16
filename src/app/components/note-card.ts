import { App, Component, MarkdownRenderer, TFile, debounce, Notice, setIcon } from 'obsidian'
import type { Debouncer } from 'obsidian'
import type { PeriodType } from '../types'
import { getPeriodSuffix, isCurrentPeriod } from '../../utils/date-utils'
import { log } from '../../utils/log'
import { EmbeddableEditor } from '../services/embeddable-editor.service'

export type CardMode = 'view' | 'edit' | 'source'

const MODE_ICON_NAMES: Record<CardMode, string> = {
    view: 'eye',
    edit: 'pencil',
    source: 'code'
}

export interface NoteCardOptions {
    /** Whether the card can be folded/collapsed. Defaults to true. */
    foldable?: boolean
    /** Force a specific mode. When set, mode cannot be changed by user. */
    forcedMode?: CardMode
    /** Hide the mode toggle buttons. Defaults to false. */
    hideModeToggle?: boolean
    /** Whether this period is marked as done. */
    isDone?: boolean
    /** Callback when done status is toggled. */
    onToggleDone?: () => void
    /** Callback to navigate to previous period. If not provided, button is hidden. */
    onPrevious?: () => void
    /** Callback to navigate to next period. If not provided, button is hidden. */
    onNext?: () => void
    /** Collapse the YAML frontmatter block when the editor opens. Defaults to false. */
    collapseFrontmatter?: boolean
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
    private forcedMode: CardMode | undefined
    private hideModeToggle: boolean
    private lastRenderedContent: string | null = null
    private isDone: boolean
    private onToggleDone?: () => void
    private onPrevious?: () => void
    private onNext?: () => void
    private collapseFrontmatter: boolean
    private doneButton: HTMLButtonElement | null = null
    /** Owns the children of the current reading-view render (embeds, post-processors). */
    private renderChild: Component | null = null
    /** Incremented by each content load, so a slower earlier load can tell it is stale. */
    private loadGeneration = 0
    /**
     * The note content that this card last read from, or wrote to, the vault.
     * A save of exactly this content is skipped: it changes nothing on disk, but
     * a write makes every plugin that listens to `modify` do its work again.
     */
    private lastSyncedContent: string | null = null
    private isUnloaded = false

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
        this.forcedMode = options?.forcedMode
        this.hideModeToggle = options?.hideModeToggle ?? false
        this.isDone = options?.isDone ?? false
        this.onToggleDone = options?.onToggleDone
        this.onPrevious = options?.onPrevious
        this.onNext = options?.onNext
        this.collapseFrontmatter = options?.collapseFrontmatter ?? false
        this.mode = this.forcedMode ?? 'view'
        this.expanded = this.foldable ? initiallyExpanded : true // Always expanded if not foldable
        this.saveDebounced = debounce((content: string) => this.saveContent(content), 1000, true)
        // The card renders (and can open an editor) from its constructor, so it
        // is loaded from its constructor too. `Component.unload()` returns at
        // once on a component that was never loaded: without this, `unload()`
        // ran no cleanup and every editor the card opened stayed alive.
        this.load()
        this.containerEl = this.render(parent)
    }

    private render(parent: HTMLElement): HTMLElement {
        const isCurrent = this.noteDate ? isCurrentPeriod(this.noteDate, this.periodType) : false
        const classes = ['pn-card']
        if (this.expanded) classes.push('pn-card--expanded')
        if (isCurrent) classes.push('pn-card--current')
        if (this.isDone) classes.push('pn-card--done')
        const container = parent.createDiv({ cls: classes.join(' ') })

        // Header
        const header = container.createDiv({ cls: 'pn-card__header' })

        // Build title with period suffix if date is available
        const suffix = this.noteDate ? getPeriodSuffix(this.noteDate, this.periodType) : ''
        const titleText = suffix ? `${this.file.basename} ${suffix}` : this.file.basename
        const titleEl = header.createSpan({ cls: 'pn-card__title', text: titleText })

        // Button container for action buttons
        const actionsEl = header.createDiv({ cls: 'pn-card__actions' })

        // Mode toggle buttons (only shown if not hidden)
        if (!this.hideModeToggle) {
            const modeToggleEl = actionsEl.createDiv({ cls: 'pn-card__mode-toggle' })
            this.createModeButton(modeToggleEl, 'view', 'Reading view')
            this.createModeButton(modeToggleEl, 'edit', 'Live preview')
            this.createModeButton(modeToggleEl, 'source', 'Source mode')
            this.updateModeButtons()
        }

        // Done toggle button (if onToggleDone is provided)
        if (this.onToggleDone) {
            this.doneButton = actionsEl.createEl('button', {
                cls: `pn-card__done-btn clickable-icon ${this.isDone ? 'pn-card__done-btn--active' : ''}`,
                attr: { 'aria-label': this.isDone ? 'Mark as not done' : 'Mark as done' }
            })
            setIcon(this.doneButton, this.isDone ? 'check-circle' : 'circle')
            this.registerDomEvent(this.doneButton, 'click', (e) => {
                e.stopPropagation()
                this.onToggleDone?.()
            })
        }

        // Navigation buttons (if onPrevious or onNext is provided)
        if (this.onPrevious || this.onNext) {
            const navEl = actionsEl.createDiv({ cls: 'pn-card__nav' })

            const prevBtn = navEl.createEl('button', {
                cls: 'pn-card__nav-btn clickable-icon',
                attr: { 'aria-label': 'Previous period' }
            })
            setIcon(prevBtn, 'chevron-left')
            if (!this.onPrevious) {
                prevBtn.disabled = true
                prevBtn.addClass('pn-card__nav-btn--disabled')
            }
            this.registerDomEvent(prevBtn, 'click', (e) => {
                e.stopPropagation()
                this.onPrevious?.()
            })

            const nextBtn = navEl.createEl('button', {
                cls: 'pn-card__nav-btn clickable-icon',
                attr: { 'aria-label': 'Next period' }
            })
            setIcon(nextBtn, 'chevron-right')
            if (!this.onNext) {
                nextBtn.disabled = true
                nextBtn.addClass('pn-card__nav-btn--disabled')
            }
            this.registerDomEvent(nextBtn, 'click', (e) => {
                e.stopPropagation()
                this.onNext?.()
            })
        }

        // Open button (opens in new tab)
        const openBtn = actionsEl.createEl('button', {
            cls: 'pn-card__action-btn clickable-icon',
            attr: { 'aria-label': 'Open in new tab' }
        })
        setIcon(openBtn, 'external-link')
        this.registerDomEvent(openBtn, 'click', (e) => {
            e.stopPropagation()
            this.onOpen?.(this.file)
        })

        // Toggle icon (only if foldable)
        if (this.foldable) {
            const toggleIcon = header.createSpan({ cls: 'pn-card__toggle' })
            setIcon(toggleIcon, 'chevron-down')
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
            void this.loadContent()
        }

        return container
    }

    toggle(): void {
        // Don't toggle if not foldable
        if (!this.foldable) return

        this.expanded = !this.expanded
        this.containerEl.classList.toggle('pn-card--expanded', this.expanded)

        if (this.expanded && !this.contentLoaded) {
            void this.loadContent()
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
        if (this.isUnloaded) return
        if (this.contentLoaded && this.mode === 'view') return

        const generation = ++this.loadGeneration
        this.contentEl.empty()
        this.destroyEditor()
        this.destroyRender()

        try {
            const content = await this.app.vault.cachedRead(this.file)

            // The card was unloaded, or a newer load started, while the file was
            // read. An editor created now would have no owner to destroy it.
            if (this.isUnloaded || generation !== this.loadGeneration) return

            if (this.mode === 'view') {
                // Render read-only markdown
                await this.renderMarkdown(content)
                this.lastRenderedContent = content
                this.contentLoaded = true
            } else {
                // Create embedded editor
                this.lastSyncedContent = content
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

                // Collapse the frontmatter on open when requested. Only applies in
                // source mode; in live preview frontmatter is a properties widget.
                if (this.collapseFrontmatter && this.mode === 'source') {
                    this.editor.foldFrontmatter()
                }
            }
        } catch (error) {
            log('Failed to load note content:', 'error', error)
            this.contentEl.createDiv({
                cls: 'pn-card__error',
                text: 'Failed to load content'
            })
        }
    }

    private createModeButton(container: HTMLElement, mode: CardMode, label: string): void {
        const btn = container.createEl('button', {
            cls: 'pn-card__mode-btn clickable-icon',
            attr: { 'aria-label': label }
        })
        setIcon(btn, MODE_ICON_NAMES[mode])
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
        // If mode is forced, ignore mode change requests
        if (this.forcedMode !== undefined) return
        if (mode === this.mode) return

        // Save any pending changes before switching modes
        if (this.editor && this.mode !== 'view') {
            void this.saveContent(this.editor.getValue())
        }

        this.mode = mode
        this.updateModeButtons()

        // Clear cached content to force fresh render
        this.lastRenderedContent = null
        this.contentLoaded = false

        if (this.expanded) {
            void this.loadContent()
        }
    }

    getMode(): CardMode {
        return this.mode
    }

    private async saveContent(content: string): Promise<void> {
        // Nothing to write: the vault already has this content (a mode change
        // with no edit, or the delayed save that follows an immediate one).
        if (content === this.lastSyncedContent) return

        // Recorded before the write, not after it: a second save of the same
        // content can start while this write is still in progress.
        const previousContent = this.lastSyncedContent
        this.lastSyncedContent = content

        try {
            await this.app.vault.modify(this.file, content)
        } catch (error) {
            // The write failed, so a later save of this content must try again
            if (this.lastSyncedContent === content) {
                this.lastSyncedContent = previousContent
            }
            log('Failed to save content:', 'error', error)
            new Notice('Failed to save changes')
        }
    }

    private destroyEditor(): void {
        if (this.editor) {
            const editor = this.editor
            this.editor = null
            this.removeChild(editor)
            // removeChild() only reaches the editor when it was loaded. Destroy it
            // directly as well (a no-op when the line above already did).
            editor.destroy()
        }
    }

    /**
     * Render the note as read-only markdown. Each render gets its own child
     * component, so the children of the previous render are unloaded when the
     * content is rendered again, and not only when the card goes away.
     */
    private async renderMarkdown(content: string): Promise<void> {
        this.destroyRender()
        const renderChild = this.addChild(new Component())
        this.renderChild = renderChild
        await MarkdownRenderer.render(
            this.app,
            content,
            this.contentEl,
            this.file.path,
            renderChild
        )
    }

    private destroyRender(): void {
        if (this.renderChild) {
            this.removeChild(this.renderChild)
            this.renderChild = null
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
     * Preserves editor state (cursor position, selection, scroll) during updates.
     * Only re-renders if content has actually changed to avoid visual flashing.
     *
     * @param force - If true, update even focused editors (preserving cursor)
     * @returns true if content was refreshed, false if skipped
     */
    async refreshContent(force: boolean = false): Promise<boolean> {
        // Only refresh if expanded and content is loaded
        if (!this.expanded || !this.contentLoaded) {
            return false
        }

        try {
            const fileContent = await this.app.vault.cachedRead(this.file)

            // If in view mode, re-render the markdown only if content changed
            if (this.mode === 'view') {
                // Check if content has changed by comparing with cached content
                if (fileContent === this.lastRenderedContent) {
                    return false // Content unchanged, skip re-render
                }

                this.contentEl.empty()
                await this.renderMarkdown(fileContent)
                this.lastRenderedContent = fileContent
                return true
            }

            // If in edit/source mode with an editor, update the content
            // using the state-preserving method
            if (this.editor) {
                const editorContent = this.editor.getValue()

                let updated = false
                // Only update if content differs (external change)
                if (fileContent !== editorContent) {
                    // If editor has focus and not forced, skip to avoid disrupting user
                    if (this.editor.hasFocus() && !force) {
                        return false
                    }

                    // Use state-preserving update to maintain cursor and scroll
                    updated = this.editor.setValuePreservingState(fileContent)
                    this.lastSyncedContent = fileContent
                }

                // Re-apply the frontmatter fold if it was lost. Obsidian's
                // embedded editor syncs external file changes on its own, so a
                // change landing inside the folded frontmatter (e.g. toggling the
                // done property, which is written inside the block) makes
                // CodeMirror drop the fold and the raw properties reappear —
                // often before this method runs, so the editor content already
                // matches the file and the branch above is skipped. Re-fold
                // unconditionally here to keep it hidden, matching open-time
                // behaviour.
                this.reapplyFrontmatterFold()

                return updated
            }
        } catch (error) {
            log('Failed to refresh note content:', 'error', error)
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

    /**
     * Update the done state of this card.
     * Called when done reviews change externally.
     */
    setDoneState(isDone: boolean): void {
        // The review view calls this on every data update: only touch the DOM
        // when the state really changed.
        if (isDone !== this.isDone) {
            this.isDone = isDone
            this.containerEl.classList.toggle('pn-card--done', isDone)

            if (this.doneButton) {
                setIcon(this.doneButton, isDone ? 'check-circle' : 'circle')
                this.doneButton.classList.toggle('pn-card__done-btn--active', isDone)
                this.doneButton.setAttribute(
                    'aria-label',
                    isDone ? 'Mark as not done' : 'Mark as done'
                )
            }
        }

        // Toggling done writes the done property inside the note's frontmatter,
        // which drops the fold that keeps it hidden. Restore it directly on this
        // done-state change (the most reliable trigger, alongside refreshContent).
        this.reapplyFrontmatterFold()
    }

    /**
     * Re-fold the YAML frontmatter block if it should stay hidden. No-op unless
     * the card is in source mode with frontmatter collapsing enabled and the
     * user is not actively editing (so we never re-fold under their cursor).
     * Folding an already-folded range is a harmless no-op.
     */
    private reapplyFrontmatterFold(): void {
        if (
            this.collapseFrontmatter &&
            this.mode === 'source' &&
            this.editor &&
            !this.editor.hasFocus()
        ) {
            this.editor.foldFrontmatter()
        }
    }

    /**
     * Get the current done state.
     */
    getDoneState(): boolean {
        return this.isDone
    }

    override onunload(): void {
        this.isUnloaded = true
        this.destroyEditor()
        this.destroyRender()
    }
}
