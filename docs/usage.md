---
title: Usage
nav_order: 2
---

# Usage Guide

Journal Bases provides two specialized Base views: **Periodic Notes** for daily journaling and **Periodic Review** for extracting insights across period types.

## Periodic Notes View

The Periodic Notes view supports daily journaling with easy navigation between notes.

### What It Does

- Lists notes for one period type at a time (daily, weekly, monthly, quarterly, yearly)
- Displays notes in **descending order** (newest first)
- Provides expandable/collapsible cards for focus
- Enables inline editing without leaving the view
- Auto-saves with 1-second debounce
- Highlights the current period
- Shows create buttons for missing notes

### View Options

| Option               | Description                                            |
| -------------------- | ------------------------------------------------------ |
| Period type          | Which period to display (daily, weekly, monthly, etc.) |
| Future periods       | Number of future periods to show (0-12)                |
| Expand first card    | Auto-expand the most recent note on load               |
| Show missing periods | Show create buttons for missing notes in sequence      |

### Use Cases

- Morning journaling routine
- Quick review of recent entries
- Batch-creating notes for upcoming days/weeks
- Filling in gaps for missed days

---

## Periodic Review View

The Periodic Review view facilitates periodic reviews with a multi-column layout.

### What It Does

This view (inspired by Andy Matuschak's sliding panes) lets you:

1. **Select or create a yearly note**, then
2. **Select or create a quarterly note**, then
3. **Select or create a monthly note**, then
4. **Select or create a weekly note**, then
5. **See all daily notes** for that week

### Hierarchical Drilling

- Select a **week** to see daily notes from that week
- Select a **month** to see weeks in that month
- Select a **quarter** to see months in that quarter
- Select a **year** to see quarters in that year

### The Review Workflow

1. Open the Periodic Review view
2. Navigate to the period you want to review
3. Read through child notes in the left column
4. Extract key learnings into the parent note
5. Mark the review as done (optional)
6. Repeat at each level

### View Options

| Option               | Description                                           |
| -------------------- | ----------------------------------------------------- |
| Show columns         | Toggle visibility for each period type                |
| Collapse frontmatter | Fold a note's YAML frontmatter when it opens (source) |
| Column width         | Width of each column in pixels (300-600)              |

### Column Features

- **Collapse/expand**: Click the fold button to minimize columns
- **Mark as Done**: Track completed reviews (cascades to child periods)
- **Previous/Next**: Navigate between periods in each column
- **Create buttons**: Appear for periods without notes

### Use Cases

- Weekly reviews: synthesizing daily notes into weekly summaries
- Monthly reviews: extracting themes from weekly notes
- Quarterly reviews: identifying patterns across months
- Yearly reviews: creating annual summaries

---

## Note Cards

Both views share these card features:

### Editing Modes

- **View mode**: Read-only display
- **Edit mode** (Live Preview): Edit with formatting visible
- **Source mode**: Edit raw markdown

### Auto-Save

Changes save automatically after 1 second of inactivity. No manual save required.

### Current Period Highlighting

The card for today's/current period has a visual indicator.

### State Preservation

When files change externally:

- Expanded/collapsed state preserved
- Editor mode preserved
- Cursor position preserved
- Scroll position preserved

---

## Creating Notes

### Missing Note Placeholders

When a note doesn't exist for a period, a create button appears.

### Template Support

If you have Templater installed and configured a template path:

- New notes are created using the template
- Templater processes the template on creation

### Folder Creation

Nested folders are created automatically if they don't exist.

---

## Commands

Journal Bases adds commands to the command palette (open it with **Ctrl/Cmd + P**)
so you can work with periodic notes without opening a Base view. Commands for a
period type only appear when that period type is enabled in settings.

### Open notes

For each enabled period type, three commands open (and create if missing) a note
relative to today:

| Command (daily example)   | Opens           |
| ------------------------- | --------------- |
| **Open today's note**     | Current period  |
| **Open yesterday's note** | Previous period |
| **Open tomorrow's note**  | Next period     |

The weekly, monthly, quarterly and yearly variants read "this week's / last week's /
next week's note", "this month's / last month's / next month's note", and so on.
Notes open in the active pane, falling back to a new tab. Missing notes are created
from the configured template (if any) before opening.

### Mark reviews done

- **Toggle done state for today's note** (and the weekly/monthly/… variants) flips
  the done status of the current-period note, cascading to its child periods — the
  same behavior as the check button in the Periodic Review view. If the current note
  doesn't exist yet, a notice tells you so (done status is stored in frontmatter, so
  the note must exist first).

### Create notes in bulk

- **Create all missing notes for the current period** creates the current note for
  every enabled period type in one step and reports how many were created. Existing
  notes are left untouched.

---

## Week Boundary Handling

Weeks that span month or year boundaries appear in both parent periods.

**Example**: Week 2025-W01 (Dec 30, 2024 - Jan 5, 2025) appears in:

- December 2024 **and** January 2025 (monthly view)
- 2024 **and** 2025 (yearly view)

---

## Integration with Other Plugins

### Periodic Notes Plugin

When the Periodic Notes plugin is enabled:

- Settings sync automatically
- Journal Bases settings become read-only
- Settings remain editable if Periodic Notes is later disabled

### Templater Plugin

- Configure template paths per period type
- Templates are processed on note creation
- Without Templater, notes are created empty

### Life Tracker Plugin

Both views provide a `getFiles()` interface returning visible daily notes for Life Tracker commands.
