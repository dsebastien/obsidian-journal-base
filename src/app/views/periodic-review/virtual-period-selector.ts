import { Component } from 'obsidian'
import type { BasesEntry } from 'obsidian'

// SVG icons for done status (lucide-style)
const CHECK_CIRCLE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
const CIRCLE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>`

export interface VirtualPeriodItem {
    date: Date
    label: string
    entry: BasesEntry | null
    isMissing: boolean
    isCurrent: boolean
    isDone: boolean
}

/**
 * Virtual scrolling component for period selectors.
 * Only renders visible items + buffer for optimal performance.
 * Critical for yearly views with 50+ weeks.
 *
 * Key features:
 * - Fixed item height positioning for fast calculations
 * - Throttled scroll handler with requestAnimationFrame
 * - Element pooling to minimize DOM operations
 * - Absolute positioning for instant repositioning
 */
export class VirtualPeriodSelector extends Component {
    private items: VirtualPeriodItem[] = []
    private selectedDate: Date | null = null
    private readonly itemHeight: number = 28 // Fixed height per item (matches CSS)
    private readonly bufferItems: number = 5 // Items above/below viewport
    private renderedRange: { start: number; end: number } = { start: -1, end: -1 }
    private itemPool: Map<number, HTMLElement> = new Map()

    private spacerEl!: HTMLElement
    private itemsContainerEl!: HTMLElement
    private ticking: boolean = false

    constructor(
        private containerEl: HTMLElement,
        private onSelect: (date: Date, entry: BasesEntry | null) => void,
        private onToggleDone?: (date: Date) => void
    ) {
        super()
        this.setupDOM()
        this.setupScrollListener()
    }

    private setupDOM(): void {
        // Container styles for virtual scrolling
        this.containerEl.addClass('pr-virtual-selector')

        // Spacer to create scrollable height
        this.spacerEl = this.containerEl.createDiv({ cls: 'pr-virtual-spacer' })

        // Items container with absolute positioning
        this.itemsContainerEl = this.containerEl.createDiv({ cls: 'pr-virtual-items' })
    }

    private setupScrollListener(): void {
        this.registerDomEvent(this.containerEl, 'scroll', () => {
            if (!this.ticking) {
                requestAnimationFrame(() => {
                    this.renderVisibleItems()
                    this.ticking = false
                })
                this.ticking = true
            }
        })
    }

    /**
     * Set items and trigger render.
     * Call this when the available periods change.
     */
    setItems(items: VirtualPeriodItem[]): void {
        this.items = items
        this.updateTotalHeight()

        // Reset rendered range to force full re-render
        this.renderedRange = { start: -1, end: -1 }

        // Clear ALL child elements from container (including empty state messages)
        // except spacer and items container
        const children = Array.from(this.containerEl.children)
        for (const child of children) {
            if (child !== this.spacerEl && child !== this.itemsContainerEl) {
                child.remove()
            }
        }

        // Clear existing pooled items
        this.itemPool.forEach((el) => el.remove())
        this.itemPool.clear()

        this.renderVisibleItems()
    }

    /**
     * Get current items count.
     */
    getItemCount(): number {
        return this.items.length
    }

    /**
     * Update selection without re-rendering items.
     * Much faster than setItems for selection changes.
     * Also ensures other state classes (--missing, --done, etc.) are synchronized.
     */
    setSelection(date: Date | null): void {
        this.selectedDate = date

        // Update classes on rendered items to ensure consistency
        for (const [index, el] of this.itemPool) {
            const item = this.items[index]
            if (!item) continue

            const isSelected = date && item.date.getTime() === date.getTime()
            el.classList.toggle('pr-period-item--selected', !!isSelected)
            // Also synchronize other state classes to ensure consistency
            el.classList.toggle('pr-period-item--missing', !!item.isMissing)
            el.classList.toggle('pr-period-item--current', !!item.isCurrent)
            el.classList.toggle('pr-period-item--done', !!item.isDone)

            // Update done icon
            const doneIcon = el.querySelector('.pr-period-item__done-icon')
            if (doneIcon) {
                doneIcon.innerHTML = item.isDone ? CHECK_CIRCLE_ICON : CIRCLE_ICON
            }
        }
    }

    /**
     * Get current selection.
     */
    getSelection(): Date | null {
        return this.selectedDate
    }

    /**
     * Scroll to bring the selected item into view.
     */
    scrollToSelection(): void {
        if (!this.selectedDate) return

        const index = this.items.findIndex(
            (item) => item.date.getTime() === this.selectedDate!.getTime()
        )

        if (index === -1) return

        const itemTop = index * this.itemHeight
        const itemBottom = itemTop + this.itemHeight
        const scrollTop = this.containerEl.scrollTop
        const viewportHeight = this.containerEl.clientHeight

        if (itemTop < scrollTop) {
            this.containerEl.scrollTop = itemTop
        } else if (itemBottom > scrollTop + viewportHeight) {
            this.containerEl.scrollTop = itemBottom - viewportHeight
        }
    }

    /**
     * Scroll to bring a specific item into view by index.
     */
    scrollToIndex(index: number): void {
        if (index < 0 || index >= this.items.length) return

        const itemTop = index * this.itemHeight
        const viewportHeight = this.containerEl.clientHeight

        // Center the item in viewport
        this.containerEl.scrollTop = Math.max(0, itemTop - viewportHeight / 2 + this.itemHeight / 2)
    }

    private updateTotalHeight(): void {
        const totalHeight = this.items.length * this.itemHeight
        this.spacerEl.style.height = `${totalHeight}px`
    }

    private renderVisibleItems(): void {
        if (this.items.length === 0) {
            return
        }

        const scrollTop = this.containerEl.scrollTop
        const viewportHeight = this.containerEl.clientHeight

        const startIndex = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.bufferItems)
        const endIndex = Math.min(
            this.items.length - 1,
            Math.ceil((scrollTop + viewportHeight) / this.itemHeight) + this.bufferItems
        )

        // Skip if range unchanged and items exist
        if (
            startIndex === this.renderedRange.start &&
            endIndex === this.renderedRange.end &&
            this.itemPool.size > 0
        ) {
            return
        }

        // Remove items outside new range
        for (let i = this.renderedRange.start; i <= this.renderedRange.end; i++) {
            if (i < startIndex || i > endIndex) {
                const el = this.itemPool.get(i)
                if (el) {
                    el.remove()
                    this.itemPool.delete(i)
                }
            }
        }

        // Add items in new range
        for (let i = startIndex; i <= endIndex; i++) {
            if (!this.itemPool.has(i)) {
                const item = this.items[i]
                if (item) {
                    const el = this.createItemEl(item, i)
                    this.itemsContainerEl.appendChild(el)
                    this.itemPool.set(i, el)
                }
            }
        }

        this.renderedRange = { start: startIndex, end: endIndex }
    }

    private createItemEl(item: VirtualPeriodItem, index: number): HTMLElement {
        const el = createDiv()

        // Position absolutely
        el.style.position = 'absolute'
        el.style.top = `${index * this.itemHeight}px`
        el.style.left = '0'
        el.style.right = '0'
        el.style.height = `${this.itemHeight}px`

        // Apply classes
        const classes = ['pr-period-item']
        if (item.isMissing) classes.push('pr-period-item--missing')
        if (item.isCurrent) classes.push('pr-period-item--current')
        if (item.isDone) classes.push('pr-period-item--done')
        if (this.selectedDate && item.date.getTime() === this.selectedDate.getTime()) {
            classes.push('pr-period-item--selected')
        }
        el.className = classes.join(' ')

        // Label text
        const labelEl = el.createSpan({ cls: 'pr-period-item__label', text: item.label })

        // Done icon (clickable, on the right side)
        const doneIcon = el.createSpan({ cls: 'pr-period-item__done-icon clickable-icon' })
        doneIcon.innerHTML = item.isDone ? CHECK_CIRCLE_ICON : CIRCLE_ICON
        doneIcon.setAttribute('aria-label', item.isDone ? 'Mark as not done' : 'Mark as done')

        // Click on done icon toggles done status
        doneIcon.addEventListener('click', (e) => {
            e.stopPropagation()
            // Optimistic UI update - toggle immediately before async operation
            const newDoneState = !item.isDone
            this.updateItem(item.date, { isDone: newDoneState })
            // Then trigger the actual toggle (which will do file updates and full refresh)
            this.onToggleDone?.(item.date)
        })

        // Click on label/item selects the period
        labelEl.addEventListener('click', () => {
            this.onSelect(item.date, item.entry)
        })

        return el
    }

    /**
     * Update a single item's appearance (e.g., when entry is created or done status changes).
     */
    updateItem(date: Date, updates: Partial<Omit<VirtualPeriodItem, 'date'>>): void {
        const index = this.items.findIndex((item) => item.date.getTime() === date.getTime())
        if (index === -1) return

        const item = this.items[index]
        if (!item) return

        // Update item data
        Object.assign(item, updates)

        // Update rendered element if it exists
        const el = this.itemPool.get(index)
        if (el) {
            // Update classes
            el.classList.toggle('pr-period-item--missing', !!item.isMissing)
            el.classList.toggle('pr-period-item--current', !!item.isCurrent)
            el.classList.toggle('pr-period-item--done', !!item.isDone)

            // Update done icon
            const doneIcon = el.querySelector('.pr-period-item__done-icon')
            if (doneIcon) {
                doneIcon.innerHTML = item.isDone ? CHECK_CIRCLE_ICON : CIRCLE_ICON
                doneIcon.setAttribute(
                    'aria-label',
                    item.isDone ? 'Mark as not done' : 'Mark as done'
                )
            }
        }
    }

    /**
     * Refresh done states for all items based on a callback.
     * Used when done reviews are updated externally.
     * The callback receives both the date and the entry so it can check the file directly when available.
     */
    refreshDoneStates(getDoneState: (date: Date, entry: BasesEntry | null) => boolean): void {
        for (const item of this.items) {
            item.isDone = getDoneState(item.date, item.entry)
        }

        // Update rendered elements
        for (const [index, el] of this.itemPool) {
            const item = this.items[index]
            if (!item) continue

            el.classList.toggle('pr-period-item--done', !!item.isDone)
            const doneIcon = el.querySelector('.pr-period-item__done-icon')
            if (doneIcon) {
                doneIcon.innerHTML = item.isDone ? CHECK_CIRCLE_ICON : CIRCLE_ICON
                doneIcon.setAttribute(
                    'aria-label',
                    item.isDone ? 'Mark as not done' : 'Mark as done'
                )
            }
        }
    }

    /**
     * Clear all items.
     */
    clear(): void {
        this.items = []
        this.selectedDate = null
        this.renderedRange = { start: -1, end: -1 }
        this.itemPool.forEach((el) => el.remove())
        this.itemPool.clear()
        this.spacerEl.style.height = '0'
    }

    /**
     * Show empty state message.
     */
    showEmptyState(message: string): void {
        this.clear()
        this.containerEl.createDiv({
            cls: 'pr-period-item pr-period-item--missing',
            text: message
        })
    }

    override onunload(): void {
        this.clear()
    }
}
