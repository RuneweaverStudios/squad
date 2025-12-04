<script lang="ts">
	/**
	 * VoiceInput Component
	 * A compact mic button that uses LOCAL whisper.cpp for speech-to-text.
	 *
	 * Features:
	 * - Simple mic button that toggles recording
	 * - Uses MediaRecorder API to capture audio
	 * - Sends to local /api/transcribe (whisper.cpp)
	 * - 100% local - no data leaves your machine
	 * - Visual feedback for recording and processing states
	 */

	import { onMount, onDestroy } from 'svelte';
	import { playRecordingStartSound, playRecordingStopSound } from '$lib/utils/soundEffects';

	type SizeType = 'sm' | 'md' | 'lg';

	// Props - include event handlers as they're passed as props in Svelte 5
	interface VoiceInputProps {
		disabled?: boolean;
		size?: SizeType;
		ontranscription?: (event: CustomEvent<string>) => void;
		onerror?: (event: CustomEvent<string>) => void;
		onstart?: () => void;
		onend?: () => void;
	}

	let {
		disabled = false,
		size = 'sm',
		ontranscription,
		onerror,
		onstart,
		onend
	}: VoiceInputProps = $props();

	// State
	let isRecording = $state(false);
	let isProcessing = $state(false);
	let isSupported = $state(false);
	let isWhisperAvailable = $state(false);
	let statusText = $state('');
	let isStartingAnimation = $state(false);
	let isStoppingAnimation = $state(false);

	// MediaRecorder state
	let mediaRecorder: MediaRecorder | null = null;
	let audioChunks: Blob[] = [];
	let stream: MediaStream | null = null;

	// Size mappings
	const sizeClasses: Record<SizeType, string> = {
		sm: 'btn-xs',
		md: 'btn-sm',
		lg: 'btn-md'
	};

	const iconSizes: Record<SizeType, number> = {
		sm: 14,
		md: 16,
		lg: 20
	};

	// Check for MediaRecorder support and whisper availability
	onMount(async () => {
		isSupported = typeof MediaRecorder !== 'undefined' && navigator.mediaDevices?.getUserMedia !== undefined;

		// Check if whisper backend is available
		if (isSupported) {
			try {
				const response = await fetch('/api/transcribe');
				if (response.ok) {
					const data = await response.json();
					isWhisperAvailable = data.status === 'ok' && data.model_exists === true;
				}
			} catch {
				// API not available or whisper not installed
				isWhisperAvailable = false;
			}
		}
	});

	// Cleanup
	onDestroy(() => {
		stopRecording();
		if (stream) {
			stream.getTracks().forEach(track => track.stop());
		}
	});

	// Start recording
	async function startRecording() {
		if (disabled || isRecording || isProcessing) return;

		try {
			// Request microphone access
			stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					channelCount: 1,
					sampleRate: 16000,
					echoCancellation: true,
					noiseSuppression: true
				}
			});

			// Create MediaRecorder
			// Try webm/opus first (best quality), fall back to webm
			const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
				? 'audio/webm;codecs=opus'
				: 'audio/webm';

			mediaRecorder = new MediaRecorder(stream, { mimeType });
			audioChunks = [];

			mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					audioChunks.push(event.data);
				}
			};

			mediaRecorder.onstop = async () => {
				// Process the recorded audio
				await processAudio();
			};

			mediaRecorder.onerror = (event) => {
				console.error('MediaRecorder error:', event);
				isRecording = false;
				statusText = '';
				onerror?.(new CustomEvent('error', { detail: 'Recording failed' }));
			};

			// Start recording with animation
			isStartingAnimation = true;
			setTimeout(() => {
				isStartingAnimation = false;
			}, 400);

			mediaRecorder.start();
			isRecording = true;
			statusText = 'Recording...';
			playRecordingStartSound();
			onstart?.();

		} catch (err: any) {
			console.error('Failed to start recording:', err);

			let errorMessage = 'Failed to start recording';
			if (err.name === 'NotAllowedError') {
				errorMessage = 'Microphone access denied. Please allow microphone access.';
			} else if (err.name === 'NotFoundError') {
				errorMessage = 'No microphone found. Please check your settings.';
			}

			onerror?.(new CustomEvent('error', { detail: errorMessage }));
		}
	}

	// Stop recording
	function stopRecording() {
		if (mediaRecorder && mediaRecorder.state !== 'inactive') {
			mediaRecorder.stop();
		}
		if (isRecording) {
			// Trigger stop animation
			isStoppingAnimation = true;
			setTimeout(() => {
				isStoppingAnimation = false;
			}, 400);
			playRecordingStopSound();
		}
		isRecording = false;

		// Stop all tracks
		if (stream) {
			stream.getTracks().forEach(track => track.stop());
			stream = null;
		}
	}

	// Timeout for transcription API calls (2.5 minutes to allow for longer recordings)
	// Server has 2 minute timeout, client needs slightly more to receive timeout response
	const TRANSCRIPTION_TIMEOUT_MS = 150000;

	// Process recorded audio through local whisper
	async function processAudio() {
		if (audioChunks.length === 0) {
			statusText = '';
			onend?.();
			return;
		}

		isProcessing = true;
		statusText = 'Processing...';

		// Create AbortController for timeout
		const abortController = new AbortController();
		const timeoutId = setTimeout(() => {
			abortController.abort();
		}, TRANSCRIPTION_TIMEOUT_MS);

		try {
			// Create blob from chunks
			const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
			audioChunks = [];

			// Create form data
			const formData = new FormData();
			formData.append('audio', audioBlob, 'recording.webm');

			// Send to local transcription API with abort signal for timeout
			const response = await fetch('/api/transcribe', {
				method: 'POST',
				body: formData,
				signal: abortController.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Transcription failed');
			}

			const data = await response.json();
			const text = data.text?.trim();

			if (text) {
				ontranscription?.(new CustomEvent('transcription', { detail: text }));
			} else {
				onerror?.(new CustomEvent('error', { detail: 'No speech detected' }));
			}

		} catch (err: any) {
			clearTimeout(timeoutId);
			console.error('Transcription error:', err);

			// Provide more helpful error messages
			let errorMessage = err.message || 'Transcription failed';
			if (err.name === 'AbortError') {
				errorMessage = 'Transcription timed out. Try a shorter recording.';
			} else if (errorMessage.includes('timed out')) {
				errorMessage = 'Transcription timed out. The recording may be too long.';
			}

			onerror?.(new CustomEvent('error', { detail: errorMessage }));
		} finally {
			isProcessing = false;
			statusText = '';
			onend?.();
		}
	}

	// Toggle recording
	function toggleRecording() {
		if (disabled || isProcessing) return;

		if (isRecording) {
			stopRecording();
		} else {
			startRecording();
		}
	}

	// Handle keyboard
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			toggleRecording();
		}
	}
</script>

{#if isSupported && isWhisperAvailable}
	<div class="relative inline-flex items-center gap-1 -mt-3">
		<button
			type="button"
			class="btn btn-circle {sizeClasses[size]} {isRecording ? 'btn-error animate-pulse' : isProcessing ? 'btn-warning' : 'btn-ghost'} transition-all duration-200"
			onclick={toggleRecording}
			onkeydown={handleKeydown}
			disabled={disabled || isProcessing}
			title={isProcessing ? 'Processing...' : isRecording ? 'Stop recording' : 'Start voice input (local whisper)'}
			aria-label={isProcessing ? 'Processing...' : isRecording ? 'Stop recording' : 'Start voice input'}
		>
			{#if isProcessing}
				<!-- Spinner while processing -->
				<span class="loading loading-spinner" style="width: {iconSizes[size]}px; height: {iconSizes[size]}px;"></span>
			{:else if isRecording}
				<!-- Stop icon when recording -->
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="currentColor"
					viewBox="0 0 24 24"
					class="text-error-content transition-transform duration-200"
					class:mic-stop-animate={isStoppingAnimation}
					style="width: {iconSizes[size]}px; height: {iconSizes[size]}px;"
				>
					<rect x="6" y="6" width="12" height="12" rx="1" />
				</svg>
			{:else}
				<!-- Mic icon (Heroicons) -->
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="transition-transform duration-200"
					class:mic-start-animate={isStartingAnimation}
					style="width: {iconSizes[size]}px; height: {iconSizes[size]}px;"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
				</svg>
			{/if}
		</button>

		<!-- Status text indicator -->
		{#if statusText}
			<span class="text-xs italic text-base-content/60 max-w-32 truncate">
				{statusText}
			</span>
		{/if}
	</div>
{:else if !isSupported}
	<!-- Browser doesn't support MediaRecorder - show disabled button with explanation -->
	<div
		class="tooltip tooltip-left"
		data-tip="Voice input not supported in this browser."
	>
		<button
			type="button"
			class="btn btn-circle {sizeClasses[size]} btn-ghost btn-disabled opacity-50"
			disabled
			aria-label="Voice input not supported"
		>
			<!-- Mic icon (Heroicons) -->
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				style="width: {iconSizes[size]}px; height: {iconSizes[size]}px;"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
			</svg>
		</button>
	</div>
{/if}
<!-- Note: If whisper is not installed (isSupported && !isWhisperAvailable), nothing renders.
     This is intentional - users without whisper won't see a confusing disabled button. -->

<style>
	/* Recording start animation - mic icon grows and pulses when starting */
	.mic-start-animate {
		animation: mic-start-pulse 0.35s cubic-bezier(0.4, 0, 0.2, 1);
	}

	@keyframes mic-start-pulse {
		0% {
			transform: scale(1);
		}
		40% {
			transform: scale(1.4);
		}
		100% {
			transform: scale(1);
		}
	}

	/* Recording stop animation - stop icon shrinks when stopping */
	.mic-stop-animate {
		animation: mic-stop-shrink 0.35s cubic-bezier(0.4, 0, 0.2, 1);
	}

	@keyframes mic-stop-shrink {
		0% {
			transform: scale(1);
		}
		40% {
			transform: scale(0.7);
		}
		100% {
			transform: scale(1);
		}
	}
</style>
