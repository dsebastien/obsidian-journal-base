# Configuration

## Plugin Settings

Located in **Settings → Community plugins → Journal Bases**.

### Period Type Settings

Each period type (daily, weekly, monthly, quarterly, yearly) has:

| Setting      | Description                                               |
| ------------ | --------------------------------------------------------- |
| **Enabled**  | Toggle this period type on/off                            |
| **Folder**   | Vault path where notes are stored (e.g., `Journal/Daily`) |
| **Format**   | Moment.js format string for filenames                     |
| **Template** | Path to Templater template file                           |

### Settings Sync

When **Periodic Notes** plugin is enabled with meaningful configuration:

- Settings are synced automatically from Periodic Notes
- Plugin settings become read-only
- Settings persist even if Periodic Notes is later disabled

Sync criteria: At least one period type must have `enabled=true` AND non-empty `folder`.

## View Configuration

View-specific options are configured per Base view instance via the view options menu.

### Periodic Notes View

| Option               | Type     | Default | Description                           |
| -------------------- | -------- | ------- | ------------------------------------- |
| Period type          | Dropdown | Daily   | Which period type to display          |
| Future periods       | Slider   | 1       | Number of future periods (0-12)       |
| Expand first card    | Toggle   | On      | Auto-expand the most recent card      |
| Show missing periods | Toggle   | On      | Show create buttons for missing notes |

### Periodic Review View

| Option                | Type   | Default | Description                      |
| --------------------- | ------ | ------- | -------------------------------- |
| Show daily column     | Toggle | On      | Display daily column             |
| Show weekly column    | Toggle | On      | Display weekly column            |
| Show monthly column   | Toggle | On      | Display monthly column           |
| Show quarterly column | Toggle | Off     | Display quarterly column         |
| Show yearly column    | Toggle | Off     | Display yearly column            |
| Column width          | Slider | 400     | Column width in pixels (300-600) |

_Column toggles only appear for period types enabled in plugin settings._

## Date Format Reference

Uses Moment.js format tokens. Common patterns:

| Token    | Output        | Example |
| -------- | ------------- | ------- |
| `YYYY`   | 4-digit year  | 2025    |
| `MM`     | 2-digit month | 01-12   |
| `DD`     | 2-digit day   | 01-31   |
| `gggg`   | ISO week year | 2025    |
| `ww`     | ISO week      | 01-53   |
| `[Q]`    | Literal "Q"   | Q       |
| `Q`      | Quarter       | 1-4     |
| `[text]` | Literal text  | text    |

**Default Formats**:

- Daily: `YYYY-MM-DD`
- Weekly: `gggg-[W]ww`
- Monthly: `YYYY-MM`
- Quarterly: `YYYY-[Q]Q`
- Yearly: `YYYY`

**Path in Format**: Formats can include `/` for folder structure:

- `YYYY/MM/YYYY-MM-DD` creates `2025/12/2025-12-18.md`

## Required Plugins

### Templater (Optional)

Required for template-based note creation.

- Plugin ID: `templater-obsidian`
- Templates specified in period settings
- Without Templater: Notes created empty

### Periodic Notes (Optional)

Settings sync when enabled.

- Plugin ID: `periodic-notes`
- Settings auto-sync on changes
- Synced settings are read-only

### Life Tracker (Optional)

Command integration.

- Plugin ID: `life-tracker`
- Provides `getFiles()` via `LifeTrackerPluginFileProvider`
- Returns focused card's file or all visible files

## Base Configuration

The plugin registers two Base view types:

| View Type       | ID                | Icon     |
| --------------- | ----------------- | -------- |
| Periodic Notes  | `periodic-notes`  | calendar |
| Periodic Review | `periodic-review` | columns  |

To use: Create a Base → Switch view type → Select "Periodic Notes" or "Periodic Review".

### Base Query Requirements

The Base query should return files matching your periodic notes:

- Filter by folder path
- No specific frontmatter required
- Note detection uses folder path matching
- Date extraction uses filename parsing

Example filter: `path contains "Journal/Daily"`
