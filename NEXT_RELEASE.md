This release fixes a memory leak in the Periodic Review and Periodic Notes views, and it makes both views faster.

### Fixed

- The note editors inside both views now close when you change period, switch a card's mode (reading, live preview, source) or close the view. Before, they stayed active until Obsidian restarted. Memory use kept growing, and Obsidian could freeze for seconds, mostly in vaults with large periodic notes and many plugins (#55).
- A view no longer rebuilds itself in the background right after you close it.
- A card no longer saves a note you did not edit, for example when you only switch its mode. Plugins that watch file changes get less useless work.

### Faster

- Both views do much less work when a periodic note changes. With more than 2,000 periodic notes, a Periodic Review update takes a fraction of the time it took before.
- Period lists and cards are no longer rebuilt when nothing changed. The period list also stops jumping back to the selected period while you read it.

No setting changed. Restart Obsidian once after the update to clear the editors that an older version left behind.
