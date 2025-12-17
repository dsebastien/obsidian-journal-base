import { z } from 'zod'

const periodicNotesPeriodSettingsSchema = z.object({
    enabled: z.boolean(),
    folder: z.string(),
    format: z.string(),
    template: z.string()
})

export const periodicNotesPluginSettingsSchema = z.object({
    daily: periodicNotesPeriodSettingsSchema,
    weekly: periodicNotesPeriodSettingsSchema,
    monthly: periodicNotesPeriodSettingsSchema,
    quarterly: periodicNotesPeriodSettingsSchema,
    yearly: periodicNotesPeriodSettingsSchema
})

export type PeriodicNotesPeriodSettings = z.infer<typeof periodicNotesPeriodSettingsSchema>
export type PeriodicNotesPluginSettings = z.infer<typeof periodicNotesPluginSettingsSchema>
