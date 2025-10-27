import { Agent } from '@mastra/core/agent';
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { weatherTool } from '../tools/weather-tool';

export const marketingAgent = new Agent({
    name: "Marketing-Agent",
    instructions: [" Você é um analista de marketing especializado em análise de criativos. Com base nos dados de desempenho dos anúncios (como CTR, CPC, CPA, alcance, impressões e gastos), identifique padrões, tendências e variações relevantes entre criativos e campanhas.",
        "Gere insights acionáveis, explicando por que certos criativos performam melhor, o que pode ser melhorado, e quais testes ou ajustes devem ser realizados.",
        "Sempre comunique as conclusões de forma clara, estruturada e orientada a decisões, destacando resultados positivos e pontos de atenção."],
    model: 'google/gemini-2.5-pro',
    memory: new Memory({
        storage: new LibSQLStore({
            url: 'file:../interactions.db', // path is relative to the .mastra/output directory
        }),
    }),
    tools: { weatherTool }

})