/**
 * Shell Detection Patterns
 *
 * Shared patterns for detecting Claude Code readiness and shell prompts.
 * Used by session spawn/restart APIs to determine when Claude Code TUI
 * is ready to receive commands.
 */

/**
 * Patterns indicating Claude Code TUI is running and ready for input.
 * Match any of these in terminal output = Claude is ready.
 */
export const CLAUDE_READY_PATTERNS = [
	'Claude Code',
	'╭',
	'> ',
	'claude-opus',
	'claude-sonnet',
	'Opus',
	'Sonnet',
	'Type to stream'
];

/**
 * Patterns indicating OpenCode TUI is running and ready for input.
 * OpenCode has a different UI than Claude Code.
 */
export const OPENCODE_READY_PATTERNS = [
	'opencode',
	'opencode>',
	'Type a message',
	'Assistant',
	'Model:',
	'Session:',
	'▄',	// Part of OpenCode ASCII art banner
	'█▀▀█'  // Part of OpenCode ASCII art banner
];

/**
 * Patterns indicating Codex CLI is running and ready for input.
 * Codex CLI is OpenAI's terminal coding agent.
 */
export const CODEX_READY_PATTERNS = [
	'codex>',
	'Codex',
	'gpt-',           // Model names like gpt-5.1-codex
	'o3',             // O3 model
	'o4-mini',        // O4-mini model
	'[sandbox]',      // Sandbox mode indicator
	'What can I help', // Welcome prompt
	'Enter a prompt',  // Input prompt
	'Type your',       // Generic input prompt
];

/**
 * Patterns indicating Gemini CLI is running and ready for input.
 * Gemini CLI is Google's terminal coding agent.
 * @see https://geminicli.com/
 */
export const GEMINI_CLI_READY_PATTERNS = [
	'gemini>',
	'Gemini',
	'gemini-2',        // Model names like gemini-2.0-flash
	'gemini-pro',      // Gemini Pro model
	'gemini-flash',    // Gemini Flash model
	'Google AI',       // Provider indicator
	'What can I help', // Welcome prompt
	'Enter a prompt',  // Input prompt
	'Type your',       // Generic input prompt
	'✨',              // Gemini often uses sparkle emoji in prompts
];

/**
 * Patterns indicating Pi coding agent is running and ready for input.
 * Pi is a minimal terminal coding agent from pi.dev (badlogic/pi-mono).
 * @see https://pi.dev/
 */
export const PI_READY_PATTERNS = [
	'pi>',
	'pi ',              // Pi prompt
	'Pi ',              // Capitalized in some outputs
	'ready',            // Pi shows "ready" when initialized
	'Type a message',   // Input prompt
	'Enter a prompt',   // Input prompt variant
	'/model',           // Command hint visible in UI
	'/new',             // Command hint visible in UI
	'provider:',        // Provider display in status
];

/**
 * Get ready patterns for a specific agent command.
 */
export function getReadyPatternsForAgent(command: string): string[] {
	if (command === 'opencode') {
		return OPENCODE_READY_PATTERNS;
	}
	if (command === 'codex') {
		return CODEX_READY_PATTERNS;
	}
	if (command === 'gemini') {
		return GEMINI_CLI_READY_PATTERNS;
	}
	if (command === 'pi') {
		return PI_READY_PATTERNS;
	}
	// Default to Claude patterns
	return CLAUDE_READY_PATTERNS;
}

/**
 * Patterns indicating we're at a shell prompt (Claude hasn't started).
 * Used to detect when Claude Code failed to start and we're stuck at bash/zsh.
 *
 * IMPORTANT: Only consider these as shell prompt if:
 * 1. Output does NOT contain 'claude' (case-insensitive)
 * 2. Enough time has passed (>3-5 seconds)
 *
 * This prevents false positives during Claude startup sequence.
 */
export const SHELL_PROMPT_PATTERNS = [
	'-bash:',           // bash error prefix
	'$ ',               // common bash prompt
	'bash-',            // bash version prefix
	'❯',                // zsh/powerline prompt
	'➜',                // oh-my-zsh default
	'%',                // zsh default prompt
	' on ',             // starship/powerline "dir on branch" format
	'master [',         // git branch indicators
	'main [',           // git branch indicators
	'squad on',           // specific to this user's prompt
	'No such file or directory'  // bash error when command not found
];

/**
 * Patterns indicating the YOLO permission warning dialog is showing.
 * This dialog appears on first use of --dangerously-skip-permissions
 * and expects user to select "1. No" or "2. Yes, I understand".
 *
 * IMPORTANT: The old pattern list included 'dangerously-skip-permissions' which
 * caused false positives because that string appears in the COMMAND being run,
 * not just in the warning dialog. The new approach requires MULTIPLE patterns
 * that can ONLY appear together in the actual warning dialog.
 */
export const YOLO_WARNING_PATTERNS = [
	'bypass all permission checks',  // Warning text - specific to dialog
	'No, exit',                      // Option 1 text
	'Yes, I understand',             // Option 2 text
];

/**
 * Detect if the actual YOLO warning dialog is showing.
 *
 * Requires MULTIPLE patterns to match to avoid false positives.
 * The warning dialog contains:
 * - "bypass all permission checks" (the warning text)
 * - "Yes, I understand" OR "2. Yes" (the accept option)
 *
 * This prevents false matches when 'dangerously-skip-permissions' appears
 * in the command line or when numbered lists contain "2. Yes".
 */
export function isYoloWarningDialog(output: string): boolean {
	// Must have the warning text
	const hasWarningText = output.includes('bypass all permission checks');
	// Must have one of the accept option patterns
	const hasAcceptOption = output.includes('Yes, I understand') || output.includes('2. Yes');
	// Must have the reject option to confirm it's the full dialog
	const hasRejectOption = output.includes('No, exit') || output.includes('1. No');

	// All three conditions must be true for a real YOLO dialog
	return hasWarningText && hasAcceptOption && hasRejectOption;
}
