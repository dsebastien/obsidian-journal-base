# Domain Model

## Core Types

### PeriodType

```typescript
type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

const PERIOD_TYPES: readonly PeriodType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']
```

Hierarchy (parent → child): `yearly → quarterly → monthly → weekly → daily`

### PeriodicNoteConfig

Configuration for a single period type.

```typescript
interface PeriodicNoteConfig {
    enabled: boolean // Whether this period type is active
    folder: string // Vault path where notes are stored
    format: string // Moment.js format string for filenames
    template: string // Path to Templater template file
}
```

**Format Examples**:
| Period | Format | Example Filename |
|-----------|-------------------|-------------------|
| Daily | `YYYY-MM-DD` | `2025-12-18.md` |
| Weekly | `gggg-[W]ww` | `2025-W51.md` |
| Monthly | `YYYY-MM` | `2025-12.md` |
| Quarterly | `YYYY-[Q]Q` | `2025-Q4.md` |
| Yearly | `YYYY` | `2025.md` |

Formats can include folders: `YYYY/WW/YYYY-MM-DD` → `2025/51/2025-12-18.md`

### PluginSettings

```typescript
type PluginSettings = Record<PeriodType, PeriodicNoteConfig>

const DEFAULT_SETTINGS: PluginSettings = {
    daily: { enabled: false, folder: '', format: 'YYYY-MM-DD', template: '' },
    weekly: { enabled: false, folder: '', format: 'gggg-[W]ww', template: '' },
    monthly: { enabled: false, folder: '', format: 'YYYY-MM', template: '' },
    quarterly: { enabled: false, folder: '', format: 'YYYY-[Q]Q', template: '' },
    yearly: { enabled: false, folder: '', format: 'YYYY', template: '' }
}
```

## View-Specific Types

### CardState (Periodic Notes View)

```typescript
interface CardState {
    expanded: boolean // Is card content visible
    mode: CardMode // 'view' | 'edit' | 'source'
    hasActiveEditor: boolean // Editor has focus
}
```

### ColumnState (Periodic Review View)

```typescript
interface ColumnState {
    periodType: PeriodType
    column: FoldableColumn
    selectedDate: Date | null
    entries: BasesEntry[]
}
```

### SelectionContext (Periodic Review View)

Tracks hierarchical selection state across columns.

```typescript
interface SelectionContextSnapshot {
    selectedYear: number // Always set (defaults to current year)
    selectedQuarter: number | null // 1-4 or null
    selectedMonth: number | null // 0-11 or null
    selectedWeek: number | null // ISO week 1-53 or null
    selectedWeekYear: number | null // ISO week year (can differ at boundaries)
    yearExists: boolean
    quarterExists: boolean
    monthExists: boolean
    weekExists: boolean
}
```

## Obsidian Base Types

### BasesEntry

Represents a single file in a Base query result.

```typescript
interface BasesEntry {
    file: TFile // The file
    getValue(propId: BasesPropertyId): Value | null // Get property value
}
```

### Value Types

```typescript
class Value {
    toString(): string
}
class BooleanValue extends Value {
    isTruthy(): boolean
}
class NumberValue extends Value {
    /* parseFloat(toString()) */
}
class DateValue extends Value {
    /* new Date(toString()) */
}
class ListValue extends Value {
    length(): number
    get(i: number): Value
}
class StringValue extends Value {}
class NullValue extends Value {}
```

## Markdown Section

For content extraction and copying in Periodic Review.

```typescript
interface MarkdownSection {
    heading: string // Section title
    content: string // Content without heading
    level: number // 1-6 (heading level)
}
```

## External Plugin Interfaces

### LifeTrackerPluginFileProvider

Interface for Life Tracker plugin integration.

```typescript
interface LifeTrackerPluginFileProvider {
    getFiles(): TFile[] // Files for command operations
    getFilterMode(): 'never' // Never filter (returns all files)
}
```

### TemplaterPlugin

Internal interface for Templater integration.

```typescript
interface TemplaterPlugin {
    templater: {
        create_new_note_from_template(
            template: TFile | string,
            folder?: string,
            filename?: string,
            open_new_note?: boolean
        ): Promise<TFile | undefined>
        write_template_to_file(template_file: TFile, file: TFile): Promise<void>
    }
}
```

## View Options

### ViewOption Types

```typescript
type ViewOption =
    | SliderOption // Numeric with min/max/step
    | DropdownOption // Select from options
    | ToggleOption // Boolean
    | TextOption // Free text
    | PropertyOption // Base property selector
    | GroupOption // Nested options
```

### Periodic Notes View Options

| Key             | Type     | Default | Description                   |
| --------------- | -------- | ------- | ----------------------------- |
| `mode`          | dropdown | `daily` | Period type to display        |
| `futurePeriods` | slider   | `1`     | Future periods to show (0-12) |
| `expandFirst`   | toggle   | `true`  | Expand first card by default  |
| `showMissing`   | toggle   | `true`  | Show placeholders for missing |

### Periodic Review View Options

| Key             | Type   | Default | Description                      |
| --------------- | ------ | ------- | -------------------------------- |
| `showDaily`     | toggle | `true`  | Show daily column                |
| `showWeekly`    | toggle | `true`  | Show weekly column               |
| `showMonthly`   | toggle | `true`  | Show monthly column              |
| `showQuarterly` | toggle | `false` | Show quarterly column            |
| `showYearly`    | toggle | `false` | Show yearly column               |
| `columnWidth`   | slider | `400`   | Column width in pixels (300-600) |

_Column toggles only shown for enabled period types._
