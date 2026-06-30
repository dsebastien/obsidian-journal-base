import { Component, setIcon } from 'obsidian'

export interface FoldableColumnOptions {
    /** Whether the column starts collapsed. Defaults to false (expanded). */
    initiallyFolded?: boolean
    /** Called whenever the user folds/unfolds the column (not on initial state). */
    onFoldChange?: (folded: boolean) => void
}

export class FoldableColumn extends Component {
    private containerEl!: HTMLElement
    private headerEl!: HTMLElement
    private headerActionsEl!: HTMLElement
    private selectorEl!: HTMLElement
    private contentEl!: HTMLElement
    private foldBtn!: HTMLButtonElement
    private folded: boolean
    private onFoldChange?: (folded: boolean) => void

    constructor(
        parent: HTMLElement,
        private title: string,
        options?: FoldableColumnOptions
    ) {
        super()
        this.folded = options?.initiallyFolded ?? false
        this.onFoldChange = options?.onFoldChange
        this.containerEl = this.render(parent)
    }

    private render(parent: HTMLElement): HTMLElement {
        const container = parent.createDiv({ cls: 'pr-column' })

        // Header
        this.headerEl = container.createDiv({ cls: 'pr-column__header' })

        // Fold button (at the top)
        this.foldBtn = this.headerEl.createEl('button', {
            cls: 'pr-column__fold-btn clickable-icon',
            attr: { 'aria-label': 'Collapse column' }
        })
        setIcon(this.foldBtn, 'chevron-left')

        this.headerEl.createSpan({
            cls: 'pr-column__title',
            text: this.title
        })

        // Header actions container (for action buttons on the right)
        this.headerActionsEl = this.headerEl.createDiv({ cls: 'pr-column__header-actions' })

        this.registerDomEvent(this.foldBtn, 'click', (e) => {
            e.stopPropagation()
            this.toggleFold()
        })

        // Click on header to toggle fold (but not on the actions area)
        this.registerDomEvent(this.headerEl, 'click', (e) => {
            if (!this.headerActionsEl.contains(e.target as Node)) {
                this.toggleFold()
            }
        })

        // Selector area (for period selection)
        this.selectorEl = container.createDiv({ cls: 'pr-column__selector' })

        // Content area
        this.contentEl = container.createDiv({ cls: 'pr-column__content' })

        // Apply any initial folded state (e.g. restored from the Base config)
        // without firing onFoldChange — that callback is for user toggles only.
        if (this.folded) {
            container.classList.add('pr-column--folded')
        }
        this.applyFoldVisibility()
        this.updateFoldButton()

        return container
    }

    toggleFold(): void {
        this.folded = !this.folded
        this.containerEl.classList.toggle('pr-column--folded', this.folded)
        this.applyFoldVisibility()
        this.updateFoldButton()
        this.onFoldChange?.(this.folded)
    }

    /**
     * Hide the selector and content inline when folded.
     *
     * The `.pr-column--folded .pr-column__content { display: none }` (and
     * selector) rules live in `@layer jb-components`, which is always beaten by
     * unlayered Obsidian/theme CSS regardless of specificity — so the layered
     * `display: none` can be silently overridden, leaving the note + selector
     * visible and squeezed into the 48px folded strip (per-character wrapping).
     * Inline styles win over every cascade layer, so set them here. The RHS is a
     * variable (not a static literal), so `no-static-styles-assignment` is happy.
     * See `documentation/history/2026-06-20.md` for the sibling `position` case.
     */
    private applyFoldVisibility(): void {
        const display = this.folded ? 'none' : ''
        this.selectorEl.style.display = display
        this.contentEl.style.display = display
    }

    private updateFoldButton(): void {
        setIcon(this.foldBtn, this.folded ? 'chevron-right' : 'chevron-left')
        this.foldBtn.setAttribute('aria-label', this.folded ? 'Expand column' : 'Collapse column')
    }

    fold(): void {
        if (!this.folded) {
            this.toggleFold()
        }
    }

    unfold(): void {
        if (this.folded) {
            this.toggleFold()
        }
    }

    isFolded(): boolean {
        return this.folded
    }

    getSelectorEl(): HTMLElement {
        return this.selectorEl
    }

    getContentEl(): HTMLElement {
        return this.contentEl
    }

    getHeaderActionsEl(): HTMLElement {
        return this.headerActionsEl
    }

    getElement(): HTMLElement {
        return this.containerEl
    }

    setTitle(title: string): void {
        this.title = title
        const titleEl = this.headerEl.querySelector('.pr-column__title')
        if (titleEl) {
            titleEl.textContent = title
        }
    }

    clearSelector(): void {
        this.selectorEl.empty()
    }

    clearContent(): void {
        this.contentEl.empty()
    }

    clear(): void {
        this.clearSelector()
        this.clearContent()
    }
}
