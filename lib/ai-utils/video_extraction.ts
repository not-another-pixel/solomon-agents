// video-io.ts
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

interface VideoMetadata {
    duration: number;
    width: number;
    height: number;
}

/**
 * Extract audio optimized for speech transcription (Whisper, etc.)
 * Uses MP3 format for smaller size while maintaining quality
 */
export async function extractAudioBufferFromVideoBuffer(
    videoBuffer: Buffer,
    format: "wav" | "mp3" = "mp3"
): Promise<Buffer> {
    const args = [
        "-i", "pipe:0",
        "-vn",
        "-ac", "1",          // mono
        "-ar", "16000",      // 16 kHz (optimal for Whisper)
    ];

    if (format === "mp3") {
        args.push(
            "-codec:a", "libmp3lame",
            "-b:a", "64k",   // 64kbps is sufficient for speech
            "-f", "mp3"
        );
    } else {
        args.push("-f", "wav");
    }

    args.push("pipe:1");

    return new Promise((resolve, reject) => {
        const ff = spawn(ffmpegPath!, args, { stdio: ["pipe", "pipe", "pipe"] });

        if (!ff.stdin) {
            reject(new Error("Failed to open ffmpeg stdin"));
            return;
        }

        const chunks: Buffer[] = [];
        const errors: Buffer[] = [];
        let stdinClosed = false;

        // Handle stdin errors (write EOF)
        ff.stdin.on('error', (err) => {
            if (!stdinClosed) {
                console.warn('FFmpeg stdin error (process may have exited early):', err.message);
                stdinClosed = true;
            }
        });

        ff.stdout.on("data", (chunk) => chunks.push(chunk));
        ff.stderr.on("data", (chunk) => errors.push(chunk));

        ff.on("error", (err) => {
            reject(new Error(`FFmpeg process error: ${err.message}`));
        });

        ff.on("close", (code) => {
            const errorMsg = Buffer.concat(errors).toString();

            if (code === 0 && chunks.length > 0) {
                resolve(Buffer.concat(chunks));
            } else {
                // Check for common errors
                if (errorMsg.includes('does not contain any stream')) {
                    reject(new Error('No audio stream found in video. The file may be an image or video without audio.'));
                } else if (errorMsg.includes('Invalid data found')) {
                    reject(new Error('Invalid video format or corrupted file.'));
                } else if (errorMsg.includes('moov atom not found')) {
                    reject(new Error('Video file is incomplete or corrupted (missing moov atom).'));
                } else {
                    reject(new Error(`ffmpeg audio extraction failed (exit code ${code}): ${errorMsg.slice(-500)}`));
                }
            }
        });

        // Write the buffer in chunks to avoid overwhelming stdin
        const CHUNK_SIZE = 64 * 1024; // 64KB chunks
        let offset = 0;

        const writeChunk = () => {
            if (stdinClosed || offset >= videoBuffer.length) {
                if (!stdinClosed) {
                    ff.stdin!.end();
                    stdinClosed = true;
                }
                return;
            }

            const chunk = videoBuffer.slice(offset, Math.min(offset + CHUNK_SIZE, videoBuffer.length));
            offset += chunk.length;

            const canContinue = ff.stdin!.write(chunk);

            if (canContinue) {
                // Continue writing immediately
                writeChunk();
            } else {
                // Wait for drain event before continuing
                ff.stdin!.once('drain', writeChunk);
            }
        };

        writeChunk();
    });
}

/**
 * Get video metadata (duration, dimensions)
 */
export async function getVideoMetadata(videoBuffer: Buffer): Promise<VideoMetadata> {
    const args = [
        "-i", "pipe:0",
        "-f", "null",
        "-"
    ];

    return new Promise((resolve, reject) => {
        const ff = spawn(ffmpegPath!, args, { stdio: ["pipe", "pipe", "pipe"] });

        const stderr: Buffer[] = [];
        let stdinClosed = false;

        ff.stdin.on('error', (err) => {
            if (!stdinClosed) {
                console.warn('FFmpeg stdin error during metadata extraction:', err.message);
                stdinClosed = true;
            }
        });

        ff.stderr.on("data", (chunk) => stderr.push(chunk));

        ff.on("close", () => {
            const output = Buffer.concat(stderr).toString();

            // Parse duration (format: Duration: 00:01:23.45)
            const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
            const duration = durationMatch
                ? parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseFloat(durationMatch[3])
                : 0;

            // Parse dimensions (format: 1920x1080)
            const dimMatch = output.match(/(\d{3,5})x(\d{3,5})/);
            const width = dimMatch ? parseInt(dimMatch[1]) : 0;
            const height = dimMatch ? parseInt(dimMatch[2]) : 0;

            resolve({ duration, width, height });
        });

        ff.on("error", (err) => {
            reject(new Error(`FFmpeg metadata extraction failed: ${err.message}`));
        });

        // Write buffer in chunks
        const CHUNK_SIZE = 64 * 1024;
        let offset = 0;

        const writeChunk = () => {
            if (stdinClosed || offset >= videoBuffer.length) {
                if (!stdinClosed) {
                    ff.stdin.end();
                    stdinClosed = true;
                }
                return;
            }

            const chunk = videoBuffer.slice(offset, Math.min(offset + CHUNK_SIZE, videoBuffer.length));
            offset += chunk.length;

            const canContinue = ff.stdin.write(chunk);

            if (canContinue) {
                writeChunk();
            } else {
                ff.stdin.once('drain', writeChunk);
            }
        };

        writeChunk();
    });
}

/**
 * Sample a single frame at specific time, optimized for LLM vision
 * Resizes to max dimension to reduce token usage
 */
export async function sampleFrameBase64FromBuffer(
    videoBuffer: Buffer,
    timeSec: number,
    maxDimension: number = 1024  // Reduce size for LLM efficiency
): Promise<string> {
    const args = [
        "-ss", timeSec.toString(),
        "-i", "pipe:0",
        "-frames:v", "1",
        "-vf", `scale='min(${maxDimension},iw)':'min(${maxDimension},ih)':force_original_aspect_ratio=decrease`,
        "-q:v", "2",         // Higher quality (2 better than 3)
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "pipe:1"
    ];

    return new Promise((resolve, reject) => {
        const ff = spawn(ffmpegPath!, args, { stdio: ["pipe", "pipe", "pipe"] });

        const chunks: Buffer[] = [];
        const errors: Buffer[] = [];
        let stdinClosed = false;

        ff.stdin.on('error', (err) => {
            if (!stdinClosed) {
                console.warn('FFmpeg stdin error during frame extraction:', err.message);
                stdinClosed = true;
            }
        });

        ff.stdout.on("data", (c) => chunks.push(c));
        ff.stderr.on("data", (c) => errors.push(c));

        ff.on("close", (code) => {
            const errorMsg = Buffer.concat(errors).toString();

            if (code === 0 && chunks.length > 0) {
                const imgBuffer = Buffer.concat(chunks);
                resolve(`data:image/jpeg;base64,${imgBuffer.toString("base64")}`);
            } else {
                reject(new Error(`Failed to extract frame at ${timeSec}s (exit code ${code}): ${errorMsg.slice(-300)}`));
            }
        });

        // Write buffer in chunks
        const CHUNK_SIZE = 64 * 1024;
        let offset = 0;

        const writeChunk = () => {
            if (stdinClosed || offset >= videoBuffer.length) {
                if (!stdinClosed) {
                    ff.stdin.end();
                    stdinClosed = true;
                }
                return;
            }

            const chunk = videoBuffer.slice(offset, Math.min(offset + CHUNK_SIZE, videoBuffer.length));
            offset += chunk.length;

            const canContinue = ff.stdin.write(chunk);

            if (canContinue) {
                writeChunk();
            } else {
                ff.stdin.once('drain', writeChunk);
            }
        };

        writeChunk();
    });
}


export async function sampleMultipleFrames(
    videoBuffer: Buffer,
    numFrames: number = 4,
    maxDimension: number = 1024
): Promise<string[]> {
    const metadata = await getVideoMetadata(videoBuffer);

    if (metadata.duration === 0) {
        throw new Error("Could not determine video duration");
    }

    // Sample at evenly spaced intervals, avoiding very start/end
    const interval = metadata.duration / (numFrames + 1);
    const times = Array.from({ length: numFrames }, (_, i) => (i + 1) * interval);

    const frames = await Promise.all(
        times.map(time => sampleFrameBase64FromBuffer(videoBuffer, time, maxDimension))
    );

    return frames;
}

/**
 * Sample frames based on scene changes (most information-dense approach)
 * Returns timestamps and base64 images
 */
export async function sampleFramesOnSceneChange(
    videoBuffer: Buffer,
    maxFrames: number = 8,
    maxDimension: number = 1024,
    sceneThreshold: number = 0.3  // 0.0-1.0, lower = more sensitive
): Promise<Array<{ timestamp: number; image: string }>> {
    // First pass: detect scene changes
    const args1 = [
        "-i", "pipe:0",
        "-vf", `select='gt(scene,${sceneThreshold})',showinfo`,
        "-f", "null",
        "-"
    ];

    const ff1 = spawn(ffmpegPath!, args1, { stdio: ["pipe", "pipe", "pipe"] });
    ff1.stdin.write(videoBuffer);
    ff1.stdin.end();

    const stderr: Buffer[] = [];
    ff1.stderr.on("data", (chunk) => stderr.push(chunk));

    await new Promise<void>((resolve) => {
        ff1.on("close", () => resolve());
    });

    // Parse timestamps from showinfo output
    const output = Buffer.concat(stderr).toString();
    const timestamps: number[] = [];
    const regex = /pts_time:([\d.]+)/g;
    let match;

    while ((match = regex.exec(output)) !== null) {
        timestamps.push(parseFloat(match[1]));
        if (timestamps.length >= maxFrames) break;
    }

    // If no scene changes detected, fall back to even spacing
    if (timestamps.length === 0) {
        const metadata = await getVideoMetadata(videoBuffer);
        const interval = metadata.duration / (maxFrames + 1);
        for (let i = 1; i <= maxFrames; i++) {
            timestamps.push(i * interval);
        }
    }

    // Extract frames at detected timestamps
    const results = await Promise.all(
        timestamps.map(async (ts) => ({
            timestamp: ts,
            image: await sampleFrameBase64FromBuffer(videoBuffer, ts, maxDimension)
        }))
    );

    return results;
}