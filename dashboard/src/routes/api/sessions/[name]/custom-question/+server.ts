/**
 * Custom Question Signal API - Read/clear jat-signal question data
 *
 * This endpoint handles custom question signals emitted by agents via:
 *   jat-signal question '{"question":"...","questionType":"...","options":[...]}'
 *
 * The PostToolUse hook (post-bash-jat-signal.sh) writes these to:
 *   /tmp/jat-question-{sessionId}.json
 *   /tmp/jat-question-tmux-{tmuxSessionName}.json
 *
 * GET /api/sessions/[name]/custom-question
 *   Returns the current custom question if one is active, or { active: false }
 *
 * DELETE /api/sessions/[name]/custom-question
 *   Clears the question file after user answers
 *
 * Note: The [name] parameter is the tmux session name (e.g., "jat-WisePrairie")
 *
 * This is separate from /api/work/[sessionId]/question which handles
 * AskUserQuestion tool calls captured by pre-ask-user-question.sh hook.
 */

import { json } from '@sveltejs/kit';
import { readFileSync, existsSync, statSync, unlinkSync } from 'fs';
import type { RequestHandler } from './$types';

interface QuestionOption {
	label: string;
	value?: string;
	description?: string;
}

interface CustomQuestionData {
	session_id: string;
	tmux_session: string;
	timestamp: string;
	question: string;
	questionType: 'choice' | 'confirm' | 'input';
	options?: QuestionOption[];
	timeout?: number | null;
}

export const GET: RequestHandler = async ({ params }) => {
	const sessionName = params.name;

	if (!sessionName) {
		return json({ error: 'Session name required' }, { status: 400 });
	}

	// Look for question file by tmux session name
	// The hook writes to /tmp/jat-question-tmux-{sessionName}.json
	const questionFile = `/tmp/jat-question-tmux-${sessionName}.json`;

	try {
		if (!existsSync(questionFile)) {
			return json({ active: false });
		}

		// Check file age - questions older than 5 minutes are considered stale
		const stats = statSync(questionFile);
		const ageMs = Date.now() - stats.mtimeMs;
		const maxAgeMs = 5 * 60 * 1000; // 5 minutes

		if (ageMs > maxAgeMs) {
			// Clean up stale file
			try {
				unlinkSync(questionFile);
			} catch {
				// Ignore cleanup errors
			}
			return json({ active: false, stale: true });
		}

		const content = readFileSync(questionFile, 'utf-8');
		const questionData: CustomQuestionData = JSON.parse(content);

		// Validate required fields
		if (!questionData.question || !questionData.questionType) {
			return json({
				active: false,
				error: 'Invalid question data: missing question or questionType'
			});
		}

		return json({
			active: true,
			sessionName,
			session_id: questionData.session_id,
			tmux_session: questionData.tmux_session,
			timestamp: questionData.timestamp,
			question: questionData.question,
			questionType: questionData.questionType,
			options: questionData.options || [],
			timeout: questionData.timeout || null,
			fileAgeMs: ageMs
		});
	} catch (error) {
		console.error('Error reading custom question file:', error);
		return json({
			active: false,
			error: error instanceof Error ? error.message : String(error)
		});
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const sessionName = params.name;

	if (!sessionName) {
		return json({ error: 'Session name required' }, { status: 400 });
	}

	// The hook writes to /tmp/jat-question-tmux-{sessionName}.json
	const questionFile = `/tmp/jat-question-tmux-${sessionName}.json`;

	try {
		if (existsSync(questionFile)) {
			unlinkSync(questionFile);
		}

		// Also try to clean up session ID based file if we can find it
		// This handles cases where the session ID is in the filename
		// The hook also writes to /tmp/jat-question-{sessionId}.json
		// but we don't have the session ID here, so we only clean the tmux file

		return json({ success: true, sessionName });
	} catch (error) {
		console.error('Error deleting custom question file:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : String(error)
		});
	}
};
