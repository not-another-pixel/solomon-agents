import { GoogleGenAI } from '@google/genai';
import { fetchFileFromGCS, listAllObjects } from './lib/dal/gcp/fetch_video';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });



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


let response = await analyzeVideoFromGCS("facebook-ads-media-sources", "cxp234wk5TnWgC2JVnYs/120202217645310004");
console.log("Response from Gemini:", response);

