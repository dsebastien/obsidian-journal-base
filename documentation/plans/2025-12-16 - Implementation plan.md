# Journal Bases Plugin - Implementation Plan

## Progress Status

| Phase                         | Status      | Notes                                                             |
| ----------------------------- | ----------- | ----------------------------------------------------------------- |
| Phase 1: Foundation           | ✅ COMPLETE | Plugin renamed to `JournalBasesPlugin`, types, services, settings |
| Phase 2: Utilities            | ✅ COMPLETE | Using `date-fns` (not moment.js), all utilities implemented       |
| Phase 5: UI Components        | ✅ COMPLETE | NoteCard, CreateNoteButton, PeriodTabs, FoldableColumn            |
| Phase 3: Periodic Notes View  | ✅ COMPLETE | View registered and functional                                    |
| Phase 6: Styles               | ✅ COMPLETE | CSS for both views using Tailwind                                 |
| Phase 4: Periodic Review View | ✅ COMPLETE | Sliding panes style columns with section copy functionality       |

### Important Implementation Notes

1. **Date Library**: Using `date-fns` instead of moment.js (installed as dependency)
2. **Plugin Name**: `JournalBasesPlugin` (not `PeriodicNotesPlugin` as originally planned)
3. **Sliding Panes**: Phase 4 should use sliding panes concept from https://github.com/deathau/sliding-panes-obsidian
    - Fixed-width columns that stack horizontally
    - Horizontal scrolling to navigate
    - Headers rotate 90° and stick as "spines"
    - Use Tailwind CSS for implementation

### Current File Structure

```
src/
├── main.ts                                    ✅
├── app/
│   ├── plugin.ts                              ✅
│   ├── services/
│   │   ├── plugin-integration.service.ts      ✅
│   │   └── note-creation.service.ts           ✅
│   ├── settings/
│   │   └── settings-tab.ts                    ✅
│   ├── types/
│   │   ├── plugin-settings.intf.ts            ✅
│   │   └── periodic-note.types.ts             ✅
│   ├── views/
│   │   ├── periodic-notes/
│   │   │   ├── periodic-notes-view.ts         ✅
│   │   │   ├── periodic-notes-options.ts      ✅
│   │   │   └── periodic-notes.constants.ts    ✅
│   │   └── periodic-review/
│   │       ├── periodic-review-view.ts        ✅
│   │       ├── periodic-review-options.ts     ✅
│   │       └── periodic-review.constants.ts   ✅
│   └── components/
│       ├── note-card.ts                       ✅
│       ├── create-note-button.ts              ✅
│       ├── period-tabs.ts                     ✅
│       └── foldable-column.ts                 ✅
├── utils/
│   ├── log.ts                                 ✅
│   ├── date-utils.ts                          ✅
│   └── periodic-note-utils.ts                 ✅
└── styles.src.css                             ✅
```

---

## Goal

Two custom Obsidian Base view types for periodic notes (daily/weekly/monthly/quarterly/yearly):

1. **Periodic Notes View**: Timeline of collapsible note cards with mode switching
2. **Periodic Review View**: Side-by-side columns (Andy Matuschak / sliding panes style) for cross-referencing

---

## Completed Implementation

All phases are now complete. The implementation includes:

- **Periodic Notes View**: Timeline of collapsible note cards with mode switching (daily/weekly/monthly/quarterly/yearly)
- **Periodic Review View**: Side-by-side columns (sliding panes style) for cross-referencing notes with section copy functionality

### Implementation Details

### Phase 6: Styles (COMPLETE)

Add to `src/styles.src.css`:

```css
/* ===== Periodic Notes View ===== */
.periodic-notes-view {
    @apply flex flex-col gap-4 p-4;
}

.pn-tabs {
    @apply flex gap-2 mb-4;
}

.pn-tab {
    @apply px-3 py-1.5 rounded cursor-pointer transition-all duration-150;
    background-color: var(--background-secondary);
    color: var(--text-muted);
}

.pn-tab:hover {
    background-color: var(--background-modifier-hover);
}

.pn-tab--active {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
}

/* Note Cards */
.pn-cards {
    @apply flex flex-col gap-3;
}

.pn-card {
    @apply rounded border overflow-hidden;
    background-color: var(--background-primary);
    border-color: var(--background-modifier-border);
}

.pn-card__header {
    @apply flex items-center justify-between px-4 py-3 cursor-pointer;
    background-color: var(--background-secondary);
}

.pn-card__header:hover {
    background-color: var(--background-modifier-hover);
}

.pn-card__title {
    @apply font-medium;
    color: var(--text-normal);
}

.pn-card__title--missing {
    color: var(--text-muted);
}

.pn-card__open-btn {
    @apply p-1 rounded;
}

.pn-card__toggle {
    @apply transition-transform duration-200;
}

.pn-card--expanded .pn-card__toggle {
    @apply rotate-180;
}

.pn-card__content {
    @apply hidden px-4 py-3;
}

.pn-card--expanded .pn-card__content {
    @apply block;
}

.pn-card--missing {
    @apply opacity-70;
    border-style: dashed;
}

.pn-card__header--missing {
    @apply justify-between;
}

/* Create Button */
.pn-create-btn {
    @apply flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer;
    @apply transition-all duration-150 text-sm font-medium;
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
}

.pn-create-btn:hover {
    @apply opacity-90;
}

/* Empty State */
.pn-empty-state {
    @apply flex flex-col items-center justify-center py-12 gap-4;
    color: var(--text-muted);
}

.pn-empty-state__icon {
    @apply opacity-50;
}

.pn-empty-state__text {
    @apply text-center max-w-md;
}

/* ===== Periodic Review View (Sliding Panes Style) ===== */
.periodic-review-view {
    @apply h-full overflow-x-auto overflow-y-hidden;
    /* Horizontal scroll container */
}

.pr-columns {
    @apply flex h-full;
    /* Columns stack horizontally */
}

.pr-column {
    @apply flex flex-col h-full border-r relative;
    @apply transition-all duration-200;
    min-width: 350px;
    max-width: 450px;
    border-color: var(--background-modifier-border);
}

.pr-column--folded {
    @apply min-w-[48px] w-[48px] overflow-hidden;
}

/* Rotated header (sliding panes spine style) */
.pr-column__header {
    @apply flex items-center justify-between px-3 py-2;
    background-color: var(--background-secondary);
}

.pr-column--folded .pr-column__header {
    @apply absolute inset-0 flex-col justify-start pt-3;
    writing-mode: vertical-rl;
    text-orientation: mixed;
}

.pr-column__title {
    @apply font-medium text-sm;
    color: var(--text-normal);
}

.pr-column__fold-btn {
    @apply p-1 rounded;
}

.pr-column--folded .pr-column__fold-btn {
    @apply rotate-180 mb-2;
}

.pr-column__selector {
    @apply flex-shrink-0 overflow-y-auto max-h-[180px] border-b;
    border-color: var(--background-modifier-border);
}

.pr-column--folded .pr-column__selector {
    @apply hidden;
}

.pr-column__content {
    @apply flex-1 overflow-y-auto p-3;
}

.pr-column--folded .pr-column__content {
    @apply hidden;
}

/* Period selector items */
.pr-period-item {
    @apply px-3 py-2 cursor-pointer text-sm;
    color: var(--text-muted);
}

.pr-period-item:hover {
    background-color: var(--background-modifier-hover);
}

.pr-period-item--selected {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
}

.pr-period-item--missing {
    @apply opacity-60 italic;
}

/* Section styling */
.pr-section {
    @apply mb-4 pb-4 border-b;
    border-color: var(--background-modifier-border);
}

.pr-section:last-child {
    @apply border-b-0;
}

.pr-section__header {
    @apply flex items-center justify-between mb-2;
}

.pr-section__title {
    @apply font-medium;
    color: var(--text-normal);
}

.pr-copy-btn {
    @apply text-xs px-2 py-1 rounded cursor-pointer;
    background-color: var(--background-modifier-hover);
    color: var(--text-muted);
}

.pr-copy-btn:hover {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
}

.pr-section__content {
    @apply text-sm;
}
```

### Phase 4: Periodic Review View (COMPLETE)

Created `src/app/views/periodic-review/`:

#### periodic-review.constants.ts

```typescript
export const PERIODIC_REVIEW_VIEW_TYPE = 'periodic-review'
```

#### periodic-review-options.ts

```typescript
import type { ViewOption, ToggleOption, SliderOption } from 'obsidian'

export function getPeriodicReviewViewOptions(): ViewOption[] {
    return [
        {
            type: 'toggle',
            key: 'showDaily',
            displayName: 'Show daily column',
            default: true
        } as ToggleOption,
        {
            type: 'toggle',
            key: 'showWeekly',
            displayName: 'Show weekly column',
            default: true
        } as ToggleOption,
        {
            type: 'toggle',
            key: 'showMonthly',
            displayName: 'Show monthly column',
            default: true
        } as ToggleOption,
        {
            type: 'toggle',
            key: 'showQuarterly',
            displayName: 'Show quarterly column',
            default: false
        } as ToggleOption,
        {
            type: 'toggle',
            key: 'showYearly',
            displayName: 'Show yearly column',
            default: false
        } as ToggleOption,
        {
            type: 'slider',
            key: 'columnWidth',
            displayName: 'Column width',
            min: 300,
            max: 600,
            step: 50,
            default: 400
        } as SliderOption
    ]
}
```

#### periodic-review-view.ts

Key features to implement:

1. Horizontal scrolling container with fixed-width columns
2. Each column shows one period type (daily, weekly, etc.)
3. Period selector in each column to choose which period to display
4. Note content rendered with MarkdownRenderer
5. Section parsing with "Copy to..." buttons
6. Foldable columns with rotated headers (sliding panes style)
7. Auto-select most recent period on load

Register in `plugin.ts`:

```typescript
import { PERIODIC_REVIEW_VIEW_TYPE } from './views/periodic-review/periodic-review.constants'
import { PeriodicReviewView } from './views/periodic-review/periodic-review-view'
import { getPeriodicReviewViewOptions } from './views/periodic-review/periodic-review-options'

// In registerViews():
const periodicReviewRegistered = this.registerBasesView(PERIODIC_REVIEW_VIEW_TYPE, {
    name: 'Periodic Review',
    icon: 'columns',
    factory: (controller, containerEl) => new PeriodicReviewView(controller, containerEl, this),
    options: getPeriodicReviewViewOptions
})
```

---

## Key Decisions (Updated)

| Decision            | Choice                                                 |
| ------------------- | ------------------------------------------------------ |
| Plugin name         | `JournalBasesPlugin`                                   |
| Card display mode   | Toggle: preview by default, click to edit inline       |
| Gap detection scope | Between existing notes + configurable future extension |
| Forward-looking     | Support creating/editing future periodic notes         |
| Section matching    | Exact header match (future: configurable mapping)      |
| Settings sync       | Auto-sync from periodic-notes plugin if available      |
| Date library        | **`date-fns`** (not moment.js)                         |
| Template creation   | Use Templater's `create_new_note_from_template()` API  |
| Review view style   | Sliding panes (horizontal scroll, rotated headers)     |

---

## Key API References

| API                               | Usage                                        |
| --------------------------------- | -------------------------------------------- |
| `registerBasesView()`             | Register custom Base view types              |
| `BasesView`                       | Abstract class to extend for custom views    |
| `BasesEntry.file: TFile`          | Access underlying file                       |
| `BasesEntry.getValue(propertyId)` | Get property value                           |
| `BasesViewConfig.get(key)`        | Read view option value                       |
| `BasesViewConfig.set(key, value)` | Store view state                             |
| `ViewOption` types                | slider, dropdown, toggle, text, file, folder |
| `Vault.create(path, data)`        | Create new file                              |
| `Vault.cachedRead(file)`          | Read file content                            |
| `Vault.process(file, fn)`         | Atomically modify file                       |
| `MarkdownRenderer.render()`       | Render markdown to HTML                      |
| `date-fns`                        | Date manipulation library                    |
| `Notice`                          | Show notifications                           |
