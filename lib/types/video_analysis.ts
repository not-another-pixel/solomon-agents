import { z } from "zod";

const NA = z.literal("N/A");
const TextOrNA = z.union([z.string().min(1), NA]);
const StringArrayOrNA = z.union([z.array(z.string().min(1)), NA]);

const LeverEntry = z.object({
    whatIsControls: TextOrNA,
    whyImportant: TextOrNA,
    examplesValues: StringArrayOrNA,
});

export const CreativeLeversSchema = z.object({
    videoId: z.string().optional(),

    hook: LeverEntry,
    angle: LeverEntry,
    tone: LeverEntry,
    offerPromise: LeverEntry,
    cta: LeverEntry,
    proofDevice: LeverEntry,
    visualStyle: LeverEntry,
    formatPlacement: LeverEntry,
    narrativeStructure: LeverEntry,
    audiencePersona: LeverEntry,
    painPoint: LeverEntry,
    benefitLadder: LeverEntry,
    urgencyDevice: LeverEntry,
    complianceTone: LeverEntry,
    moodPalette: LeverEntry,
    uspPositioning: LeverEntry,
}).strict();

export type CreativeLevers = z.infer<typeof CreativeLeversSchema>;