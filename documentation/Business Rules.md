# Business Rules

Core business rules. MUST be respected unless explicitly approved otherwise.

---

## Documentation Guidelines

When a new business rule is mentioned:

1. Add it to this document immediately
2. Use concise format (single line or paragraph)
3. Maintain precision
4. Include rationale where it adds clarity

---

## Sorting

### Periodic Notes Sorting

Notes are ALWAYS sorted newest to oldest (most recent first). The Base sort configuration is fully ignored. This applies to:

- Card rendering order in Periodic Notes view
- Period selector order in Periodic Review view
- `getFiles()` return order for Life Tracker integration

---

## UI State Preservation

### Card State on Data Updates

When `onDataUpdated()` is called:

- Existing cards must NOT be destroyed and recreated
- Expanded/collapsed state must be preserved
- Editor mode (view/edit/source) must be preserved
- Cards with active/focused editors must NOT be refreshed
- Cards removed only when file is no longer in dataset

### Selection State on Data Updates (Periodic Review)

When data updates:

- Current selection context is saved before rebuild
- Selection is restored after rebuild
- Existence flags are updated based on new data

---

## Disabled Period Types Filtering

A period type is considered "not visible" when:

- The period type is disabled in plugin settings, OR
- The column is hidden in Periodic Review view options (e.g., `showWeekly=false`)

When a period type is not visible:

**Period Generation**: Child types show expanded ranges. Examples:

- If yearly column is hidden, quarterly column shows quarters across multiple years
- If weekly column is hidden, daily column shows all days in the selected month
- If only yearly and daily columns are visible, daily column shows all days in the selected year

**Context Inheritance**: Selecting a visible child implicitly determines parent values. Example: selecting Q4 2025 sets year to 2025 even if yearly column is hidden.

**Cascading Behavior**: Only visible period types influence filtering. Hidden columns are skipped in the hierarchy.

---

## Week Boundary Handling

Weeks spanning period boundaries appear in BOTH parent periods.

Example: Week 2025-W01 (Dec 30, 2024 - Jan 5, 2025) appears in:

- December 2024 monthly column
- January 2025 monthly column
- 2024 yearly column
- 2025 yearly column

Uses overlap logic: `periodStart <= parentEnd AND periodEnd >= parentStart`

---

## ISO Week Year

Weekly notes use ISO week numbering:

- Week starts on Monday
- First week contains January 4
- ISO week year can differ from calendar year at boundaries
- Example: 2025-12-31 is in ISO week 1 of 2026

---

## Settings Sync

### Periodic Notes Plugin Sync

When Periodic Notes plugin is enabled with meaningful configuration:

- Settings sync automatically on load and on changes
- Plugin settings become read-only
- Settings persist to disk (remain if Periodic Notes is disabled)

"Meaningful configuration" = at least one period type with `enabled=true` AND non-empty `folder`.

If Periodic Notes has no meaningful config, sync is skipped and local settings remain editable.

---

## Note Creation

### Create Button Behavior

The "Create" button in Periodic Notes and Periodic Review views:

- Creates notes in the folder configured for that specific period type (daily/weekly/monthly/quarterly/yearly)
- Each period type uses its own `folder` setting from plugin configuration
- If the note already exists at the target path, returns the existing file without overwriting

### File Path Construction

`{folder}/{formatted_date}.md`

Where `formatted_date` uses the moment.js format string. Format may include nested folders (e.g., `YYYY/MM/YYYY-MM-DD`).

### Template Application

1. If template configured AND Templater enabled → use Templater
2. Otherwise → create empty file

### Folder Creation

Missing folders are created recursively before file creation.

### Duplicate Prevention

If file already exists at target path, return existing file (no overwrite). A notice is shown to inform the user.

---

## Period Type Hierarchy

Strict ordering from largest to smallest:

```
yearly → quarterly → monthly → weekly → daily
```

Parent-child relationships:

- Yearly: parent of quarterly
- Quarterly: parent of monthly
- Monthly: parent of weekly
- Weekly: parent of daily

---

## Current Period Detection

A period is "current" if it contains today's date. Used for:

- Visual highlighting (`.pn-card--current`)
- Auto-selection in Periodic Review

Comparison uses `getStartOfPeriod()` normalization.
