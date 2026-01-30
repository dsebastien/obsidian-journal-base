# Release Notes

## 1.7.1 (2026-01-25)

### Bug Fixes

- **all:** fix lint issues and fixed bug with checked status in periodic review

## 1.7.0 (2026-01-06)

### Features

- **all:** periodic review columns now always use as much space as possible and adjust

## 1.6.0 (2025-12-25)

### Features

- **all:** added previous/next buttons to navigate between periodic notes
- **all:** improved the selection behavior for periods that span two larger periods
- **all:** show to done button in the card headers in the periodic review view

## 1.5.0 (2025-12-24)

### Features

- **all:** add support for saving the done status for periodic reviews
- **all:** save done status for periodic reviews in a note property

## 1.4.0 (2025-12-22)

### Features

- **all:** improved editor save/updates

## 1.3.0 (2025-12-20)

### Features

- **all:** adapt columns content when a periodic note type is enabled or disabled

## 1.2.0 (2025-12-20)

### Features

- **all:** made the base views fully responsive

## 1.1.0 (2025-12-19)

### Features

- **all:** adapt the column width dynamically when the periodic review column width setting is changed
- **all:** enforce edit mode within the periodic review view (faster)
- **all:** first set of performance improvements to the periodic review base view
- **all:** improved periodic review entries styling to avoid confusion
- **all:** made all file containers in the periodic review view the same height for uniformity

## 1.0.0 (2025-12-18)

### Features

- **all:** ensured that notes are directly created where they belong (according to config)

## 0.5.0 (2025-12-18)

### Features

- **all:** improve Life Tracker plugin support in all views (pass daily notes)

## 0.4.0 (2025-12-18)

### Features

- **all:** also handle read-only editor updates gracefully when files change
- **all:** better handle file updates while the editor is opened
- **all:** use the same editor in the periodic review view as in the periodic notes view

## 0.3.0 (2025-12-18)

### Features

- **all:** always display week numbers with two digits
- **all:** better handled weeks that overlap two years
- **all:** highlight the current periods
- **all:** highlight the current periods in the periodic notes view as well

### Bug Fixes

- **all:** avoid changing the year when selecting a day from a different year (overlaps)

## 0.2.0 (2025-12-18)

### Features

- **all:** display future future yearly notes
- **all:** enabled creating the next non-existent yearly note

## 0.1.0 (2025-12-18)

### Features

- **all:** improved the create button look and feel
- **all:** keep the current selection after creating a new periodic note

## 0.0.2 (2025-12-18)

### Features

- **all:** adapt to plugin setting changes
- **all:** display minimized column names
- **all:** improved behavior when certain periodic note types are disabled

## 0.0.1 (2025-12-18)

### Features

- **all:** added compatibility with the Life Tracker plugin's command (expose files)
- **all:** added Custom Base View Type Expert prompt and rule
- **all:** always keep the notes sorted from most recent (or farther in the future) to oldest
- **all:** better format display names for the different periods in periodic reviews
- **all:** better handle and display periodic notes in the Periodic Notes base view
- **all:** better order periodic notes
- **all:** better recognized existing periodic notes
- **all:** block input while creating and show a loading indicator
- **all:** configured plugin base
- **all:** enable editing notes directly within the base in addition to the ability to open those in a new tab
- **all:** fixed columns collapse/expand and made the corresponding UI nicer
- **all:** highlight the current period for each type (whether it exists or not)
- **all:** improved conversion handling from moment.js to date-fns
- **all:** improved rendering
- **all:** improved week handling (ISO 8601 week-numbering)
- **all:** initial version (wip)
- **all:** open notes in new tab
- **all:** show one period ahead by default
- **all:** show the currently active periodic note type and disable the corresponding button
- **all:** simplified periodic reviews Base and settings
- **all:** watch the periodic-notes plugin state. Sync when enabled. Make settings editable when disabled

### Bug Fixes

- **all:** if periodic-notes is not available on startup, the existing settings are kept
