import { App, Component, TFile, Scope } from 'obsidian'
import { EditorView } from '@codemirror/view'
import { EditorSelection, type SelectionRange } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { log } from '../../utils/log'

/**
 * Represents the complete state of an editor for preservation during updates.
 * Includes cursor position, selection ranges, and scroll position.
 */
export interface EditorState {
    /** Main cursor position (character offset from document start) */
    cursorPos: number
    /** All selection ranges (supports multiple cursors) */
    selections: readonly SelectionRange[]
    /** Scroll position (top offset in pixels) */
    scrollTop: number
    /** Document length at time of capture (for validation) */
    docLength: number
}

/**
 * Type definitions for internal Obsidian APIs used for embedded editors.
 * These are not part of the public API and may change in future versions.
 */

interface WidgetEditorView {
    editable: boolean
    editMode?: ScrollableMarkdownEditor
    showEditor(): void
    unload(): void
}

interface EmbedRegistry {
    embedByExtension: {
        md: (
            context: { app: App; containerEl: HTMLElement },
            file: TFile | null,
            subpath: string
        ) => WidgetEditorView
    }
}

interface ScrollableMarkdownEditor {
    app: App
    containerEl: HTMLElement
    editor: ObsidianEditor
    editMode: ScrollableMarkdownEditor
    owner: MarkdownViewMock
    scope: Scope
    editorEl: HTMLElement
    cm: EditorView

    set(content: string, clear: boolean): void
    get(): string
    clear(): void
    destroy(): void
    onUpdate(update: unknown, changed: boolean): void
    buildLocalExtensions(): Extension[]
}

interface ObsidianEditor {
    cm: EditorView
    getValue(): string
    setValue(content: string): void
    focus(): void
    blur(): void
    hasFocus(): boolean
}

interface MarkdownViewMock {
    app: App
    file: TFile | null
    editor?: ObsidianEditor
    editMode?: ScrollableMarkdownEditor
    getMode(): 'source' | 'preview'
    onMarkdownScroll(): void
}

type ScrollableMarkdownEditorConstructor = new (
    app: App,
    containerEl: HTMLElement,
    owner: MarkdownViewMock
) => ScrollableMarkdownEditor

// Cache the resolved prototype to avoid repeated lookups
let cachedEditorPrototype: ScrollableMarkdownEditorConstructor | null = null

/**
 * Resolves the internal ScrollableMarkdownEditor prototype from Obsidian's embed registry.
 * This is an internal API and may break in future Obsidian versions.
 */
function resolveEditorPrototype(app: App): ScrollableMarkdownEditorConstructor {
    if (cachedEditorPrototype) {
        return cachedEditorPrototype
    }

    // Access the internal embed registry
    // @ts-ignore - Internal API
    const embedRegistry = app.embedRegistry as EmbedRegistry

    // Create a temporary widget editor to extract the prototype
    const tempContainer = document.createElement('div')
    const widgetEditorView = embedRegistry.embedByExtension.md(
        { app, containerEl: tempContainer },
        null as unknown as TFile,
        ''
    )

    // Enable editing and show the editor to initialize editMode
    widgetEditorView.editable = true
    widgetEditorView.showEditor()

    // Navigate the prototype chain to get the ScrollableMarkdownEditor constructor
    const editMode = widgetEditorView.editMode
    if (!editMode) {
        widgetEditorView.unload()
        throw new Error('Failed to resolve editor prototype: editMode is undefined')
    }

    const MarkdownEditorPrototype = Object.getPrototypeOf(Object.getPrototypeOf(editMode))
    cachedEditorPrototype =
        MarkdownEditorPrototype.constructor as ScrollableMarkdownEditorConstructor

    // Clean up the temporary instance
    widgetEditorView.unload()

    return cachedEditorPrototype
}

export type EditorMode = 'source' | 'preview'

export interface EmbeddableEditorOptions {
    /** Initial content */
    initialContent?: string
    /** File associated with this editor (for link resolution) */
    file?: TFile | null
    /** Editor mode: 'source' for raw markdown, 'preview' for live preview */
    mode?: EditorMode
    /** Placeholder text when empty */
    placeholder?: string
    /** Called when content changes */
    onChange?: (content: string) => void
    /** Called when editor loses focus */
    onBlur?: () => void
    /** Called when Enter is pressed (without modifiers) */
    onEnter?: () => boolean | void
    /** Called when Escape is pressed */
    onEscape?: () => void
}

/**
 * An embeddable markdown editor that uses Obsidian's internal editor.
 * Provides full Obsidian editor functionality including live preview.
 *
 * Based on Fevol's embeddable editor pattern:
 * https://gist.github.com/Fevol/caa478ce303e69eabede7b12b2323838
 */
export class EmbeddableEditor extends Component {
    private editor!: ScrollableMarkdownEditor
    private scope: Scope
    private file: TFile | null
    private mode: EditorMode
    private onChange?: (content: string) => void
    private onBlur?: () => void
    private onEnter?: () => boolean | void
    private onEscape?: () => void
    private isDestroyed = false
    /** Flag to prevent onChange from firing during external content updates */
    private isUpdatingExternally = false

    constructor(
        private app: App,
        private containerEl: HTMLElement,
        options: EmbeddableEditorOptions = {}
    ) {
        super()

        this.file = options.file ?? null
        this.mode = options.mode ?? 'source'
        this.onChange = options.onChange
        this.onBlur = options.onBlur
        this.onEnter = options.onEnter
        this.onEscape = options.onEscape
        this.scope = new Scope(this.app.scope)

        this.initEditor(options.initialContent ?? '', options.placeholder)
    }

    private initEditor(initialContent: string, placeholder?: string): void {
        const EditorConstructor = resolveEditorPrototype(this.app)

        // Create a mock MarkdownView owner
        const owner: MarkdownViewMock = {
            app: this.app,
            file: this.file,
            getMode: () => this.mode,
            onMarkdownScroll: () => {}
        }

        // Create the editor instance
        // @ts-ignore - Using internal constructor
        this.editor = new EditorConstructor(this.app, this.containerEl, owner)

        // Set up the mock references for command compatibility
        owner.editMode = this.editor
        owner.editor = this.editor.editor

        // Set initial content
        if (initialContent) {
            this.editor.set(initialContent, true)
        }

        // Set up event handlers
        this.setupEventHandlers()

        // Add placeholder if specified
        if (placeholder) {
            this.addPlaceholder(placeholder)
        }
    }

    private setupEventHandlers(): void {
        const editorView = this.editor.cm

        // Handle focus events
        this.registerDomEvent(editorView.contentDOM, 'focusin', () => {
            this.app.keymap.pushScope(this.scope)
            // @ts-ignore - Internal API
            this.app.workspace.activeEditor = this.editor.owner
        })

        this.registerDomEvent(editorView.contentDOM, 'blur', () => {
            this.app.keymap.popScope(this.scope)
            this.onBlur?.()
        })

        // Set up keyboard handlers
        this.scope.register([], 'Escape', () => {
            this.onEscape?.()
            this.editor.editor.blur()
            return false
        })

        this.scope.register([], 'Enter', () => {
            if (this.onEnter) {
                const result = this.onEnter()
                if (result === true) {
                    return false // Prevent default
                }
            }
            return true // Allow default Enter behavior
        })

        // Listen for content changes
        // The editor dispatches updates through CodeMirror
        const originalOnUpdate = this.editor.onUpdate.bind(this.editor)
        this.editor.onUpdate = (update: unknown, changed: boolean) => {
            originalOnUpdate(update, changed)
            // Only fire onChange for user-initiated changes, not external updates
            if (changed && this.onChange && !this.isUpdatingExternally) {
                this.onChange(this.getValue())
            }
        }
    }

    private addPlaceholder(_placeholder: string): void {
        // Placeholder is handled by CodeMirror extensions
        // Would need to add via buildLocalExtensions override
        // For now, this is a no-op
    }

    /**
     * Get the current content of the editor
     */
    getValue(): string {
        return this.editor.get()
    }

    /**
     * Set the content of the editor
     */
    setValue(content: string): void {
        this.editor.set(content, false)
    }

    /**
     * Focus the editor
     */
    focus(): void {
        this.editor.editor.focus()
    }

    /**
     * Check if the editor has focus
     */
    hasFocus(): boolean {
        return this.editor.editor.hasFocus()
    }

    /**
     * Set cursor position
     */
    setCursor(position: { line: number; ch: number }): void {
        const editorView = this.editor.cm
        const doc = editorView.state.doc
        const lineInfo = doc.line(position.line + 1) // CodeMirror lines are 1-indexed
        const pos = lineInfo.from + position.ch
        editorView.dispatch({
            selection: EditorSelection.cursor(pos)
        })
    }

    /**
     * Get the underlying CodeMirror EditorView
     */
    getEditorView(): EditorView {
        return this.editor.cm
    }

    /**
     * Change the editor mode
     */
    setMode(mode: EditorMode): void {
        this.mode = mode
        // The mode affects how the editor renders content
        // For live preview vs source mode
    }

    /**
     * Get the current editor mode
     */
    getMode(): EditorMode {
        return this.mode
    }

    /**
     * Capture the current editor state (cursor, selection, scroll).
     * Use this before making changes to restore state afterward.
     */
    getState(): EditorState {
        const editorView = this.editor.cm
        const state = editorView.state
        return {
            cursorPos: state.selection.main.head,
            selections: state.selection.ranges,
            scrollTop: editorView.scrollDOM.scrollTop,
            docLength: state.doc.length
        }
    }

    /**
     * Restore editor state (cursor, selection, scroll).
     * Clamps positions to valid ranges for the current document.
     */
    restoreState(savedState: EditorState): void {
        const editorView = this.editor.cm
        const doc = editorView.state.doc
        const maxPos = doc.length

        // Clamp positions to valid range
        const clamp = (pos: number): number => Math.max(0, Math.min(pos, maxPos))

        // Restore selection with clamped positions
        const newRanges = savedState.selections.map((range) =>
            EditorSelection.range(clamp(range.anchor), clamp(range.head))
        )

        if (newRanges.length > 0) {
            editorView.dispatch({
                selection: EditorSelection.create(newRanges, 0)
            })
        }

        // Restore scroll position
        editorView.scrollDOM.scrollTop = savedState.scrollTop
    }

    /**
     * Update content while preserving cursor position relative to surrounding text.
     * Uses a smart algorithm to find the best cursor position after the update.
     *
     * @param newContent - The new content to set
     * @returns true if content was updated, false if content was identical
     */
    setValuePreservingState(newContent: string): boolean {
        const currentContent = this.getValue()
        if (currentContent === newContent) {
            return false // No change needed
        }

        const editorView = this.editor.cm
        const savedState = this.getState()

        // Set flag to prevent onChange from firing
        this.isUpdatingExternally = true

        try {
            // Calculate the new cursor position based on content changes
            const newCursorPos = this.calculateNewCursorPosition(
                currentContent,
                newContent,
                savedState.cursorPos
            )

            // Replace entire document content
            editorView.dispatch({
                changes: {
                    from: 0,
                    to: currentContent.length,
                    insert: newContent
                },
                selection: EditorSelection.cursor(Math.min(newCursorPos, newContent.length))
            })

            // Restore scroll position
            editorView.scrollDOM.scrollTop = savedState.scrollTop

            return true
        } finally {
            this.isUpdatingExternally = false
        }
    }

    /**
     * Calculate the best cursor position after content changes.
     * Tries to maintain cursor position relative to surrounding context.
     */
    private calculateNewCursorPosition(
        oldContent: string,
        newContent: string,
        oldCursorPos: number
    ): number {
        // If cursor was at the end, keep it at the end
        if (oldCursorPos >= oldContent.length) {
            return newContent.length
        }

        // If cursor was at the beginning, keep it at the beginning
        if (oldCursorPos === 0) {
            return 0
        }

        // Try to find the cursor position based on context
        // Get text before and after cursor in old content
        const contextSize = 20
        const textBefore = oldContent.slice(Math.max(0, oldCursorPos - contextSize), oldCursorPos)
        const textAfter = oldContent.slice(oldCursorPos, oldCursorPos + contextSize)

        // Try to find the same context in new content
        if (textBefore.length > 0) {
            // Search for the context before cursor
            const searchStart = Math.max(0, oldCursorPos - contextSize - 50)
            const searchEnd = Math.min(newContent.length, oldCursorPos + contextSize + 50)
            const searchArea = newContent.slice(searchStart, searchEnd)
            const contextIndex = searchArea.lastIndexOf(textBefore)

            if (contextIndex !== -1) {
                const newPos = searchStart + contextIndex + textBefore.length
                // Verify the text after also matches (if possible)
                if (
                    textAfter.length === 0 ||
                    newContent.slice(newPos, newPos + textAfter.length) === textAfter
                ) {
                    return newPos
                }
            }
        }

        // Fallback: use the same absolute position, clamped
        return Math.min(oldCursorPos, newContent.length)
    }

    /**
     * Check if an external update is currently in progress.
     * Useful for components to know if they should ignore change events.
     */
    isExternalUpdateInProgress(): boolean {
        return this.isUpdatingExternally
    }

    override onunload(): void {
        if (this.isDestroyed) return
        this.isDestroyed = true

        // Clean up scope
        this.app.keymap.popScope(this.scope)

        // Destroy the editor
        if (this.editor) {
            this.editor.destroy()
        }
    }
}

/**
 * Service for creating embeddable editors in custom views
 */
export class EmbeddableEditorService {
    constructor(private app: App) {}

    /**
     * Create an embeddable editor in the specified container
     */
    createEditor(
        containerEl: HTMLElement,
        options: EmbeddableEditorOptions = {}
    ): EmbeddableEditor {
        return new EmbeddableEditor(this.app, containerEl, options)
    }

    /**
     * Pre-warm the editor prototype cache
     * Call this during plugin load to avoid delay on first editor creation
     */
    warmCache(): void {
        try {
            resolveEditorPrototype(this.app)
        } catch (error) {
            log('Failed to warm editor prototype cache:', 'warn', error)
        }
    }
}
