# Components

UI components in `src/app/components/`.

## NoteCard

`note-card.ts` - Expandable card displaying a single periodic note.

### Features

- Collapsible header with title (filename + period suffix)
- Three view modes: view, edit, source
- Embedded markdown editor via `EmbeddableEditor`
- Debounced auto-save (1s)
- State preservation during reconciliation

### Props

```typescript
constructor(
    parent: HTMLElement,
    app: App,
    file: TFile,
    periodType: PeriodType,
    noteDate: Date | null,
    initiallyExpanded: boolean,
    onOpen?: (file: TFile) => void
)
```

### State

```typescript
type CardMode = 'view' | 'edit' | 'source'

interface CardState {
    expanded: boolean
    mode: CardMode
    hasActiveEditor: boolean
}
```

### Key Methods

| Method              | Description                             |
| ------------------- | --------------------------------------- |
| `toggle()`          | Toggle expanded state                   |
| `setMode(mode)`     | Switch view/edit/source mode            |
| `getMode()`         | Get current mode                        |
| `isExpanded()`      | Check if expanded                       |
| `hasActiveEditor()` | Check if editor has focus               |
| `refreshContent()`  | Reload content (skips if editor active) |
| `getElement()`      | Get DOM element                         |
| `getFile()`         | Get associated TFile                    |

### CSS Classes

- `.pn-card` - Container
- `.pn-card--expanded` - Expanded state
- `.pn-card--current` - Current period highlight
- `.pn-card__header` - Header area
- `.pn-card__title` - Title text
- `.pn-card__content` - Content area

---

## CreateNoteButton

`create-note-button.ts` - Placeholder for missing notes with create action.

### Variants

- `default` - Compact inline button
- `large` - Prominent button for column content

### Props

```typescript
constructor(
    parent: HTMLElement,
    date: Date,
    config: PeriodicNoteConfig,
    periodType: PeriodType,
    onClick: (date: Date) => Promise<boolean>,
    variant: 'default' | 'large' = 'default'
)
```

### CSS Classes

- `.pn-card--missing` - Missing note card style
- `.pn-create-btn` - Default create button
- `.pn-create-large` - Large variant container
- `.pn-create-large__btn` - Large variant button

---

## FoldableColumn

`foldable-column.ts` - Collapsible column for Periodic Review view.

### Structure

```
[Header: fold button | title | actions]
[Selector: period list]
[Content: note content]
```

### Props

```typescript
constructor(
    parent: HTMLElement,
    title: string
)
```

### Key Methods

| Method                 | Description                   |
| ---------------------- | ----------------------------- |
| `toggleFold()`         | Toggle collapsed state        |
| `fold()`               | Collapse column               |
| `unfold()`             | Expand column                 |
| `isFolded()`           | Check if collapsed            |
| `setWidth(width)`      | Set column width in pixels    |
| `getSelectorEl()`      | Get period selector container |
| `getContentEl()`       | Get content container         |
| `getHeaderActionsEl()` | Get header actions container  |
| `clear()`              | Clear selector and content    |

### CSS Classes

- `.pr-column` - Container
- `.pr-column--folded` - Collapsed state
- `.pr-column__header` - Header area
- `.pr-column__title` - Column title
- `.pr-column__fold-btn` - Fold toggle button
- `.pr-column__selector` - Period list area
- `.pr-column__content` - Content display area

---

## PeriodTabs

`period-tabs.ts` - Tab bar for period type selection in Periodic Notes view.

### Props

```typescript
constructor(
    parent: HTMLElement,
    availableModes: PeriodType[],
    currentMode: PeriodType,
    onChange: (mode: PeriodType) => void
)
```

### Key Methods

| Method             | Description                     |
| ------------------ | ------------------------------- |
| `setActiveMode()`  | Programmatically set active tab |
| `getCurrentMode()` | Get active period type          |
| `getElement()`     | Get DOM element                 |

### CSS Classes

- `.pn-tabs` - Tab container
- `.pn-tab` - Individual tab
- `.pn-tab--active` - Active tab

---

## Component Hierarchy

```
PeriodicNotesView
├── PeriodTabs
└── Cards Container
    ├── NoteCard (for existing notes)
    └── CreateNoteButton (for missing notes)

PeriodicReviewView
└── Columns Container
    └── FoldableColumn[]
        ├── Period Selector (period items)
        ├── Content Area
        │   ├── Note Content (sections)
        │   └── CreateNoteButton (if missing)
        └── Header Actions (create next year btn)
```
