# Periodic Review Base View Performance Optimization Plan

## IMPLEMENTATION STATUS (2025-12-18)

### Completed Steps

1. **Created `src/app/views/periodic-review/period-cache.ts`** - DONE
2. **Created `src/app/views/periodic-review/virtual-period-selector.ts`** - DONE
3. **Updated `src/app/views/periodic-review/entry-filter.ts`** - DONE
4. **Updated `src/app/views/periodic-review/periodic-review-view.ts`** - DONE

### Remaining Steps

5. **Update `src/styles.src.css`** - TODO
   Add virtual selector styles (see CSS section below)

6. **Run format and lint** - TODO

    ```bash
    bun run format
    bun run lint
    ```

7. **Test the implementation** - TODO

### CSS to Add to `src/styles.src.css`

```css
/* Virtual period selector */
.pr-virtual-selector {
    @apply relative;
    overflow: auto;
    max-height: 180px;
    min-height: 80px;
}

.pr-virtual-spacer {
    @apply pointer-events-none;
    width: 1px;
    visibility: hidden;
}

.pr-virtual-items {
    @apply absolute inset-x-0 top-0;
}

/* Ensure fixed height for period items */
.pr-period-item {
    @apply flex items-center px-2;
    height: 28px;
    line-height: 28px;
    box-sizing: border-box;
}
```

---

## Problem Statement

The Periodic Review view has significant performance issues:

1. **First load is slow** - Processes all entries for every period type synchronously
2. **Data updates are slow** - Even incremental updates re-render all period items
3. **Loading a whole year is slow** - No lazy loading/virtualization for 50+ weekly items
4. **Selection changes are slow** - Cascading re-renders all child columns completely

## Root Cause Analysis

### Current Bottlenecks (with file locations)

1. **`renderPeriodSelector()` in `periodic-review-view.ts:332-374`**
    - Calls `selectorEl.empty()` and recreates ALL items every time
    - For yearly view: 52 weeks + 12 months + 4 quarters = 68+ DOM recreations per update
    - Each item creation: `createDiv()`, class manipulation, event listener attachment

2. **`cascadeDownward()` in `periodic-review-view.ts:446-459`**
    - Selecting yearly cascades to quarterly → monthly → weekly = 3 column re-renders
    - Each cascade: clear selector → regenerate all periods → clear content

3. **`filterEntriesByContext()` in `entry-filter.ts:19-32`**
    - Runs on EVERY column for EVERY update
    - Calls `extractDateFromNote()` for each entry repeatedly
    - No caching of extracted dates

4. **No virtualization in period selectors**
    - All period items rendered to DOM even if not visible
    - Period selector is 180px tall - typically shows 4-6 items, but renders 50+

## Files to Modify

| File              | Path                                                    |
| ----------------- | ------------------------------------------------------- |
| Main view         | `src/app/views/periodic-review/periodic-review-view.ts` |
| Entry filter      | `src/app/views/periodic-review/entry-filter.ts`         |
| Period generator  | `src/app/views/periodic-review/period-generator.ts`     |
| Selection context | `src/app/views/periodic-review/selection-context.ts`    |
| Foldable column   | `src/app/components/foldable-column.ts`                 |
| Styles            | `src/styles.src.css`                                    |

## New Files to Create

| File             | Path                                                       |
| ---------------- | ---------------------------------------------------------- |
| Virtual selector | `src/app/views/periodic-review/virtual-period-selector.ts` |
| Period cache     | `src/app/views/periodic-review/period-cache.ts`            |

---

## Phase 1: Period Cache Module

### Create `src/app/views/periodic-review/period-cache.ts`

```typescript
import type { TFile, BasesEntry } from 'obsidian'
import type { PeriodType, PeriodicNoteConfig, Settings } from '../../types'
import {
    extractDateFromNote,
    filterEntriesByPeriodType,
    sortEntriesByDate
} from '../../../utils/periodic-note-utils'
import type { SelectionContext, SelectionContextSnapshot } from './selection-context'
import { generatePeriodsForContext } from './period-generator'
import { filterEntriesByContext } from './entry-filter'

/**
 * Centralized caching for expensive periodic review operations.
 * Provides significant performance improvements by avoiding redundant computations.
 */
export class PeriodCache {
    // Date extraction cache - WeakMap so entries are garbage collected
    private dateCache: WeakMap<TFile, Date | null> = new WeakMap()

    // Entries by period type - invalidated when data changes
    private entriesByTypeCache: Map<PeriodType, BasesEntry[]> = new Map()
    private entriesCacheDataVersion: number = 0

    // Generated periods cache - invalidated when context changes
    private periodsCache: Map<PeriodType, Date[]> = new Map()
    private periodsCacheContextHash: string = ''

    // Filtered entries by context cache
    private filteredEntriesCache: Map<string, BasesEntry[]> = new Map()
    private filteredEntriesCacheVersion: number = 0

    private currentDataVersion: number = 0

    /**
     * Extract date from note with caching.
     * Uses WeakMap so cache entries are automatically cleaned when TFile is garbage collected.
     */
    extractDate(file: TFile, config: PeriodicNoteConfig): Date | null {
        if (this.dateCache.has(file)) {
            return this.dateCache.get(file) ?? null
        }

        const date = extractDateFromNote(file, config)
        this.dateCache.set(file, date)
        return date
    }

    /**
     * Get entries filtered by period type with caching.
     * Cache is invalidated when data version changes.
     */
    getEntriesByType(
        data: BasesEntry[],
        periodType: PeriodType,
        settings: Settings,
        dataVersion: number
    ): BasesEntry[] {
        // Invalidate cache if data changed
        if (dataVersion !== this.entriesCacheDataVersion) {
            this.entriesByTypeCache.clear()
            this.entriesCacheDataVersion = dataVersion
        }

        const cached = this.entriesByTypeCache.get(periodType)
        if (cached) {
            return cached
        }

        const entries = filterEntriesByPeriodType(data, periodType, settings)
        const config = settings[periodType]
        const sorted = sortEntriesByDate(entries, config, false)

        this.entriesByTypeCache.set(periodType, sorted)
        return sorted
    }

    /**
     * Get generated periods for context with caching.
     * Cache is invalidated when context changes.
     */
    getPeriodsForContext(
        periodType: PeriodType,
        context: SelectionContext,
        enabledTypes: PeriodType[]
    ): Date[] {
        const contextHash = this.hashContext(context, enabledTypes)

        // Invalidate cache if context changed
        if (contextHash !== this.periodsCacheContextHash) {
            this.periodsCache.clear()
            this.periodsCacheContextHash = contextHash
        }

        const cached = this.periodsCache.get(periodType)
        if (cached) {
            return cached
        }

        const periods = generatePeriodsForContext(periodType, context, enabledTypes)
        this.periodsCache.set(periodType, periods)
        return periods
    }

    /**
     * Get filtered entries by context with caching.
     */
    getFilteredEntries(
        entries: BasesEntry[],
        periodType: PeriodType,
        config: PeriodicNoteConfig,
        context: SelectionContext,
        enabledTypes: PeriodType[],
        dataVersion: number
    ): BasesEntry[] {
        const cacheKey = `${periodType}-${this.hashContext(context, enabledTypes)}`

        if (dataVersion !== this.filteredEntriesCacheVersion) {
            this.filteredEntriesCache.clear()
            this.filteredEntriesCacheVersion = dataVersion
        }

        const cached = this.filteredEntriesCache.get(cacheKey)
        if (cached) {
            return cached
        }

        const filtered = filterEntriesByContext(
            entries,
            periodType,
            config,
            context,
            enabledTypes,
            this
        )
        this.filteredEntriesCache.set(cacheKey, filtered)
        return filtered
    }

    /**
     * Invalidate all caches (call when data fundamentally changes).
     */
    invalidateAll(): void {
        this.entriesByTypeCache.clear()
        this.periodsCache.clear()
        this.filteredEntriesCache.clear()
        this.currentDataVersion++
    }

    /**
     * Get current data version for cache invalidation.
     */
    getDataVersion(): number {
        return this.currentDataVersion
    }

    /**
     * Increment data version (call when new data arrives).
     */
    incrementDataVersion(): void {
        this.currentDataVersion++
    }

    private hashContext(context: SelectionContext, enabledTypes: PeriodType[]): string {
        return JSON.stringify({
            year: context.selectedYear,
            quarter: context.selectedQuarter,
            month: context.selectedMonth,
            week: context.selectedWeek,
            weekYear: context.selectedWeekYear,
            enabled: enabledTypes.sort()
        })
    }
}
```

---

## Phase 2: Virtual Period Selector

### Create `src/app/views/periodic-review/virtual-period-selector.ts`

```typescript
import { Component } from 'obsidian'
import type { BasesEntry } from 'obsidian'

export interface VirtualPeriodItem {
    date: Date
    label: string
    entry: BasesEntry | null
    isMissing: boolean
    isFuture: boolean
    isCurrent: boolean
}

/**
 * Virtual scrolling component for period selectors.
 * Only renders visible items + buffer for optimal performance.
 * Critical for yearly views with 50+ weeks.
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
        private onSelect: (date: Date, entry: BasesEntry | null) => void
    ) {
        super()
        this.setupDOM()
        this.setupScrollListener()
    }

    private setupDOM(): void {
        // Container styles
        this.containerEl.addClass('pr-virtual-selector')
        this.containerEl.style.overflow = 'auto'
        this.containerEl.style.position = 'relative'

        // Spacer to create scrollable height
        this.spacerEl = this.containerEl.createDiv({ cls: 'pr-virtual-spacer' })
        this.spacerEl.style.width = '1px'
        this.spacerEl.style.visibility = 'hidden'

        // Items container with absolute positioning
        this.itemsContainerEl = this.containerEl.createDiv({ cls: 'pr-virtual-items' })
        this.itemsContainerEl.style.position = 'absolute'
        this.itemsContainerEl.style.top = '0'
        this.itemsContainerEl.style.left = '0'
        this.itemsContainerEl.style.right = '0'
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

        // Clear existing items
        this.itemPool.forEach((el) => el.remove())
        this.itemPool.clear()

        this.renderVisibleItems()
    }

    /**
     * Update selection without re-rendering items.
     */
    setSelection(date: Date | null): void {
        this.selectedDate = date

        // Update selection class on rendered items
        for (const [index, el] of this.itemPool) {
            const item = this.items[index]
            if (!item) continue

            const isSelected = date && item.date.getTime() === date.getTime()
            el.classList.toggle('pr-period-item--selected', isSelected)
        }
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

    private updateTotalHeight(): void {
        const totalHeight = this.items.length * this.itemHeight
        this.spacerEl.style.height = `${totalHeight}px`
    }

    private renderVisibleItems(): void {
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
        if (item.isFuture) classes.push('pr-period-item--future')
        if (item.isCurrent) classes.push('pr-period-item--current')
        if (this.selectedDate && item.date.getTime() === this.selectedDate.getTime()) {
            classes.push('pr-period-item--selected')
        }
        el.className = classes.join(' ')

        // Set text
        el.textContent = item.label

        // Click handler
        el.addEventListener('click', () => {
            this.onSelect(item.date, item.entry)
        })

        return el
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

    override onunload(): void {
        this.clear()
    }
}
```

---

## Phase 3: Update Entry Filter

### Update `src/app/views/periodic-review/entry-filter.ts`

Add cache parameter to `filterEntriesByContext`:

```typescript
import type { BasesEntry } from 'obsidian'
import type { PeriodType, PeriodicNoteConfig } from '../../types'
import type { SelectionContext } from './selection-context'
import type { PeriodCache } from './period-cache'
import {
    getYear,
    getMonth,
    getQuarter,
    getWeek,
    getISOWeekYear,
    getEndOfPeriod,
    doesPeriodOverlapParent
} from '../../../utils/date-utils'

/**
 * Filter entries based on the current selection context.
 * Only filters by enabled parent period types - disabled types are ignored.
 *
 * @param cache - Optional PeriodCache for date extraction caching
 */
export function filterEntriesByContext(
    entries: BasesEntry[],
    periodType: PeriodType,
    config: PeriodicNoteConfig,
    context: SelectionContext,
    enabledTypes: PeriodType[],
    cache?: PeriodCache
): BasesEntry[] {
    return entries.filter((entry) => {
        // Use cache for date extraction if available
        const date = cache
            ? cache.extractDate(entry.file, config)
            : extractDateFromNote(entry.file, config)
        if (!date) return false

        return isEntryInContext(date, periodType, context, enabledTypes)
    })
}

// ... rest of file unchanged
```

---

## Phase 4: Update Periodic Review View

### Major changes to `src/app/views/periodic-review/periodic-review-view.ts`

#### 1. Add imports and properties

```typescript
import { debounce } from 'obsidian'
import { VirtualPeriodSelector, type VirtualPeriodItem } from './virtual-period-selector'
import { PeriodCache } from './period-cache'

// In PeriodicReviewView class:
private cache: PeriodCache = new PeriodCache()
private dataVersion: number = 0
private pendingUpdate: boolean = false

// Debounced data update (50ms)
private debouncedDataUpdate = debounce(() => {
    this.doDataUpdate()
}, 50, true)
```

#### 2. Update ColumnState interface

```typescript
interface ColumnState {
    periodType: PeriodType
    column: FoldableColumn
    selectedDate: Date | null
    entries: BasesEntry[]
    noteCard: NoteCard | null
    virtualSelector: VirtualPeriodSelector | null // NEW
    needsRefresh: boolean // NEW - for lazy cascading
}
```

#### 3. Replace onDataUpdated with debounced version

```typescript
override onDataUpdated(): void {
    this.debouncedDataUpdate()
}

private doDataUpdate(): void {
    // Increment data version for cache invalidation
    this.dataVersion++
    this.cache.incrementDataVersion()

    // Check if we can do an incremental update
    const newEnabledTypes = getEnabledPeriodTypes(this.plugin.settings)
    const newVisibleTypes = this.getVisiblePeriodTypes(newEnabledTypes)
    const structureChanged = this.hasStructureChanged(newEnabledTypes, newVisibleTypes)

    if (!structureChanged && this.columns.size > 0 && !this.isFirstLoad) {
        this.incrementalUpdate()
        return
    }

    // Full rebuild needed
    // ... existing full rebuild code with cache usage
}
```

#### 4. Update incrementalUpdate to use cache

```typescript
private incrementalUpdate(): void {
    for (const [periodType, state] of this.columns) {
        const config = this.plugin.settings[periodType]
        if (!config.enabled) continue

        // Use cache for entries
        state.entries = this.cache.getEntriesByType(
            this.data.data,
            periodType,
            this.plugin.settings,
            this.dataVersion
        )

        // Update virtual selector with new items
        this.updateVirtualSelector(state, config)

        // Refresh NoteCard if present and not being edited
        if (state.selectedDate && state.noteCard) {
            if (!state.noteCard.hasActiveEditor()) {
                state.noteCard.refreshContent()
            }
        }
    }
}
```

#### 5. Replace renderPeriodSelector with virtual selector

```typescript
private createColumn(
    periodType: PeriodType,
    config: PeriodicNoteConfig,
    entries: BasesEntry[],
    width: number
): void {
    const column = new FoldableColumn(this.columnsEl, PERIOD_TYPE_LABELS[periodType])
    column.setWidth(width)

    // Create virtual selector
    const selectorEl = column.getSelectorEl()
    const virtualSelector = new VirtualPeriodSelector(
        selectorEl,
        (date, entry) => this.selectPeriod(state, date, entry)
    )
    this.addChild(virtualSelector)

    const state: ColumnState = {
        periodType,
        column,
        selectedDate: null,
        entries,
        noteCard: null,
        virtualSelector,
        needsRefresh: false
    }
    this.columns.set(periodType, state)

    // ... rest of createColumn

    this.updateVirtualSelector(state, config)
}

private updateVirtualSelector(state: ColumnState, config: PeriodicNoteConfig): void {
    if (!state.virtualSelector) return

    const parentMissingMessage = this.getParentMissingMessage(state.periodType)
    if (parentMissingMessage) {
        state.virtualSelector.clear()
        this.renderParentMissingMessage(state.column.getSelectorEl(), parentMissingMessage)
        state.column.getContentEl().empty()
        return
    }

    const items = this.buildVirtualItems(state, config)
    state.virtualSelector.setItems(items)

    if (state.selectedDate) {
        state.virtualSelector.setSelection(state.selectedDate)
        state.virtualSelector.scrollToSelection()
    }
}

private buildVirtualItems(state: ColumnState, config: PeriodicNoteConfig): VirtualPeriodItem[] {
    // Use cache for filtered entries
    const filteredEntries = this.cache.getFilteredEntries(
        state.entries,
        state.periodType,
        config,
        this.context,
        this.enabledTypes,
        this.dataVersion
    )

    const dateEntryMap = new Map<number, BasesEntry>()
    for (const entry of filteredEntries) {
        const date = this.cache.extractDate(entry.file, config)
        if (date) {
            const normalized = getStartOfPeriod(date, state.periodType)
            dateEntryMap.set(normalized.getTime(), entry)
        }
    }

    // Use cache for periods
    const contextPeriods = this.cache.getPeriodsForContext(
        state.periodType,
        this.context,
        this.enabledTypes
    )

    // Include any dates from existing entries not in generated periods
    const contextPeriodSet = new Set(contextPeriods.map(d => d.getTime()))
    for (const entryTime of dateEntryMap.keys()) {
        if (!contextPeriodSet.has(entryTime)) {
            contextPeriods.push(new Date(entryTime))
        }
    }

    contextPeriods.sort((a, b) => b.getTime() - a.getTime())

    const now = Date.now()
    const items: VirtualPeriodItem[] = []

    for (const date of contextPeriods) {
        const entry = dateEntryMap.get(date.getTime()) ?? null
        const label = formatFilenameWithSuffix(date, config.format, state.periodType)

        items.push({
            date,
            label,
            entry,
            isMissing: !entry,
            isFuture: date.getTime() > now,
            isCurrent: isCurrentPeriod(date, state.periodType)
        })
    }

    return items
}
```

#### 6. Update cascadeDownward for lazy updates

```typescript
private cascadeDownward(periodType: PeriodType): void {
    const childTypes = getChildPeriodTypes(periodType).filter(ct => this.columns.has(ct))

    for (const childType of childTypes) {
        const childState = this.columns.get(childType)
        if (!childState) continue

        // Clear selection state
        childState.selectedDate = null
        this.context.setExists(childType, false)

        // Mark as needing refresh
        childState.needsRefresh = true

        // If column is in viewport, refresh immediately
        // Otherwise, defer until column scrolls into view
        if (this.isColumnInViewport(childState)) {
            this.refreshColumn(childState)
        } else {
            // Clear content but defer selector update
            childState.column.getContentEl().empty()
            if (childState.noteCard) {
                childState.noteCard.unload()
                childState.noteCard = null
            }
        }
    }
}

private isColumnInViewport(state: ColumnState): boolean {
    const el = state.column.getElement()
    const rect = el.getBoundingClientRect()
    const containerRect = this.containerEl.getBoundingClientRect()

    return (
        rect.left < containerRect.right &&
        rect.right > containerRect.left
    )
}

private refreshColumn(state: ColumnState): void {
    const config = this.plugin.settings[state.periodType]
    this.updateVirtualSelector(state, config)
    state.needsRefresh = false
}
```

#### 7. Add viewport observer for lazy column updates

```typescript
// In constructor or onload:
this.setupViewportObserver()

private setupViewportObserver(): void {
    // Check for columns needing refresh when container scrolls
    this.registerDomEvent(this.columnsEl, 'scroll', () => {
        this.checkDeferredRefreshes()
    })
}

private checkDeferredRefreshes(): void {
    for (const state of this.columns.values()) {
        if (state.needsRefresh && this.isColumnInViewport(state)) {
            this.refreshColumn(state)
        }
    }
}
```

#### 8. Update cleanupColumns

```typescript
private cleanupColumns(): void {
    for (const state of this.columns.values()) {
        if (state.noteCard) {
            state.noteCard.unload()
        }
        if (state.virtualSelector) {
            this.removeChild(state.virtualSelector)
        }
        state.column.unload()
    }
    this.columns.clear()
}
```

---

## Phase 5: Update CSS

### Add to `src/styles.src.css`

```css
/* Virtual period selector */
.pr-virtual-selector {
    @apply relative;
    max-height: 180px;
    min-height: 80px;
}

.pr-virtual-spacer {
    @apply pointer-events-none;
}

.pr-virtual-items {
    @apply absolute inset-x-0 top-0;
}

/* Ensure fixed height for period items */
.pr-period-item {
    @apply flex items-center px-2;
    height: 28px;
    line-height: 28px;
    box-sizing: border-box;
}
```

---

## Testing Checklist

1. **Performance benchmarks**
    - [ ] First load with 1000+ entries < 200ms
    - [ ] Incremental update < 50ms
    - [ ] Selection cascade < 30ms per level
    - [ ] Yearly view with 52 weeks: smooth scrolling

2. **Business rules compliance**
    - [ ] Card state preserved during updates (expanded/collapsed, mode)
    - [ ] Selection state preserved during data updates
    - [ ] Cards with active editors NOT refreshed
    - [ ] Notes sorted newest to oldest

3. **Functional tests**
    - [ ] Virtual selector scrolling works smoothly
    - [ ] Selection persists after data update
    - [ ] Cascade clears child selections properly
    - [ ] Create note button works in virtual selector
    - [ ] Current period highlighting works
    - [ ] Missing/future period styling works

4. **Edge cases**
    - [ ] Empty state when no periods available
    - [ ] Parent missing message displayed correctly
    - [ ] Week boundary handling (2025-W01 in both years)
    - [ ] ISO week year differences handled

---

## Success Criteria

- First load: < 200ms for 1000+ entries
- Data updates: < 50ms for incremental updates
- Selection changes: < 30ms per cascade level
- Yearly view with 52 weeks: Smooth scrolling, no jank (60fps)

## Risk Mitigation

- **Preserve business rules** - Card state, selection preservation per Business Rules.md
- **Incremental rollout** - Each phase can be implemented independently
- **Fallback** - If virtual scrolling causes issues, can revert to DOM diffing only
