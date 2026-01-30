# Configuration

Configure Journal Bases via **Settings > Journal Bases**.

## Period Type Settings

Each period type (daily, weekly, monthly, quarterly, yearly) has these settings:

| Setting      | Description                                | Example              |
| ------------ | ------------------------------------------ | -------------------- |
| **Enabled**  | Toggle this period type on/off             | `true`               |
| **Folder**   | Where notes are stored                     | `Journal/Daily`      |
| **Format**   | Filename format using Moment.js tokens     | `YYYY-MM-DD`         |
| **Template** | Path to Templater template file (optional) | `Templates/Daily.md` |

## Date Format Tokens

Uses Moment.js format tokens:

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

## Default Formats

| Period    | Format       | Example Output  |
| --------- | ------------ | --------------- |
| Daily     | `YYYY-MM-DD` | `2025-01-15.md` |
| Weekly    | `gggg-[W]ww` | `2025-W03.md`   |
| Monthly   | `YYYY-MM`    | `2025-01.md`    |
| Quarterly | `YYYY-[Q]Q`  | `2025-Q1.md`    |
| Yearly    | `YYYY`       | `2025.md`       |

## Nested Folder Formats

Formats can include path separators to organize notes in subfolders:

| Format               | Result                  |
| -------------------- | ----------------------- |
| `YYYY/MM/YYYY-MM-DD` | `2025/01/2025-01-15.md` |
| `YYYY/YYYY-[Q]Q`     | `2025/2025-Q1.md`       |
| `YYYY/MM/YYYY-MM`    | `2025/01/2025-01.md`    |

Folders are created automatically if they don't exist.

## View-Specific Options

View options are configured per Base instance via the view options menu (gear icon).

### Periodic Notes View Options

| Option               | Type   | Default | Description                   |
| -------------------- | ------ | ------- | ----------------------------- |
| Period type          | Select | Daily   | Which period type to display  |
| Future periods       | Slider | 1       | Future periods to show (0-12) |
| Expand first card    | Toggle | true    | Auto-expand newest note       |
| Show missing periods | Toggle | true    | Show create buttons for gaps  |

### Periodic Review View Options

| Option         | Type   | Default | Description                      |
| -------------- | ------ | ------- | -------------------------------- |
| Show daily     | Toggle | true    | Show daily column                |
| Show weekly    | Toggle | true    | Show weekly column               |
| Show monthly   | Toggle | true    | Show monthly column              |
| Show quarterly | Toggle | true    | Show quarterly column            |
| Show yearly    | Toggle | true    | Show yearly column               |
| Column width   | Slider | 400     | Column width in pixels (300-600) |

## Periodic Notes Plugin Sync

When the Periodic Notes plugin is enabled:

1. Journal Bases automatically syncs settings from Periodic Notes
2. Settings in Journal Bases become read-only (indicated in UI)
3. Make changes in the Periodic Notes settings instead
4. If Periodic Notes is disabled later, settings become editable again

**Sync requirements**: Periodic Notes must have at least one period type enabled with a non-empty folder.

## Template Configuration

To use templates:

1. Install and enable the Templater plugin
2. Create template files for each period type
3. Set the template path in Journal Bases settings

**Template path examples**:

- `Templates/Daily Note.md`
- `_templates/weekly.md`
- `My Templates/Journal/Monthly.md`

Templates are processed by Templater when creating new notes.
