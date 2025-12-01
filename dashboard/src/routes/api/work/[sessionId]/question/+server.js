/**
 * API endpoint to get active question data for a Claude Code session
 *
 * GET /api/work/[sessionId]/question
 *
 * The sessionId parameter is the tmux session name (e.g., "jat-WisePrairie")
 *
 * Returns the current AskUserQuestion prompt data if one is active,
 * or { active: false } if no question is pending.
 *
 * The hook log-tool-activity.sh writes question data to:
 * /tmp/claude-question-tmux-{tmuxSessionName}.json
 */

import { json } from '@sveltejs/kit';
import { readFileSync, existsSync, statSync, unlinkSync } from 'fs';

export async function GET({ params }) {
	const { sessionId } = params;

	if (!sessionId) {
		return json({ error: 'Session ID required' }, { status: 400 });
	}

	// Look for question file by tmux session name
	const questionFile = `/tmp/claude-question-tmux-${sessionId}.json`;

	try {
		if (!existsSync(questionFile)) {
			return json({ active: false });
		}

		// Check file age - questions older than 5 minutes are stale
		const stats = statSync(questionFile);
		const ageMs = Date.now() - stats.mtimeMs;
		const maxAgeMs = 5 * 60 * 1000; // 5 minutes

		if (ageMs > maxAgeMs) {
			// Clean up stale file
			try {
				unlinkSync(questionFile);
			} catch (e) {
				// Ignore cleanup errors
			}
			return json({ active: false, stale: true });
		}

		const content = readFileSync(questionFile, 'utf-8');
		const questionData = JSON.parse(content);

		return json({
			active: true,
			session_id: questionData.session_id,
			tmux_session: questionData.tmux_session,
			timestamp: questionData.timestamp,
			questions: questionData.questions || []
		});
	} catch (error) {
		console.error('Error reading question file:', error);
		return json({ active: false, error: error.message });
	}
}

/**
 * DELETE /api/work/[sessionId]/question
 *
 * Clears the question file after user answers (called by dashboard after selection)
 */
export async function DELETE({ params }) {
	const { sessionId } = params;

	if (!sessionId) {
		return json({ error: 'Session ID required' }, { status: 400 });
	}

	// Use tmux session name to find the file
	const questionFile = `/tmp/claude-question-tmux-${sessionId}.json`;

	try {
		if (existsSync(questionFile)) {
			unlinkSync(questionFile);
		}
		return json({ success: true });
	} catch (error) {
		console.error('Error deleting question file:', error);
		return json({ success: false, error: error.message });
	}
}
