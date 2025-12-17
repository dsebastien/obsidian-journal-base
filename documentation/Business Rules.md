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
