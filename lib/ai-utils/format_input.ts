import { CreativeLevers } from "../types/video_analysis";

export function formatLeversForPrompt(levers: CreativeLevers) {
    const leverSummary: Record<string, string> = {};

    const leverKeys = [
        'hook', 'angle', 'tone', 'offerPromise', 'cta',
        'proofDevice', 'visualStyle', 'formatPlacement',
        'narrativeStructure', 'audiencePersona', 'painPoint',
        'benefitLadder', 'urgencyDevice', 'complianceTone',
        'moodPalette', 'uspPositioning'
    ] as const;

    for (const key of leverKeys) {
        const lever = levers[key];
        if (lever.examplesValues !== "N/A" && Array.isArray(lever.examplesValues)) {
            const readableName = key.replace(/([A-Z])/g, ' $1').trim();
            leverSummary[readableName] = lever.examplesValues.join(', ');
        }
    }

    return leverSummary;
}


