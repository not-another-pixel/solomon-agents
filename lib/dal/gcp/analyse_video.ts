import { fetchFileFromGCS } from './fetch_video';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';




export async function analyzeVideoFromGCS(bucket: string, objectPath: string) {
    const fileBuffer = await fetchFileFromGCS(bucket, objectPath);
    const result = await generateText({
        model: google('gemini-2.5-flash'),
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: 'Give me the details',
                    },
                    {
                        type: 'file',
                        data: fileBuffer,
                        mediaType: 'video/mp4',
                    },
                ],
            },
        ],
    });
    return result.content;
}
