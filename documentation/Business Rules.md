# Business Rules

This document defines the core business rules. These rules MUST be respected in all implementations unless explicitly approved otherwise.

---

## Documentation Guidelines

When a new business rule is mentioned:

1. Add it to this document immediately
2. Use a concise format (single line or brief paragraph)
3. Maintain precision - do not lose important details for brevity
4. Include rationale where it adds clarity

---

## UI State Preservation

### Card State Preservation on Data Updates

When new data is received from Obsidian Base:

- Existing cards must not be destroyed and recreated; instead, they should be refreshed if needed
- The expanded/collapsed state of cards must be preserved
- The editor mode (view/edit/source) of cards must be preserved
- If a card has an active/focused editor, it must not be refreshed (the data update was likely triggered by that editor's save operation)
- Cards should only be removed if their corresponding file is no longer in the data set

## Periodic Notes Sorting

The periodic notes base view ALWAYS sorts and renders data from most recent (or farther in the future) to oldest (farther in the past). The sort order configured in the Base is fully ignored. The `getFiles` method returns data in the same order (newest to oldest).

## Disabled Period Types Filtering

When a period type is disabled (e.g., yearly notes), it must be ignored for filtering purposes:

- **Period generation**: Child period types show expanded ranges when their parent is disabled. For example, if yearly is disabled, the quarterly column shows quarters across multiple years (not limited to the current year).
- **Context inheritance**: When a user selects a period at an enabled level (e.g., 2025-Q4), this implicitly determines parent values (year 2025). Child columns filter based on the enabled parent's selection, not the disabled one.
- **Cascading behavior**: Only enabled period types influence filtering. If yearly is disabled but quarterly is enabled and a quarter is selected, months are filtered by that quarter (which includes the year). If both yearly and quarterly are disabled, months span a broader range.
