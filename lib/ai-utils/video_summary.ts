import { google } from '@ai-sdk/google';
import { generateText } from 'ai';


export default async function summarizeVideoContent(videoBuffer: Buffer) {
    const result = await generateText({
        model: google('gemini-2.5-flash'),
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: 'Descreva esse vídeo em detalhes, incluindo o cenário, as ações principais e quaisquer elementos notáveis que possam ajudar a entender seu conteúdo, fale sobre o aúdio e as imagens de forma sucinta, se não houver aúdio deixe claro que não deve ser utilizado a transcrição do vídeo para análise',
                    },
                    {
                        type: 'file',
                        data: videoBuffer,
                        mediaType: 'video/mp4',
                    },
                ],
            },
        ],
    });
    return result.text;
}