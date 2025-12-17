import type { TFile } from 'obsidian'

/**
 * Interface for compatibility with the Life Tracker plugin
 * Allows views to provide files for Life Tracker commands
 */
export interface LifeTrackerPluginFileProvider {
    /**
     * Get files from this view for commands.
     * If cards are being edited, those are returned.
     * Otherwise returns all the current Base view files.
     */
    getFiles(): TFile[]

    /**
     * Get the filter mode for Life Tracker
     */
    getFilterMode(): 'never'
}
