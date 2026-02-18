/**
 * Local Whisper Transcription API
 *
 * Uses whisper.cpp locally for speech-to-text transcription.
 * No data leaves the machine - 100% private.
 *
 * POST /api/transcribe
 * Body: FormData with 'audio' file (WAV, WebM, MP3, etc.)
 * Returns: { text: "transcribed text", duration_ms: 1234 }
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

// Whisper configuration - check squad path first, then fallback to chezwizper
const SQUAD_WHISPER_PATH = `${process.env.HOME}/.local/share/squad/whisper`;
const CHEZWIZPER_WHISPER_PATH = `${process.env.HOME}/.local/share/chezwizper/whisper`;

// Use squad installation if available, otherwise fall back to chezwizper
const WHISPER_PATH = existsSync(`${SQUAD_WHISPER_PATH}/build/bin/whisper-cli`)
	? SQUAD_WHISPER_PATH
	: CHEZWIZPER_WHISPER_PATH;

const WHISPER_CLI = `${WHISPER_PATH}/build/bin/whisper-cli`;
const WHISPER_MODEL = `${WHISPER_PATH}/models/ggml-large-v3-turbo-q5_1.bin`;

// Temp directory for audio files
const TEMP_DIR = join(tmpdir(), 'squad-transcribe');

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	const startTime = Date.now();

	try {
		// Ensure temp directory exists
		if (!existsSync(TEMP_DIR)) {
			await mkdir(TEMP_DIR, { recursive: true });
		}

		// Parse form data
		const formData = await request.formData();
		const audioFile = formData.get('audio');

		if (!audioFile || !(audioFile instanceof File)) {
			return json({ error: 'No audio file provided' }, { status: 400 });
		}

		// Generate unique filename
		const timestamp = Date.now();
		const inputPath = join(TEMP_DIR, `input-${timestamp}.webm`);
		const wavPath = join(TEMP_DIR, `input-${timestamp}.wav`);

		// Write uploaded audio to temp file
		const arrayBuffer = await audioFile.arrayBuffer();
		await writeFile(inputPath, Buffer.from(arrayBuffer));

		try {
			// Convert to WAV using ffmpeg (whisper needs specific format)
			// 16kHz mono is optimal for whisper
			await execAsync(`ffmpeg -y -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" 2>/dev/null`);

			// Run whisper-cli
			// -nt: no timestamps (we just want the text)
			// -np: no progress output
			// --no-prints: minimize output
			// Increased timeout to 120 seconds (2 minutes) for longer recordings
			// Large-v3-turbo model processes ~50-100 seconds of audio per minute on average hardware
			const { stdout, stderr } = await execAsync(
				`"${WHISPER_CLI}" -m "${WHISPER_MODEL}" -f "${wavPath}" -nt -np --no-prints -l en 2>/dev/null`,
				{ timeout: 120000 } // 120 second timeout (2 minutes)
			);

			// Parse output - whisper-cli outputs text directly
			const text = stdout.trim();

			const duration = Date.now() - startTime;

			return json({
				text,
				duration_ms: duration,
				model: 'large-v3-turbo-q5_1'
			});

		} finally {
			// Cleanup temp files
			try {
				await unlink(inputPath);
				await unlink(wavPath);
			} catch {
				// Ignore cleanup errors
			}
		}

	} catch (error) {
		console.error('Transcription error:', error);
		const err = error instanceof Error ? error : new Error(String(error));
		const execErr = /** @type {{ killed?: boolean }} */ (error);

		// Check for specific errors
		if (err.message?.includes('ENOENT') || err.message?.includes('not found')) {
			return json({
				error: 'Whisper not found. Is whisper.cpp installed?',
				details: err.message
			}, { status: 500 });
		}

		if (execErr.killed || err.message?.includes('timeout')) {
			return json({
				error: 'Transcription timed out',
				details: 'Audio may be too long or system is busy'
			}, { status: 504 });
		}

		return json({
			error: 'Transcription failed',
			details: err.message
		}, { status: 500 });
	}
}

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	// Health check - verify whisper is available
	try {
		const { stdout } = await execAsync(`"${WHISPER_CLI}" --help 2>&1 | head -1`);
		const modelExists = existsSync(WHISPER_MODEL);

		return json({
			status: 'ok',
			whisper_cli: WHISPER_CLI,
			model: WHISPER_MODEL,
			model_exists: modelExists,
			message: modelExists ? 'Whisper is ready' : 'Model not found'
		});
	} catch (error) {
		return json({
			status: 'error',
			whisper_cli: WHISPER_CLI,
			model: WHISPER_MODEL,
			error: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
