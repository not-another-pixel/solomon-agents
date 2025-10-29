import { fetchFileFromGCS } from './fetch_video';
import { generateObject, generateText } from 'ai';
import { videoAgentPrompt } from '../../../src/mastra/prompts/video-agent';
import {
    extractAudioBufferFromVideoBuffer,
    sampleMultipleFrames,
    getVideoMetadata
} from '../../ai-utils/video_extraction';
import { experimental_transcribe as transcribe } from 'ai';
import { openai } from '@ai-sdk/openai';
import summarizeVideoContent from '../../ai-utils/video_summary';
import { CreativeLevers, CreativeLeversSchema } from '../../types/video_analysis';


interface MediaAnalysisOptions {
    /** Number of frames to sample from video */
    numFrames?: number;
    /** Maximum dimension for sampled frames (default: 768) */
    maxFrameDimension?: number;
    /** Custom instructions to include in the analysis */
    customInstructions?: string;

    language?: string;
}

interface MediaAnalysisResult {
    analysis: string;
    transcription?: string;
    metadata: {
        type: 'video' | 'image';
        duration?: number;
        numFramesSampled?: number;
        dimensions?: { width: number; height: number };
    };
}

/**
 * Detect if buffer is an image or video based on magic bytes
 */
function detectMediaType(buffer: Buffer): 'image' | 'video' | 'unknown' {
    if (buffer.length < 12) return 'unknown';

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'image';
    }

    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'image';
    }

    // GIF: 47 49 46
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return 'image';
    }

    // MP4: ftyp at bytes 4-7
    if (buffer.toString('ascii', 4, 8) === 'ftyp') {
        return 'video';
    }

    // WebM/MKV: starts with 0x1A 0x45 0xDF 0xA3
    if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
        return 'video';
    }

    // AVI: RIFF....AVI
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 11) === 'AVI') {
        return 'video';
    }

    // MOV: moov or mdat
    const signature = buffer.toString('ascii', 4, 8);
    if (signature === 'moov' || signature === 'mdat' || signature === 'wide' || signature === 'free') {
        return 'video';
    }

    return 'unknown';
}

/**
 * Analyze image from buffer
 */
// async function analyzeImage(
//     imageBuffer: Buffer,
//     customInstructions: string,
//     systemPrompt: string
// ): Promise<MediaAnalysisResult> {
//     // Convert buffer to base64
//     const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

//     const prompt = customInstructions
//         ? `Analyze this image.\n\n${customInstructions}`
//         : 'Analyze this image in detail.';

//     const result = await generateText({
//         model: openai.chat('gpt-4o'),
//         system: systemPrompt,
//         messages: [
//             {
//                 role: 'user',
//                 content: [
//                     { type: 'text', text: prompt },
//                     { type: 'image', image: base64Image }
//                 ],
//             }
//         ]alysis: result.text, {
//         analysis:
//             text,
//         metadata: {
//             type: 'image',
//         }
//     }ata: {
//         type: 'image',
//     }
//     };
// }

/**
 * Analyze a video or image from Google Cloud Storage using GPT-4 Vision and Whisper
 * Automatically detects if the file is an image or video
 * 
 * @param bucket - GCS bucket name
 * @param objectPath - Path to the media file in the bucket
 * @param options - Configuration options for the analysis
 * @returns Analysis result with transcription (for videos) and metadata
 */
export async function analyzeMediaFromGCS(
    bucket: string,
    objectPath: string,
    options: MediaAnalysisOptions = {}
): Promise<CreativeLevers> {
    const {
        numFrames = 4,
        maxFrameDimension = 768,
        customInstructions = '',
        language = 'pt'
    } = options;

    try {
        console.log(`Fetching media from GCS: ${bucket}/${objectPath}`);
        const fileBuffer = await fetchFileFromGCS(bucket, objectPath);

        // Detect media type
        const mediaType = detectMediaType(fileBuffer);
        console.log(`Detected media type: ${mediaType}`);

        if (mediaType === 'unknown') {
            throw new Error(`Unable to detect media type for ${objectPath}. Supported formats: JPEG, PNG, GIF, MP4, WebM, MOV, AVI`);
        }

        // Handle images
        if (mediaType === 'image') {
            console.log('Skipping image...');
            // return await analyzeImage(fileBuffer, customInstructions, videoAgentPrompt);
        }

        // Handle videos
        console.log('Processing as video...');

        // Get video metadata for context
        console.log('Extracting video metadata...');
        const metadata = await getVideoMetadata(fileBuffer);

        if (metadata.duration === 0) {
            throw new Error(`Could not extract valid video metadata. The file may be corrupted or not a valid video format.`);
        }

        console.log(`Video duration: ${metadata.duration.toFixed(2)}s (${metadata.width}x${metadata.height})`);
        const video_summary = await summarizeVideoContent(fileBuffer);
        // Extract audio and transcribe in parallel with frame extraction
        console.log('Starting audio extraction and frame sampling...');
        const [audioBuffer, frames] = await Promise.all([
            extractAudioBufferFromVideoBuffer(fileBuffer, 'mp3'),
            sampleMultipleFrames(fileBuffer, numFrames, maxFrameDimension)
        ]);

        console.log('Transcribing audio...');
        const audioTranscription = await transcribe({
            model: openai.transcription('whisper-1'),
            audio: audioBuffer,
            providerOptions: {
                openai: {
                    language,
                    prompt: 'Transcrição precisa em português, caso não há diálogo, não transcreva.'
                }
            },
        });

        console.log(`Transcription complete: ${audioTranscription.text.length} characters`);
        console.log(`Sampled ${frames.length} frames from video`);

        // Build a rich context message combining transcription and visual frames
        const userMessage = buildAnalysisPrompt(
            video_summary,
            audioTranscription.text,
            metadata.duration,
            numFrames,
            customInstructions
        );

        console.log('Sending to GPT-4 for analysis...');
        const result = await generateObject({
            model: openai.chat('gpt-4o'),
            system: videoAgentPrompt,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: userMessage },
                        ...frames.map((frameBase64) => ({
                            type: 'image' as const,
                            image: frameBase64,
                        }))
                    ],
                }
            ],
            schema: CreativeLeversSchema
        });

        console.log('Analysis complete');

        return result.object;

    } catch (error) {
        console.error('Error analyzing media:', error);
        throw new Error(
            `Failed to analyze media from ${bucket}/${objectPath}: ${error instanceof Error ? error.message : 'Unknown error'
            }`
        );
    }
}

/**
 * Legacy function name for backwards compatibility
 */
export async function analyzeVideoFromGCS(
    bucket: string,
    objectPath: string,
    options: MediaAnalysisOptions = {}
): Promise<CreativeLevers> {
    return analyzeMediaFromGCS(bucket, objectPath, options);
}

/**
 * Build a structured prompt combining transcription and frame context
 */
function buildAnalysisPrompt(
    video_summary: string,
    transcription: string,
    duration: number,
    numFrames: number,
    customInstructions: string
): string {
    const durationFormatted = formatDuration(duration);

    let prompt = `Analyze this video based on the audio transcription and ${numFrames} visual frames sampled throughout the video.

**Video Information:**
- Video Summary: ${video_summary}
- Duration: ${durationFormatted}
- Number of frames provided: ${numFrames}
- Frames are sampled at evenly-spaced intervals across the video

**Audio Transcription:** ${transcription} (This is experimental, only use if it makes sense with the video summary)

**Visual Frames:**
The images below show key moments from the video at different timestamps.
`;

    if (customInstructions) {
        prompt += `\n**Additional Instructions:**\n${customInstructions}\n`;
    }

    prompt += `\nPlease provide a comprehensive analysis considering both the audio content and visual elements.`;

    return prompt;
}

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Convenience function for quick media analysis with defaults
 */
export async function quickAnalyzeMedia(
    bucket: string,
    objectPath: string,
    question?: string
): Promise<CreativeLevers> {
    const result = await analyzeMediaFromGCS(bucket, objectPath, {
        numFrames: 4,
        customInstructions: question,
    });

    return result;
}

/**
 * Analyze media with detailed frame sampling for complex videos
 */
export async function detailedAnalyzeMedia(
    bucket: string,
    objectPath: string,
    question?: string
): Promise<CreativeLevers> {
    return analyzeMediaFromGCS(bucket, objectPath, {
        numFrames: 8,
        maxFrameDimension: 1024,
        customInstructions: question,
    });
}