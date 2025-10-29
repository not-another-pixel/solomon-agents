import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { RuntimeContext } from '@mastra/core/di';
import { fetchCTRTool } from '../tools/fetch-ctr-tool';
import { analyzeVideoFromGCS } from '../../../lib/dal/gcp/analyse_video';
import { CreativeLevers } from '../../../lib/types/video_analysis';
import { generateCreativeReport } from '../../../lib/ai-utils/generate_report';
import { create } from 'domain';
import { error } from 'console';



const getDatabaseData = createStep({
    id: 'get-database-data',
    inputSchema: z.object({}),
    outputSchema: z.object({
        company_id: z.string(),
    }),
    resumeSchema: z.object({
        company_id: z.string(),
    }),
    suspendSchema: z.object({
        message: z.string(),
    }),
    execute: async ({ resumeData, suspend }) => {
        if (!resumeData?.company_id) {
            await suspend({
                message: 'Please provide your company ID:',
            });

            return {
                company_id: '',
            };
        }

        const { company_id } = resumeData;
        return { company_id };
    },
});


const executeCTRResearchStep = createStep({
    id: 'execute-ctr-research',
    inputSchema: z.object({
        company_id: z.string(),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        high_CTRData: z.array(z.any()).optional(),
        low_CTRData: z.array(z.any()).optional(),
        error: z.string().optional(),
    }),
    execute: async ({ inputData, runtimeContext }) => {
        const { company_id } = inputData;



        try {
            if (!fetchCTRTool.execute) {
                throw new Error(' fetch CTR execution tool is not available');
            }

            const result = await fetchCTRTool.execute({
                context: {
                    company_id,
                },
                runtimeContext: runtimeContext || new RuntimeContext(),
            });

            // Type guard for execution result
            if (!result || typeof result !== 'object') {
                throw new Error('Invalid SQL execution result');
            }

            const executionResult = result as any;
            return {
                success: true,
                high_CTRData: executionResult.high_CTRData,
                low_CTRData: executionResult.low_CTRData,
            };


        } catch (error) {
            return {
                success: false,
                error: `Failed to execute SQL: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    },
});


const processVideoAnalysisStep = createStep({
    id: 'process-video-analysis',
    inputSchema: z.object({
        success: z.boolean(),
        high_CTRData: z.array(z.any()).optional(),
        low_CTRData: z.array(z.any()).optional(),
        error: z.string().optional(),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        highAnalysisResult: z.array(z.any()).optional(),
        lowAnalysisResult: z.array(z.any()).optional(),
    }),
    execute: async ({ inputData }) => {
        const { success, high_CTRData, low_CTRData } = inputData;

        let lowAnalysisResult: any[] = [];
        let highAnalysisResult: any[] = [];
        let path;
        let creative_levers: CreativeLevers;
        console.log(high_CTRData, low_CTRData);
        for (const data of high_CTRData || []) {
            console.log('Processing high CTR video data:', data);

            path = data.video_url.split('facebook-ads-media-sources/')[1]

            creative_levers = await analyzeVideoFromGCS(
                'facebook-ads-media-sources',
                path,
                data.body
            );



            highAnalysisResult.push({
                ad_id: data.ad_id,
                video_analysis: creative_levers,
                ctr: data.ctr || undefined,
                conversion_value: data.conversion_value || undefined,
                thumb_stop_rate: data.thumb_stop_rate || undefined,
                spend: data.spend || undefined,
                video_description: data.body || undefined,
                call_to_action: data.call_to_action || undefined,
                video_classification: 'High CTR Video'
            })



        }


        for (const data of low_CTRData || []) {

            const path = data.video_url.split('facebook-ads-media-sources/')[1]

            creative_levers = await analyzeVideoFromGCS(
                'facebook-ads-media-sources',
                path,
                data.body
            );
            lowAnalysisResult.push({
                ad_id: data.ad_id || undefined,
                video_analysis: creative_levers,
                ctr: data.ctr || undefined,
                conversion_value: data.conversion_value || undefined,
                thumb_stop_rate: data.thumb_stop_rate || undefined,
                spend: data.spend || undefined,
                video_description: data.body || undefined,
                call_to_action: data.call_to_action || undefined,
                video_classification: 'Low CTR Video'
            })
        }


        return {
            success: true,
            highAnalysisResult,
            lowAnalysisResult
        };
    },
});

const createReportAnalysisStep = createStep({
    id: 'process-report-analysis',
    inputSchema: z.object({
        success: z.boolean(),
        highAnalysisResult: z.array(z.any()).optional(),
        lowAnalysisResult: z.array(z.any()).optional(),
        error: z.string().optional(),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        message: z.string().optional(),
        report: z.any().optional(),
    }),
    execute: async ({ inputData }) => {
        const { success, highAnalysisResult, lowAnalysisResult, error } = inputData;
        if (!success) {
            return {
                success: false,
                message: `Video analysis failed: ${error}`,
            };
        }

        console.log('Creating report with analysis results:', highAnalysisResult, lowAnalysisResult);
        // Process the analysis results and generate a report
        const report = await generateCreativeReport({
            topAds: highAnalysisResult?.map(item => ({
                name: item.ad_id,
                id: item.ad_id,
                copy: item.video_description,
                thumb_stop_rate: item.thumb_stop_rate,
                ctr: item.ctr,
                conversion_value: item.conversion_value,
                call_to_action: item.call_to_action,
                spend: item.spend,
                levers: item.video_analysis
            })),
            lowAds: lowAnalysisResult?.map(item => ({
                name: item.ad_id,
                id: item.ad_id,
                copy: item.video_description,
                ctr: item.ctr,
                thumb_stop_rate: item.thumb_stop_rate,
                call_to_action: item.call_to_action,
                conversion_value: item.conversion_value,
                spend: item.spend,
                levers: item.video_analysis
            })),
            globalFindings: [],
        });
        return {
            success: true,
            message: 'Report generated successfully',
            report
        };
    },
});



const testingStep = createStep({
    id: 'testing-workflow',
    inputSchema: z.object({}),
    outputSchema: z.object({
        success: z.boolean(),
        highAnalysisResult: z.array(z.any()).optional(),
        lowAnalysisResult: z.array(z.any()).optional(),
        error: z.string().optional(),
    }),
    execute: async () => {
        return {
            success: true,
            highAnalysisResult: [
                {
                    ad_id: "120235865588640295",
                    video_analysis: {
                        videoId: "N/A",
                        hook: {
                            whatIsControls: "Abertura energética destacando a reposição do estoque de camisetas.",
                            whyImportant: "Atrai rapidamente a atenção do público ao anunciar algo novo e emocionante.",
                            examplesValues: [
                                "Reposição de estoque",
                                "Promoção incrível",
                                "Produto exclusivo"
                            ]
                        },
                        angle: {
                            whatIsControls: "Apresentação das camisetas como ideais para físicos musculosos.",
                            whyImportant: "Conecta o produto com o público-alvo, aumentando a relevância.",
                            examplesValues: [
                                "Roupas que destacam o físico",
                                "Conforto sem apertar",
                                "Fashion oversized"
                            ]
                        },
                        tone: {
                            whatIsControls: "Tom energético e persuasivo do apresentador.",
                            whyImportant: "Mantém o interesse do espectador e torna o produto mais desejável.",
                            examplesValues: [
                                "Enérgico",
                                "Convidativo",
                                "Motivacional"
                            ]
                        },
                        offerPromise: {
                            whatIsControls: "Reposição de estoque e variedade de cores.",
                            whyImportant: "Estimula ação imediata dos consumidores interessados.",
                            examplesValues: [
                                "Linha oversized disponível",
                                "Cores variadas"
                            ]
                        },
                        cta: {
                            whatIsControls: "Instrução para clicar no link e conferir as camisetas.",
                            whyImportant: "Conduz o espectador a tomar uma ação específica, aumentando as chances de conversão.",
                            examplesValues: [
                                "Clique no link",
                                "Confira agora"
                            ]
                        },
                        proofDevice: {
                            whatIsControls: "Demonstração da qualidade do tecido e caimento.",
                            whyImportant: "Gera confiança no produto ao mostrar seus atributos.",
                            examplesValues: [
                                "Caimento perfeito",
                                "Material de alta qualidade"
                            ]
                        },
                        visualStyle: {
                            whatIsControls: "Edição dinâmica com cortes rápidos e imagens vibrantes.",
                            whyImportant: "Mantém o engajamento visual e realça o produto.",
                            examplesValues: [
                                "Cores vibrantes",
                                "Edição rápida"
                            ]
                        },
                        formatPlacement: {
                            whatIsControls: "Formato retrato ideal para redes sociais.",
                            whyImportant: "Maximiza a visualização em plataformas mobile.",
                            examplesValues: [
                                "Instagram",
                                "TikTok"
                            ]
                        },
                        narrativeStructure: {
                            whatIsControls: "Apresentação, demonstração e chamada para ação.",
                            whyImportant: "Organiza o vídeo de uma forma que leva o espectador da atenção à ação.",
                            examplesValues: [
                                "Introdução atrativa",
                                "Demonstração",
                                "Chamada para ação"
                            ]
                        },
                        audiencePersona: {
                            whatIsControls: "Homens com físico musculoso que buscam roupas confortáveis e estilosas.",
                            whyImportant: "Direciona a mensagem para um público específico, aumentando a relevância.",
                            examplesValues: [
                                "Fitness enthusiasts",
                                "Homens jovens e ativos"
                            ]
                        },
                        painPoint: {
                            whatIsControls: "Camisetas que apertam e não valorizam o físico.",
                            whyImportant: "Identifica e oferece uma solução para um problema comum do público-alvo.",
                            examplesValues: [
                                "Roupas apertadas",
                                "Desconforto"
                            ]
                        },
                        benefitLadder: {
                            whatIsControls: "Conforto e valorização do físico levam à confiança.",
                            whyImportant: "Liga características práticas a benefícios emocionais, aumentando o valor percebido.",
                            examplesValues: [
                                "Conforto e destaque",
                                "Confiança e estilo"
                            ]
                        },
                        urgencyDevice: {
                            whatIsControls: "Reposição de estoque.",
                            whyImportant: "Cria um senso de urgência para estimular compras rápidas.",
                            examplesValues: [
                                "Estoque limitado",
                                "Nova reposição"
                            ]
                        },
                        complianceTone: {
                            whatIsControls: "N/A",
                            whyImportant: "N/A",
                            examplesValues: "N/A"
                        },
                        moodPalette: {
                            whatIsControls: "Paleta de cores vivas e música motivacional.",
                            whyImportant: "Evoca emoções positivas e energia, complementando a mensagem do vídeo.",
                            examplesValues: [
                                "Cores vibrantes",
                                "Música animada"
                            ]
                        },
                        uspPositioning: {
                            whatIsControls: "Diferencial de conforto e estilo oversized.",
                            whyImportant: "Destaca o que torna o produto único, diferenciando-o dos concorrentes.",
                            examplesValues: [
                                "Projeto exclusivo oversized",
                                "Alta qualidade"
                            ]
                        }
                    },
                    ctr: "0.01676337846550612508",
                    conversion_value: 1243.85003084,
                    thumb_stop_rate: "0.15201662010172648471",
                    spend: 222.16000000000003,
                    video_classification: "High CTR Video"
                },
                {
                    ad_id: "120236834872010295",
                    video_analysis: {
                        videoId: "N/A",
                        hook: {
                            whatIsControls: "Primeiros 1–3s que prendem a atenção mostrando a elasticidade das camisetas.",
                            whyImportant: "Captura imediatamente o interesse do espectador, incentivando a continuar assistindo.",
                            examplesValues: [
                                "Demonstração de elasticidade",
                                "Close-up no tecido",
                                "Música enérgica"
                            ]
                        },
                        angle: {
                            whatIsControls: "A forma como os benefícios são apresentados através da flexibilidade e elasticidade.",
                            whyImportant: "Destaca a qualidade e inovação do produto, diferenciando-o de concorrentes.",
                            examplesValues: [
                                "Elasticidade extrema",
                                "Retorno sem deformação",
                                "Aplicação em vários tipos de camiseta"
                            ]
                        },
                        tone: {
                            whatIsControls: "Personalidade e humor através da música e estilo visual.",
                            whyImportant: "Ajuda a definir a percepção da marca e a conexão emocional com o público.",
                            examplesValues: [
                                "Música eletrônica vibrante",
                                "Estilo minimalista",
                                "Visual profissional"
                            ]
                        },
                        offerPromise: {
                            whatIsControls: "Valor concreto não especificado no vídeo.",
                            whyImportant: "Promessas de ofertas podem incentivar compras imediatas, tradicionalmente.",
                            examplesValues: "N/A"
                        },
                        cta: {
                            whatIsControls: "Direcionamento ao final do vídeo para inscrever-se no canal.",
                            whyImportant: "Incentiva o engajamento contínuo com a marca através de notificações e fidelização.",
                            examplesValues: [
                                "Inscreva-se no canal",
                                "Ative o sininho"
                            ]
                        },
                        proofDevice: {
                            whatIsControls: "Demonstração visual da elasticidade do tecido.",
                            whyImportant: "Evidencia a qualidade do produto, aumentando a confiança do consumidor.",
                            examplesValues: [
                                "Demonstração de esticamento",
                                "Retorno à forma original"
                            ]
                        },
                        visualStyle: {
                            whatIsControls: "Estética minimalista, foco no produto e sua estética polida.",
                            whyImportant: "Mantém o foco no produto e transmite uma imagem de alta qualidade.",
                            examplesValues: [
                                "Minimalista",
                                "Direto ao ponto",
                                "Alta qualidade visual"
                            ]
                        },
                        formatPlacement: {
                            whatIsControls: "Formato adaptado para plataformas de vídeo como YouTube.",
                            whyImportant: "Assegura que o vídeo seja otimizado para visualizações em diferentes dispositivos.",
                            examplesValues: [
                                "Horizontal",
                                "Plataformas de vídeo"
                            ]
                        },
                        narrativeStructure: {
                            whatIsControls: "Ordem e ritmo da demonstração repetitiva das camisetas.",
                            whyImportant: "Ajuda a reforçar continuamente a mensagem central de elasticidade.",
                            examplesValues: [
                                "Repetição de demonstração",
                                "Cada cor uma nova demonstração"
                            ]
                        },
                        audiencePersona: {
                            whatIsControls: "Consumidores de roupas esportivas e técnicas.",
                            whyImportant: "Direciona a mensagem para um público específico interessado em inovação em roupas.",
                            examplesValues: [
                                "Amantes de esportes",
                                "Tecnologia em vestuário"
                            ]
                        },
                        painPoint: {
                            whatIsControls: "Problema de roupas que perdem a forma com facilidade.",
                            whyImportant: "Mostra como o produto resolve um problema comum e relevante.",
                            examplesValues: [
                                "Perda de forma",
                                "Falta de durabilidade"
                            ]
                        },
                        benefitLadder: {
                            whatIsControls: "Ligação entre funcionalidade (elasticidade) e valor emocional (confiança no produto).",
                            whyImportant: "Conecta o benefício funcional a um resultado desejado emocionalmente.",
                            examplesValues: [
                                "Elasticidade elevada",
                                "Durabilidade confiável"
                            ]
                        },
                        urgencyDevice: {
                            whatIsControls: "Dispositivos de urgência não utilizados claramente no vídeo.",
                            whyImportant: "Urgência pode aumentar as taxas de conversão através do incentivo à ação imediata.",
                            examplesValues: "N/A"
                        },
                        complianceTone: {
                            whatIsControls: "Declarações legais e disclaimers não evidentes.",
                            whyImportant: "Assegura que todas as reivindicações estejam em conformidade legal.",
                            examplesValues: "N/A"
                        },
                        moodPalette: {
                            whatIsControls: "Emoção transmitida pela cor vibrante dos produtos e música energética.",
                            whyImportant: "Cria uma experiência sensorial envolvente e memorável.",
                            examplesValues: [
                                "Cores vibrantes",
                                "Música hip-hop eletrônica"
                            ]
                        },
                        uspPositioning: {
                            whatIsControls: "Diferencial único de desempenho técnico (elasticidade).",
                            whyImportant: "Posiciona o produto como superior devido à sua tecnologia inovadora.",
                            examplesValues: [
                                "Alta elasticidade",
                                "Tecnologia avançada de tecido"
                            ]
                        }
                    },
                    ctr: "0.00798441688684885537",
                    conversion_value: 1244.73995328,
                    thumb_stop_rate: "0.15297679890455343195",
                    spend: 596,
                    video_classification: "High CTR Video"
                }
            ],
            lowAnalysisResult: [
                {
                    ad_id: "120230967982930295",
                    video_analysis: {
                        videoId: "N/A",
                        hook: {
                            whatIsControls: "Os primeiros segundos que chamam a atenção do espectador.",
                            whyImportant: "Capturar rapidamente o interesse do público para evitar que pulem o anúncio.",
                            examplesValues: [
                                "'Olha só que notícia boa!'",
                                "'Acabaram de repor os estoques!'"
                            ]
                        },
                        angle: {
                            whatIsControls: "Abordagem que destaca os benefícios do produto.",
                            whyImportant: "Determina como o produto é percebido em relação às necessidades do consumidor.",
                            examplesValues: [
                                "Focado em conforto e caimento para corpos musculosos"
                            ]
                        },
                        tone: {
                            whatIsControls: "Forma como a mensagem é transmitida, incluindo personalidade e humor.",
                            whyImportant: "Afeta a conexão emocional com o público-alvo.",
                            examplesValues: [
                                "Energético",
                                "Confiante",
                                "Persuasivo"
                            ]
                        },
                        offerPromise: {
                            whatIsControls: "Valor concreto oferecido, como descontos ou frete grátis.",
                            whyImportant: "Incentiva o consumidor a agir imediatamente.",
                            examplesValues: [
                                "Reestoque da linha Oversize"
                            ]
                        },
                        cta: {
                            whatIsControls: "Chamada para ação explícita no vídeo.",
                            whyImportant: "Guia o espectador sobre o próximo passo a ser dado.",
                            examplesValues: [
                                "'Não perde mais tempo, clica no link'"
                            ]
                        },
                        proofDevice: {
                            whatIsControls: "Evidências que suportam as afirmações do produto.",
                            whyImportant: "Aumenta a credibilidade do produto.",
                            examplesValues: [
                                "N/A"
                            ]
                        },
                        visualStyle: {
                            whatIsControls: "A estética e o ritmo visual do vídeo.",
                            whyImportant: "Contribui para o reconhecimento da marca e engajamento visual.",
                            examplesValues: [
                                "Estilo clean e bem iluminado",
                                "Foco em cores vibrantes"
                            ]
                        },
                        formatPlacement: {
                            whatIsControls: "Dimensões e plataforma onde o vídeo é exibido.",
                            whyImportant: "Adequação ao meio de veiculação aumenta a eficácia do anúncio.",
                            examplesValues: [
                                "N/A"
                            ]
                        },
                        narrativeStructure: {
                            whatIsControls: "Ordem e ritmo da história contada no vídeo.",
                            whyImportant: "Mantém o espectador engajado ao longo do vídeo.",
                            examplesValues: [
                                "Apresentação, demonstração, variedade de opções, fechamento"
                            ]
                        },
                        audiencePersona: {
                            whatIsControls: "Descrição do público-alvo do vídeo.",
                            whyImportant: "Direciona a mensagem para ressoar com o público certo.",
                            examplesValues: [
                                "Homens com físico musculoso",
                                "Pessoas que preferem camisetas oversized"
                            ]
                        },
                        painPoint: {
                            whatIsControls: "Problema que o produto resolve.",
                            whyImportant: "Mostrar relevância e necessidade do produto.",
                            examplesValues: [
                                "Desconforto com blusas apertadas"
                            ]
                        },
                        benefitLadder: {
                            whatIsControls: "Conexão entre benefício funcional e resultado emocional.",
                            whyImportant: "Ajuda a conectar o produto com as necessidades emocionais do consumidor.",
                            examplesValues: [
                                "Conforto e valorização do físico → Aumento da confiança"
                            ]
                        },
                        urgencyDevice: {
                            whatIsControls: "Motivo para agir agora.",
                            whyImportant: "Cria um senso de urgência que pode aumentar conversões.",
                            examplesValues: [
                                "Reestoque limitado"
                            ]
                        },
                        complianceTone: {
                            whatIsControls: "Informações legais ou disclaimers.",
                            whyImportant: "Reduz riscos legais e aumenta transparência.",
                            examplesValues: [
                                "N/A"
                            ]
                        },
                        moodPalette: {
                            whatIsControls: "Emoção transmitida por cores, música e ritmo.",
                            whyImportant: "Afeta a percepção do vídeo e a resposta emocional do público.",
                            examplesValues: [
                                "Alegre e moderno"
                            ]
                        },
                        uspPositioning: {
                            whatIsControls: "Posicionamento único do produto no mercado.",
                            whyImportant: "Diferencia o produto da concorrência.",
                            examplesValues: [
                                "Camisetas oversized de alta qualidade para físicos musculosos"
                            ]
                        }
                    },
                    ctr: "0.00246435486710086252",
                    conversion_value: 260.90000237000004,
                    thumb_stop_rate: "0.09769406794578419292",
                    spend: 23.400000000000002,
                    video_classification: "Low CTR Video"
                },
                {
                    ad_id: "120236257010020295",
                    video_analysis: {
                        videoId: "N/A",
                        hook: {
                            whatIsControls: "Introdução com foco no logo 'ALPHACO' da camiseta.",
                            whyImportant: "Prende a atenção ao destacar a marca desde o início, estabelecendo logo o reconhecimento da marca.",
                            examplesValues: [
                                "Close-up do logo",
                                "Frase inicial impactante"
                            ]
                        },
                        angle: {
                            whatIsControls: "Apresentação dos benefícios da camiseta 'oversize'.",
                            whyImportant: "Destaca pontos fortes do produto, como conforto e estilo, aumentando a atratividade.",
                            examplesValues: [
                                "Conforto",
                                "Estilo",
                                "Versatilidade"
                            ]
                        },
                        tone: {
                            whatIsControls: "Tom entusiasta e persuasivo do apresentador.",
                            whyImportant: "Cria uma conexão emocional positiva com o espectador, motivando-o a agir.",
                            examplesValues: [
                                "Entusiasta",
                                "Persuasivo",
                                "Amigável"
                            ]
                        },
                        offerPromise: {
                            whatIsControls: "Incentivo para visitar o site e garantir o produto.",
                            whyImportant: "Incentiva a ação imediata do espectador, potencialmente aumentando as conversões.",
                            examplesValues: [
                                "Corre no site",
                                "Garante a tua"
                            ]
                        },
                        cta: {
                            whatIsControls: "Chamada para ação direta a visitar o site.",
                            whyImportant: "Impulsiona o espectador a tomar uma ação imediata, convertendo interesse em potencial compra.",
                            examplesValues: [
                                "Corre no site e garante a tua"
                            ]
                        },
                        proofDevice: {
                            whatIsControls: "Elogios e gestos mostrando o produto.",
                            whyImportant: "Reforça a credibilidade e qualidade do produto através de demonstrações visuais e entusiasmadas.",
                            examplesValues: [
                                "Elogios do apresentador",
                                "Apresentação visual do produto"
                            ]
                        },
                        visualStyle: {
                            whatIsControls: "Estilo de vídeo focado no ambiente residencial e casual.",
                            whyImportant: "Cria uma sensação de autenticidade e conforto, refletindo o estilo de vida associado ao produto.",
                            examplesValues: [
                                "Ambiente residencial",
                                "Estilo casual"
                            ]
                        },
                        formatPlacement: {
                            whatIsControls: "Formatos de tela padrão para redes sociais.",
                            whyImportant: "Permite que o vídeo seja acessível e otimizado para plataformas populares de vídeo online.",
                            examplesValues: [
                                "Formato vertical",
                                "Ambiente interno"
                            ]
                        },
                        narrativeStructure: {
                            whatIsControls: "Ordem de apresentação das características e vantagens do produto.",
                            whyImportant: "Organiza de forma lógica e fluida a informação, mantendo o interesse do espectador.",
                            examplesValues: [
                                "Comentário inicial sobre o design",
                                "Demonstração de uso",
                                "Chamada para ação"
                            ]
                        },
                        audiencePersona: {
                            whatIsControls: "Público que busca estilo e conforto em roupas casuais.",
                            whyImportant: "Foca na audiência que valoriza versatilidade e conforto, maximizando o engajamento e conversão.",
                            examplesValues: [
                                "Adultos jovens",
                                "Fãs de moda casual"
                            ]
                        },
                        painPoint: {
                            whatIsControls: "Necessidade de roupas confortáveis e versáteis.",
                            whyImportant: "Endereça problemas comuns com roupas, atraindo consumidores que priorizam conforto.",
                            examplesValues: [
                                "Falta de conforto",
                                "Estilo limitado"
                            ]
                        },
                        benefitLadder: {
                            whatIsControls: "Conforto diário resultando em estilo pessoal aprimorado.",
                            whyImportant: "Liga benefícios funcionais a resultados emocionais, fazendo o produto mais desejável.",
                            examplesValues: [
                                "Conforto diário",
                                "Estilo versátil"
                            ]
                        },
                        urgencyDevice: {
                            whatIsControls: "Sugestão para agir rapidamente e garantir o produto.",
                            whyImportant: "Cria uma sensação de urgência que pode acelerar a decisão de compra.",
                            examplesValues: [
                                "Corre no site",
                                "Garante a tua"
                            ]
                        },
                        complianceTone: {
                            whatIsControls: "N/A",
                            whyImportant: "N/A",
                            examplesValues: "N/A"
                        },
                        moodPalette: {
                            whatIsControls: "Uso de cores neutras e melodia animada.",
                            whyImportant: "Estabelece uma atmosfera positiva e acessível, complementando o produto destacado.",
                            examplesValues: [
                                "Melodia de fundo suave",
                                "Cores neutras"
                            ]
                        },
                        uspPositioning: {
                            whatIsControls: "Destaque do design 'oversize' e logo da marca.",
                            whyImportant: "Destaca o diferencial da marca, estabelecendo uma identidade única no mercado.",
                            examplesValues: [
                                "Design 'oversize'",
                                "Logo 'ALPHACO'"
                            ]
                        }
                    },
                    ctr: "0.00303380398451348896",
                    conversion_value: 3804.55001747,
                    thumb_stop_rate: "0.06902785984531127358",
                    spend: 794.37,
                    video_classification: "Low CTR Video"
                }
            ]
        };
    }
});

export const testingWorkflow = createWorkflow({
    id: 'testing-workflow',
    inputSchema: z.object({}),
    outputSchema: z.object({
        success: z.boolean(),
        message: z.string(),
        report: z.array(z.any()),
    }),
    steps: [testingStep, createReportAnalysisStep],
});
testingWorkflow
    .then(testingStep)
    .then(createReportAnalysisStep)
    .commit();


export const videoAnalysisWorkflow = createWorkflow({
    id: 'video-analysis-workflow',
    inputSchema: z.object({}),
    outputSchema: z.object({
        success: z.boolean(),
        analysisResult: z.array(z.any()).optional(),
    }),
    steps: [getDatabaseData, executeCTRResearchStep, processVideoAnalysisStep, createReportAnalysisStep],
});

videoAnalysisWorkflow
    .then(getDatabaseData)
    .then(executeCTRResearchStep)
    .then(processVideoAnalysisStep)
    .then(createReportAnalysisStep)
    .commit();