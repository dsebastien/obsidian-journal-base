# Architecture

## Overview

**Journal Bases** is an Obsidian plugin providing custom Base views for periodic notes (daily, weekly, monthly, quarterly, yearly). It extends Obsidian's Bases feature with specialized views for journaling workflows.

## Core Concepts

- **Obsidian Bases**: Database-like queries over frontmatter properties
- **BasesView**: Abstract class for custom view rendering
- **Periodic Notes**: Time-based notes organized by period type
- **Period Types**: `daily | weekly | monthly | quarterly | yearly`

## Directory Structure

```
src/
├── main.ts                  # Re-exports plugin class
├── app/
│   ├── plugin.ts            # Plugin lifecycle, view registration
│   ├── settings/
│   │   └── settings-tab.ts  # Plugin settings UI
│   ├── services/
│   │   ├── note-creation.service.ts      # Note file creation
│   │   ├── plugin-integration.service.ts # External plugin APIs
│   │   └── embeddable-editor.service.ts  # Inline markdown editor
│   ├── components/
│   │   ├── note-card.ts         # Expandable note card
│   │   ├── create-note-button.ts # Missing note placeholder
│   │   ├── foldable-column.ts   # Collapsible column
│   │   └── period-tabs.ts       # Period type tabs
│   ├── views/
│   │   ├── periodic-notes/      # Single-column card view
│   │   │   ├── periodic-notes-view.ts
│   │   │   ├── periodic-notes-options.ts
│   │   │   └── periodic-notes.constants.ts
│   │   └── periodic-review/     # Multi-column review view
│   │       ├── periodic-review-view.ts
│   │       ├── periodic-review-options.ts
│   │       ├── periodic-review.constants.ts
│   │       ├── selection-context.ts
│   │       ├── period-generator.ts
│   │       └── entry-filter.ts
│   └── types/
│       ├── index.ts             # Barrel exports
│       ├── period-type.type.ts
│       ├── periodic-note-config.intf.ts
│       ├── plugin-settings.type.ts
│       └── periodic-notes-plugin-settings.schema.ts
└── utils/
    ├── date-utils.ts            # Date parsing/formatting (date-fns)
    ├── periodic-note-utils.ts   # Note detection/filtering
    ├── markdown-section-utils.ts # Section parsing
    └── log.ts                   # Logging utility
```

## View Architecture

### BasesView Pattern

Both views extend Obsidian's `BasesView`:

```
BasesView (abstract)
├── PeriodicNotesView   # Card-based single-period view
└── PeriodicReviewView  # Multi-column hierarchical view
```

Key lifecycle:

1. `constructor()` - Create container, register cleanup
2. `onDataUpdated()` - Called when Base query results change
3. `onunload()` - Cleanup resources

### View Registration

```typescript
this.registerBasesView(VIEW_TYPE_ID, {
    name: 'Display Name',
    icon: 'lucide-icon',
    factory: (controller, containerEl) => new View(controller, containerEl, this),
    options: getViewOptions // ViewOption[] factory
})
```

## Data Flow

```
Base Query
    ↓
onDataUpdated()
    ↓
this.data.data (BasesEntry[])
    ↓
Filter by period type (folder path)
    ↓
Extract dates from filenames (moment.js format)
    ↓
Sort newest → oldest (ignores Base sort config)
    ↓
Render UI
```

## State Management

### Plugin Settings

- Immutable via Immer's `produce()`
- Synced from Periodic Notes plugin if enabled (read-only mode)
- Persisted via `loadData()`/`saveData()`
- Observable via `onSettingsChange()` callback

### View Config

- Per-view options stored in Base config
- Accessed via `this.config.get(key)`/`this.config.set(key, value)`
- Options defined via `ViewOption[]`

### Selection Context (Periodic Review)

- Tracks selected year/quarter/month/week
- Tracks existence flags for each level
- Cascades changes to child columns
- Snapshot/restore for preserving state during data updates

## External Plugin Integration

### Periodic Notes Plugin

- Settings sync when enabled
- Polls for enable/disable state (1s interval)
- Listens for `periodic-notes:settings-updated` event

### Templater Plugin

- Template application via `create_new_note_from_template()`
- Required for template-based note creation

### Life Tracker Plugin

- `LifeTrackerPluginFileProvider` interface
- `getFiles()` returns view files for commands

## Card State Preservation

When `onDataUpdated()` is called:

1. Save card states (expanded, mode, hasActiveEditor)
2. Skip refresh for cards with active editors
3. Reconcile DOM without destroying existing cards
4. Preserve focus by avoiding DOM detachment of active editor cards

## Date Handling

- Uses `date-fns` library
- Moment.js format strings converted to date-fns format
- ISO week handling (week year can differ from calendar year)
- Weeks spanning boundaries appear in both periods (overlap logic)

## CSS Architecture

- Tailwind CSS v4 for utilities
- Obsidian CSS variables for theming
- Source: `src/styles.src.css`
- Output: `styles.css` (generated, do not edit)
