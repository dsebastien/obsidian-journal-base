Ultrathink. Make a plan to implement the following Obsidian plugin

## Overview

Create a custom base view type called "Periodic Notes" that shows periodic notes as a timeline with the ability to switch between daily, weekly, monthly, quarterly, and yearly notes, depending on the settings

The Base view should (by default) be in the "Daily Notes" mode, showing all the periodic notes (order defined by the Base sort order) as cards, each containing a standard Obsidian note editor. One column, full width. The first card should be expanded while the other ones should be collapsed.

The other modes (Weekly, Monthly, Quarterly and Yearly) should enable the same for other types of periodic notes.

Modes should only be visible/usable if the corresponding type of periodic note is enabled in the plugin configuration. If none is enabled, then a message should recommend configuring the plugin first.

If no notes are provided by the Obsidian Base, a message should recommend verifying is the Base filters is correct and includes the periodic notes.

Independently of the mode or Base view, if there are holes in the dataset and then cards should be shown with a "Create" button (beautifully styled) that (1) creates the corresponding periodic note (2) applies the corresponding Templater template (3) renders that note if/when the card is expanded

In a second stage, another Base view type should be added: "Periodic Review". That Base view type should show different types of periodic notes side-by-side with [[Andy Matuschak]]'s vertical tabs style (foldable columns). Columns again based on the enabled periodic note types: daily, weekly, monthly, quarterly, yearly (same order for the columns).

In that Base view type:

- the sort order of the Base should be ignored. Instead, the most recent year, month, week & day should be selected
- the dataset should be filtered so that
    - all the available years are listed (only the most recent being selected), but other ones available
    - all the available weeks for the selected year are visible (and no other), and the most recent one being selected
    - all the days for the selected week are visible (and no other), and the most recent one being selected

The goal of the "Periodic Review" Base type is to perform streamline periodic reviews, easily creating and updating periodic notes of different types (e.g., filling in a weekly note based on a set of daily notes, filling-in a monthly note based on ...)

Also, if sections match between different types of periodic notes, it should be possible to quickly/efficiently copy/append content from one type to another (e.g., copy section xxx contents from daily to weekly)

## Settings

The plugin should have settings for:

- Whether daily/weekly/monthly/quarterly/yearly notes are enabled or not (enabled/disabled switch for each)
- The location of the daily, weekly, monthly, quarterly and yearly notes (enabled/visible only if the type is enabled)
- The format (naming convention) for each
- The path of the Templater template for each (also only enabled/visible if the type is enabled)
    - This should use the folder selector available in ../obsidian-starter-kit-plugin
- The folder for each

The plugin should check if the "Periodic notes" plugin is installed and enabled: app.plugins.enabledPlugins.has("periodic-notes")
If the Periodic notes plugin is installed and enabled, then update the configuration based on app.plugins.getPlugin('periodic-notes').settings. Example:

```
{
	...
    "daily": {
        "format": "YYYY/WW/YYYY-MM-DD",
        "template": "50 Resources/54 Templates/Templater/TPL Daily Note.md",
        "folder": "40 Journal/41 Daily Notes/",
        "enabled": true
    },
    "weekly": {
        "format": "YYYY/gggg-[W]ww",
        "template": "50 Resources/54 Templates/Templater/TPL Weekly Note.md",
        "folder": "40 Journal/42 Weekly Notes",
        "enabled": true
    },
    "monthly": {
        "format": "YYYY/YYYY-MM",
        "template": "50 Resources/54 Templates/Templater/TPL Monthly Note.md",
        "folder": "40 Journal/43 Monthly Notes",
        "enabled": true
    },
    "quarterly": {
        "format": "YYYY/YYYY-[Q]Q",
        "template": "50 Resources/54 Templates/Templater/TPL Quarterly Note.md",
        "folder": "40 Journal/44 Quarterly Notes",
        "enabled": true
    },
    "yearly": {
        "format": "YYYY",
        "template": "50 Resources/54 Templates/Templater/TPL Yearly Note.md",
        "folder": "40 Journal/45 Yearly Notes",
        "enabled": true
    }
}
```

Name our settings according to the above.

If the periodic notes plugin is installed and enabled, then make sure settings above read-only at state that they should configure those in the periodic notes plugin configuration.

If the periodic notes plugin is not installed or enabled, keep the settings as is and make those editable.

The check for periodic-notes and configuration synchronization should be done each time the plugin starts. Also, add a listener so that we remain aligned with the configuration of that plugin. It does this to let other plugins know: `this.app.workspace.trigger("periodic-notes:settings-updated");`

At startup, the plugin should also check if Templater is installed and enabled: app.plugins.enabledPlugins.has("templater-obsidian"). If not, a notice should be shown, static that it is missing

The plugin should also have specific configuration options for each Base view type (part of the Base view configuration (i.e., specific to each Base file)

## References
- https://github.com/liamcain/obsidian-periodic-notes
- https://github.com/SilentVoid13/Templater
