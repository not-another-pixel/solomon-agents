import { openai } from "@ai-sdk/openai";
import { CreativeLevers } from "../types/video_analysis";
import { formatLeversForPrompt } from "./format_input";
import { generateText } from "ai";
import { REPORT_PROMPT } from "../../src/mastra/prompts/report-agent";


const SYSTEM_PROMPT = REPORT_PROMPT;
export async function generateCreativeReport(input: {
    period?: string;
    preparedAt?: string;
    topAds?: Array<{
        name: string;
        id: string;
        thumb_stop_rate?: number;
        call_to_action?: string;
        copy: string;
        ctr?: number;
        conversion_value?: number;
        spend?: number;
        levers: CreativeLevers;
    }>;
    lowAds?: Array<{
        name: string;
        id: string;
        thumb_stop_rate?: number;
        copy: string;
        call_to_action?: string;
        ctr?: number;
        conversion_value?: number;
        spend?: number;
        levers: CreativeLevers;
    }>;
    globalFindings?: string[];
}) {
    console.log('Generating report with input:', input);
    const enrichedTopAds = input.topAds?.map(ad => ({
        name: ad.name,
        id: ad.id,
        copy: ad.copy,
        thumb_stop_rate: ad.thumb_stop_rate ? `${(ad.thumb_stop_rate * 100).toFixed(1)}%` : undefined,
        call_to_action: ad.call_to_action,
        ctr: ad.ctr ? `${(ad.ctr * 100).toFixed(2)}%` : undefined,
        conversion_value: ad.conversion_value ? `${ad.conversion_value.toFixed(1)}x` : undefined,
        spend: ad.spend ? `$${ad.spend.toLocaleString()}` : undefined,
        creativeLeversSummary: formatLeversForPrompt(ad.levers),
    }));


    const enrichedLowAds = input.lowAds?.map(ad => ({
        name: ad.name,
        id: ad.id,
        call_to_action: ad.call_to_action,
        thumb_stop_rate: ad.thumb_stop_rate ? `${(ad.thumb_stop_rate * 100).toFixed(1)}%` : undefined,
        copy: ad.copy,
        ctr: ad.ctr ? `${(ad.ctr * 100).toFixed(2)}%` : undefined,
        conversion_value: ad.conversion_value ? `${ad.conversion_value.toFixed(1)}x` : undefined,
        spend: ad.spend ? `$${ad.spend.toLocaleString()}` : undefined,
        creativeLeversSummary: formatLeversForPrompt(ad.levers),
    }));
    console.log(enrichedLowAds, enrichedTopAds);

    try {
        const { text } = await generateText({
            model: openai("o3-mini"), // Use gpt-4o em vez de o3-mini para melhor compatibilidade
            temperature: 0,
            providerOptions: {
                openai: {
                    reasoning: "medium"
                }
            },
            system: SYSTEM_PROMPT,
            messages: [
                {
                    role: "user",
                    content: `Gere um relatório de performance criativa com os dados abaixo.

DADOS:
${JSON.stringify({
                        periodo: input.period || "Último mês",
                        preparadoEm: input.preparedAt || new Date().toISOString(),
                        topPerformers: enrichedTopAds?.slice(0, 5), // Limita a 5 para não sobrecarregar
                        lowPerformers: enrichedLowAds?.slice(0, 5),
                        descobertasGlobais: input.globalFindings,
                    }, null, 2)}`
                },
            ],
        });

        console.log('Report generated successfully:', text);
        return text;
    } catch (error) {
        console.error('Error generating report:', error);


    }
}