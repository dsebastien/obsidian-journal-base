/**
 * Declares the element-factory helpers that Obsidian installs as GLOBALS but
 * only types as bare ambient functions.
 *
 * `obsidian.d.ts` declares `createEl` / `createDiv` / `createSpan` inside
 * `declare global` as functions, and separately puts `win: Window` on `Node`.
 * At runtime a global in a browser IS a property of its window, and a popout
 * window carries its own copies bound to its own document — which is exactly
 * why `obsidianmd/prefer-create-el` tells you to write `doc.win.createDiv()`.
 * The typings never join those two facts up, so the rule's own suggested fix
 * does not compile against them.
 *
 * This file joins them. It adds no runtime behaviour and asserts nothing that
 * Obsidian does not already provide; it is the popout-correct spelling made
 * type-visible. Without it the only compiling alternatives are the bare global
 * (binds to the MAIN document — wrong in a popout) or a `createElement` call
 * the rule rejects.
 *
 * Note the deliberate difference from the `Node` overloads of the same names:
 * `Node.createEl` APPENDS the new element to the node it is called on, while
 * these window-bound globals return a DETACHED element. Call sites that need a
 * throwaway scratch parent rely on that.
 */
declare global {
    interface Window {
        createEl<K extends keyof HTMLElementTagNameMap>(
            tag: K,
            o?: DomElementInfo | string,
            callback?: (el: HTMLElementTagNameMap[K]) => void
        ): HTMLElementTagNameMap[K]
        createDiv(
            o?: DomElementInfo | string,
            callback?: (el: HTMLDivElement) => void
        ): HTMLDivElement
        createSpan(
            o?: DomElementInfo | string,
            callback?: (el: HTMLSpanElement) => void
        ): HTMLSpanElement
    }
}

export {}
