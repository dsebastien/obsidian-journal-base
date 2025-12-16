# Periodic Notes Plugin - Implementation Plan

## Goal

Two custom Obsidian Base view types for periodic notes (daily/weekly/monthly/quarterly/yearly):

1. **Periodic Notes View**: Timeline of collapsible note cards with mode switching
2. **Periodic Review View**: Side-by-side columns (Andy Matuschak style) for cross-referencing

---

## Phase 1: Foundation

### 1.1 Rename Plugin

- `MyPlugin` → `PeriodicNotesPlugin` (`src/app/plugin.ts`)
- `MyPluginSettingTab` → `PeriodicNotesSettingTab` (`src/app/settings/settings-tab.ts`)
- Update export in `src/main.ts`

### 1.2 Settings Structure

`src/app/types/plugin-settings.intf.ts`:

```typescript
interface PeriodicNoteConfig {
    enabled: boolean
    folder: string
    format: string // e.g., "YYYY/WW/YYYY-MM-DD"
    template: string
}

interface PluginSettings {
    daily: PeriodicNoteConfig
    weekly: PeriodicNoteConfig
    monthly: PeriodicNoteConfig
    quarterly: PeriodicNoteConfig
    yearly: PeriodicNoteConfig
}
```

### 1.3 Plugin Integration

`src/app/services/plugin-integration.service.ts`:

- On load: check `app.plugins.enabledPlugins.has("periodic-notes")`
- If enabled: sync from `app.plugins.getPlugin('periodic-notes').settings`
- Listen to `periodic-notes:settings-updated` event
- If syncing: make settings read-only, show "Configure in Periodic Notes" message
- Check for Templater: `app.plugins.enabledPlugins.has("templater-obsidian")`, show notice if missing

### 1.4 Settings Tab

`src/app/settings/settings-tab.ts`:

- Per-type section: enabled toggle, folder picker, format input, template picker
- Disable inputs when syncing from periodic-notes plugin
- Folder/template pickers use Obsidian's suggest modals

---

## Phase 2: Utilities

### 2.1 Date Utilities

`src/utils/date-utils.ts`:

- `parseDateFromFormat(filename: string, format: string): Date | null`
- `generateDateRange(start: Date, end: Date, periodType: PeriodType): Date[]`
- `findMissingDates(existingDates: Date[], periodType: PeriodType, futureCount?: number): Date[]`
- `formatDate(date: Date, format: string): string`
- `getNextPeriod(date: Date, periodType: PeriodType): Date` - for forward navigation
- `getFuturePeriods(periodType: PeriodType, count: number): Date[]` - generate future dates

### 2.2 Periodic Note Utilities

`src/utils/periodic-note-utils.ts`:

- `detectPeriodType(file: TFile, settings: PluginSettings): PeriodType | null`
- `extractDateFromNote(file: TFile, config: PeriodicNoteConfig): Date | null`
- `groupNotesByPeriod(entries: BasesEntry[], settings: PluginSettings): Map<PeriodType, BasesEntry[]>`
- `getExpectedFilePath(date: Date, config: PeriodicNoteConfig): string`

---

## Phase 3: Periodic Notes View

### 3.1 Structure

`src/app/views/periodic-notes/`:

- `periodic-notes-view.ts` - BasesView subclass
- `periodic-notes-options.ts` - ViewOption[] for view config:
    - `futurePeriods`: slider (0-12) - how many future periods to show
    - `defaultExpanded`: toggle - expand first card by default
- `periodic-notes.constants.ts` - `PERIODIC_NOTES_VIEW_TYPE = 'periodic-notes'`

### 3.2 View Behavior

- **Mode switching**: Tab bar for daily/weekly/monthly/quarterly/yearly (only enabled types shown)
- **Layout**: Single column, full-width cards ordered by Base sort
- **Cards**: Toggle mode - preview by default, click to edit inline
- **First card expanded**, others collapsed
- **Empty states**:
    - No types enabled → "Configure periodic note types in plugin settings"
    - No notes match → "Check Base filters to include periodic notes"

### 3.3 Gap Detection & Future Notes

- Detect missing notes between existing ones in current mode
- **Forward-looking support**: Allow creating notes for future dates (next day, next week, next month, etc.)
- Edge handling options (configurable via view option):
    - Past edge: extend to first existing note or configurable start
    - Future edge: extend N periods ahead (e.g., +7 days, +4 weeks) - configurable
- Show "Create" button for both missing past dates and future dates
- Use cases: planning ahead, scheduling work, preparing periodic reviews in advance

### 3.4 Note Creation

`src/app/services/note-creation.service.ts`:

- Create file at expected path (from format)
- Apply Templater template via `app.plugins.getPlugin('templater-obsidian').templater.append_template_to_active_file()`
- Trigger view refresh

---

## Phase 4: Periodic Review View

### 4.1 Structure

`src/app/views/periodic-review/`:

- `periodic-review-view.ts` - BasesView subclass
- `periodic-review-options.ts` - ViewOption[] for view config
- `periodic-review.constants.ts` - `PERIODIC_REVIEW_VIEW_TYPE = 'periodic-review'`

### 4.2 View Behavior

- **Ignore Base sort order** - use internal date-based logic
- **Columns**: daily → weekly → monthly → quarterly → yearly (only enabled types)
- **Andy Matuschak style**: Foldable vertical columns, stacked/overlapping
- **Auto-selection**: Most recent year/month/week/day selected by default
- **Forward-looking support**:
    - Navigate to and create future periods (next week, next month, next quarter, next year)
    - Prepare year ahead during periodic reviews
    - Schedule/plan work for upcoming periods
- **Filtering hierarchy**:
    - Years: all available (past + current + next), most recent selected
    - Quarters: for selected year only (including future quarters)
    - Months: for selected year only (including future months)
    - Weeks: for selected year only (including future weeks)
    - Days: for selected week only (including future days)

### 4.3 Section Copying

- Match sections by exact markdown header (e.g., `## Accomplishments`)
- "Copy to..." button per section when same header exists in target note
- Append content to target section
- Future: configurable section mapping, template-based auto-detection

---

## Phase 5: UI Components

`src/app/components/`:

- `note-card.ts` - Collapsible card with preview/edit toggle
- `create-note-button.ts` - Styled button for missing notes
- `period-tabs.ts` - Tab bar for mode switching
- `foldable-column.ts` - Andy Matuschak column with fold/unfold

---

## Phase 6: Styles

`src/styles.src.css`:

- `.periodic-notes-view` - Container, mode tabs
- `.periodic-review-view` - Multi-column layout
- `.pn-card` - Card with collapsed/expanded states
- `.pn-card__preview` / `.pn-card__editor` - Content modes
- `.pn-create-btn` - Beautiful create button (accent color, icon)
- `.pn-column` - Foldable column styles
- Use Tailwind utilities + Obsidian CSS variables

---

## File Structure

```
src/
├── main.ts
├── app/
│   ├── plugin.ts
│   ├── services/
│   │   ├── plugin-integration.service.ts
│   │   └── note-creation.service.ts
│   ├── settings/
│   │   └── settings-tab.ts
│   ├── types/
│   │   ├── plugin-settings.intf.ts
│   │   └── periodic-note.types.ts
│   ├── views/
│   │   ├── periodic-notes/
│   │   │   ├── periodic-notes-view.ts
│   │   │   ├── periodic-notes-options.ts
│   │   │   └── periodic-notes.constants.ts
│   │   └── periodic-review/
│   │       ├── periodic-review-view.ts
│   │       ├── periodic-review-options.ts
│   │       └── periodic-review.constants.ts
│   └── components/
│       ├── note-card.ts
│       ├── create-note-button.ts
│       ├── period-tabs.ts
│       └── foldable-column.ts
├── utils/
│   ├── log.ts
│   ├── date-utils.ts
│   └── periodic-note-utils.ts
└── styles.src.css
```

---

## Implementation Sequence

1. Phase 1 (Foundation) - Settings, plugin integration
2. Phase 2 (Utilities) - Date/note helpers
3. Phase 5 (Components) - Reusable UI pieces
4. Phase 3 (Periodic Notes View) - First view type
5. Phase 6 (Styles) - Polish
6. Phase 4 (Periodic Review View) - Second view type

---

## Key Decisions

| Decision            | Choice                                                      |
| ------------------- | ----------------------------------------------------------- |
| Card display mode   | Toggle: preview by default, click to edit inline            |
| Gap detection scope | Between existing notes + configurable future extension      |
| Forward-looking     | Support creating/editing future periodic notes for planning |
| Section matching    | Exact header match (future: configurable mapping)           |
| Settings sync       | Auto-sync from periodic-notes plugin if available           |

---

## Files to Modify/Create

**Modify:**

- `src/main.ts`
- `src/app/plugin.ts`
- `src/app/types/plugin-settings.intf.ts`
- `src/app/settings/settings-tab.ts`
- `src/styles.src.css`
- `manifest.json`

**Create:**

- All files in `src/app/services/`
- All files in `src/app/views/`
- All files in `src/app/components/`
- `src/app/types/periodic-note.types.ts`
- `src/utils/date-utils.ts`
- `src/utils/periodic-note-utils.ts`
