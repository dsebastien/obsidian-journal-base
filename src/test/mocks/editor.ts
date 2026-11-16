import { TFile, type App } from 'obsidian'
import { EditorState, type TransactionSpec } from '@codemirror/state'
import { codeFolding } from '@codemirror/language'

/**
 * Test doubles for the DOM and for Obsidian's internal markdown editor.
 * Bun's test environment has no DOM, and the real editor only exists inside
 * the app. These fakes keep just what the lifecycle specs observe.
 */

type Listener = (event: unknown) => void

export class FakeElement {
    children: FakeElement[] = []
    listeners = new Map<string, Set<Listener>>()
    disabled = false
    classList = {
        toggle: (): boolean => false,
        add: (): void => undefined,
        remove: (): void => undefined
    }

    private createChild(): FakeElement {
        const child = new FakeElement()
        this.children.push(child)
        return child
    }

    createDiv(): FakeElement {
        return this.createChild()
    }

    createSpan(): FakeElement {
        return this.createChild()
    }

    createEl(): FakeElement {
        return this.createChild()
    }

    empty(): void {
        this.children = []
    }

    addClass(): void {}

    setAttribute(): void {}

    contains(): boolean {
        return false
    }

    get lastElementChild(): FakeElement | null {
        return this.children[this.children.length - 1] ?? null
    }

    addEventListener(type: string, listener: Listener): void {
        let listeners = this.listeners.get(type)
        if (!listeners) {
            listeners = new Set()
            this.listeners.set(type, listeners)
        }
        listeners.add(listener)
    }

    removeEventListener(type: string, listener: Listener): void {
        this.listeners.get(type)?.delete(listener)
    }

    listenerCount(): number {
        let count = 0
        for (const listeners of this.listeners.values()) count += listeners.size
        return count
    }

    /** Call the listeners of an event type, as the browser would. */
    emit(type: string): void {
        for (const listener of [...(this.listeners.get(type) ?? [])]) {
            listener({ stopPropagation: (): void => undefined })
        }
    }

    asHTMLElement(): HTMLElement {
        return this as unknown as HTMLElement
    }
}

/**
 * Stands in for Obsidian's internal `ScrollableMarkdownEditor`.
 * `instances` lists every editor the code under test created.
 */
export class FakeMarkdownEditor {
    static instances: FakeMarkdownEditor[] = []

    destroyCount = 0
    dispatched: TransactionSpec[] = []
    focused = false
    editor = {
        blur: (): void => undefined,
        focus: (): void => undefined,
        hasFocus: (): boolean => this.focused
    }
    /**
     * A real CodeMirror state (it needs no DOM), with the fold state that
     * Obsidian's editors have. `dispatch` applies the transaction to it.
     */
    cm = {
        contentDOM: new FakeElement(),
        scrollDOM: { scrollTop: 0 },
        state: FakeMarkdownEditor.createState(''),
        dispatch: (spec: TransactionSpec): void => {
            this.dispatched.push(spec)
            this.cm.state = this.cm.state.update(spec).state
        }
    }

    private static createState(content: string): EditorState {
        return EditorState.create({ doc: content, extensions: [codeFolding()] })
    }

    get content(): string {
        return this.cm.state.doc.toString()
    }

    /** Replace the document, as a user edit would. */
    set content(content: string) {
        this.cm.state = FakeMarkdownEditor.createState(content)
    }

    constructor(
        public app: unknown,
        public containerEl: unknown,
        public owner: unknown
    ) {
        FakeMarkdownEditor.instances.push(this)
    }

    set(content: string): void {
        this.content = content
    }

    get(): string {
        return this.content
    }

    /** The real editor reports every CodeMirror update through this method. */
    onUpdate(_update: unknown, _changed: boolean): void {}

    destroy(): void {
        this.destroyCount++
    }

    get isDestroyed(): boolean {
        return this.destroyCount > 0
    }
}

/**
 * The edit mode of the temporary embed that `resolveEditorPrototype` creates.
 * The service walks two prototypes up from an instance of this class, which
 * leads to `FakeMarkdownEditor`.
 */
class ProbeEditMode extends FakeMarkdownEditor {}

export interface FakeAppHandle {
    app: App
    /** Edit modes of the temporary embeds created to find the editor class. */
    probes: FakeMarkdownEditor[]
    probeUnloadCount: () => number
    workspace: { activeEditor: unknown }
    scopeStack: unknown[]
    /** Content written through `vault.modify`, in order. */
    saved: string[]
    /** Resolve the pending `vault.cachedRead` calls with this content. */
    resolveReads: (content: string) => void
    pendingReadCount: () => number
}

/**
 * A fake `App` with the parts the embedded editor and the note card use.
 * `vault.cachedRead` stays pending until `resolveReads()` is called, so a spec
 * controls what happens while a note is read.
 */
export function createFakeApp(): FakeAppHandle {
    const probes: FakeMarkdownEditor[] = []
    let probeUnloads = 0
    const workspace: { activeEditor: unknown } = { activeEditor: null }
    const scopeStack: unknown[] = []
    const saved: string[] = []
    let pendingReads: Array<(content: string) => void> = []

    const app = {
        scope: {},
        keymap: {
            pushScope: (scope: unknown): void => {
                scopeStack.push(scope)
            },
            popScope: (scope: unknown): void => {
                const index = scopeStack.indexOf(scope)
                if (index !== -1) scopeStack.splice(index, 1)
            }
        },
        workspace,
        plugins: {
            enabledPlugins: new Set<string>(),
            getPlugin: (): null => null
        },
        vault: {
            cachedRead: (): Promise<string> =>
                new Promise<string>((resolve) => {
                    pendingReads.push(resolve)
                }),
            modify: (_file: unknown, content: string): Promise<void> => {
                saved.push(content)
                return Promise.resolve()
            }
        },
        embedRegistry: {
            embedByExtension: {
                md: (): unknown => {
                    const widget = {
                        editable: false,
                        editMode: undefined as FakeMarkdownEditor | undefined,
                        showEditor(): void {
                            const probe = new ProbeEditMode(null, null, null)
                            // A probe is not an editor of the code under test
                            FakeMarkdownEditor.instances.pop()
                            probes.push(probe)
                            widget.editMode = probe
                        },
                        unload(): void {
                            // As in Obsidian: unload() of a component that was
                            // never loaded destroys nothing.
                            probeUnloads++
                        }
                    }
                    return widget
                }
            }
        }
    }

    return {
        app: app as unknown as App,
        probes,
        probeUnloadCount: () => probeUnloads,
        workspace,
        scopeStack,
        saved,
        resolveReads: (content: string): void => {
            const reads = pendingReads
            pendingReads = []
            for (const resolve of reads) resolve(content)
        },
        pendingReadCount: () => pendingReads.length
    }
}

/** `activeDocument` is an Obsidian global: the document of the active window. */
export function installFakeActiveDocument(): void {
    const scope = window as unknown as { activeDocument: unknown }
    scope.activeDocument = { win: { createDiv: (): FakeElement => new FakeElement() } }
}

export function createFakeFile(path: string): TFile {
    const name = path.split('/').pop() ?? path
    return Object.assign(new TFile(), {
        path,
        name,
        basename: name.replace(/\.md$/, ''),
        extension: 'md'
    })
}

/** Let pending promise callbacks run. */
export async function flushPromises(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve()
    }
}
