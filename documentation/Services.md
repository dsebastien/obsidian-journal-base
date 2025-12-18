# Services

Services in `src/app/services/`.

## NoteCreationService

`note-creation.service.ts` - Creates periodic note files.

### Constructor

```typescript
constructor(app: App)
```

### Methods

#### createPeriodicNote

```typescript
async createPeriodicNote(
    date: Date,
    config: PeriodicNoteConfig,
    periodType: PeriodType
): Promise<TFile | null>
```

Creates a note for the given date. Uses Templater if configured, otherwise creates empty file.

**Behavior**:

1. Normalize date to period start
2. Format filename using config format
3. Check if file exists (return existing if so)
4. Ensure folder structure exists
5. Apply template via Templater OR create empty file
6. Show notice on success/failure

#### openPeriodicNote

```typescript
async openPeriodicNote(file: TFile, newLeaf?: boolean): Promise<void>
```

Opens file in workspace (current leaf or new tab).

#### createAndOpenPeriodicNote

```typescript
async createAndOpenPeriodicNote(
    date: Date,
    config: PeriodicNoteConfig,
    periodType: PeriodType,
    newLeaf?: boolean
): Promise<TFile | null>
```

Creates and immediately opens a periodic note.

---

## PluginIntegrationService

`plugin-integration.service.ts` - Integrates with external plugins.

### Constructor

```typescript
constructor(app: App)
```

### Periodic Notes Plugin Integration

#### isPeriodicNotesPluginEnabled

```typescript
isPeriodicNotesPluginEnabled(): boolean
```

Checks if `periodic-notes` plugin is enabled.

#### syncFromPeriodicNotesPlugin

```typescript
syncFromPeriodicNotesPlugin(): Partial<PluginSettings> | null
```

Reads and validates settings from Periodic Notes plugin. Uses Zod schema validation.

#### subscribeToPeriodicNotesChanges

```typescript
subscribeToPeriodicNotesChanges(callback: () => void): void
```

Listens for `periodic-notes:settings-updated` event.

#### subscribeToPeriodicNotesPluginState

```typescript
subscribeToPeriodicNotesPluginState(
    onEnabled: () => void,
    onDisabled: () => void
): void
```

Polls for plugin enable/disable state (1s interval).

### Templater Plugin Integration

#### isTemplaterEnabled

```typescript
isTemplaterEnabled(): boolean
```

Checks if `templater-obsidian` plugin is enabled.

#### createFileFromTemplate

```typescript
async createFileFromTemplate(
    templatePath: string,
    targetFolder: string,
    filename: string
): Promise<TFile | null>
```

Creates file using Templater's `create_new_note_from_template()`.

#### applyTemplateToFile

```typescript
async applyTemplateToFile(templatePath: string, targetFile: TFile): Promise<boolean>
```

Applies template to existing file using Templater's `write_template_to_file()`.

---

## EmbeddableEditorService

`embeddable-editor.service.ts` - Creates inline markdown editors.

### EmbeddableEditor

Wraps Obsidian's internal ScrollableMarkdownEditor.

#### Constructor

```typescript
constructor(
    app: App,
    containerEl: HTMLElement,
    options?: {
        initialContent?: string
        file?: TFile | null
        mode?: 'source' | 'preview'
        placeholder?: string
        onChange?: (content: string) => void
        onBlur?: () => void
        onEnter?: () => boolean | void
        onEscape?: () => void
    }
)
```

#### Key Methods

| Method            | Description                          |
| ----------------- | ------------------------------------ |
| `getValue()`      | Get editor content                   |
| `setValue()`      | Set editor content                   |
| `focus()`         | Focus the editor                     |
| `hasFocus()`      | Check if editor has focus            |
| `setMode()`       | Switch source/preview mode           |
| `getEditorView()` | Get underlying CodeMirror EditorView |

#### Implementation Notes

Uses internal Obsidian API (may break in future versions):

1. Resolves `ScrollableMarkdownEditor` prototype via `app.embedRegistry`
2. Creates mock `MarkdownView` owner for context
3. Registers keyboard scope for Escape/Enter handling
4. Patches `onUpdate` for change detection

---

## EmbeddableEditorService Factory

```typescript
class EmbeddableEditorService {
    constructor(app: App)

    createEditor(containerEl: HTMLElement, options?: EmbeddableEditorOptions): EmbeddableEditor
    warmCache(): void // Pre-warm prototype cache on plugin load
}
```
