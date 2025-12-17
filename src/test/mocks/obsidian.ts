// Mock obsidian module for testing
export class Notice {
    constructor(_message: string, _duration?: number) {}
}

export class App {}
export class TFile {
    path: string = ''
    name: string = ''
    basename: string = ''
    extension: string = ''
}
export class Plugin {}
export type EventRef = { id: string }
