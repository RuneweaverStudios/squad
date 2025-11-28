/**
 * Convert ANSI escape codes to HTML spans with inline styles
 * Supports common color codes used by Claude Code / terminal output
 */

// ANSI color code to CSS color mapping
const ANSI_COLORS: Record<number, string> = {
	// Standard colors (30-37)
	30: '#1a1a1a', // Black
	31: '#e74c3c', // Red
	32: '#2ecc71', // Green
	33: '#f39c12', // Yellow
	34: '#3498db', // Blue
	35: '#9b59b6', // Magenta
	36: '#00bcd4', // Cyan
	37: '#ecf0f1', // White

	// Bright colors (90-97)
	90: '#636e72', // Bright Black (Gray)
	91: '#ff6b6b', // Bright Red
	92: '#55efc4', // Bright Green
	93: '#ffeaa7', // Bright Yellow
	94: '#74b9ff', // Bright Blue
	95: '#fd79a8', // Bright Magenta
	96: '#81ecec', // Bright Cyan
	97: '#ffffff', // Bright White
};

// Background colors (40-47, 100-107)
const ANSI_BG_COLORS: Record<number, string> = {
	40: '#1a1a1a',
	41: '#e74c3c',
	42: '#2ecc71',
	43: '#f39c12',
	44: '#3498db',
	45: '#9b59b6',
	46: '#00bcd4',
	47: '#ecf0f1',
	100: '#636e72',
	101: '#ff6b6b',
	102: '#55efc4',
	103: '#ffeaa7',
	104: '#74b9ff',
	105: '#fd79a8',
	106: '#81ecec',
	107: '#ffffff',
};

interface AnsiState {
	bold: boolean;
	dim: boolean;
	italic: boolean;
	underline: boolean;
	color: string | null;
	bgColor: string | null;
}

function parseAnsiCode(code: string, state: AnsiState): void {
	const num = parseInt(code, 10);

	if (num === 0) {
		// Reset all
		state.bold = false;
		state.dim = false;
		state.italic = false;
		state.underline = false;
		state.color = null;
		state.bgColor = null;
	} else if (num === 1) {
		state.bold = true;
	} else if (num === 2) {
		state.dim = true;
	} else if (num === 3) {
		state.italic = true;
	} else if (num === 4) {
		state.underline = true;
	} else if (num === 22) {
		state.bold = false;
		state.dim = false;
	} else if (num === 23) {
		state.italic = false;
	} else if (num === 24) {
		state.underline = false;
	} else if (num >= 30 && num <= 37) {
		state.color = ANSI_COLORS[num];
	} else if (num === 39) {
		state.color = null; // Default color
	} else if (num >= 40 && num <= 47) {
		state.bgColor = ANSI_BG_COLORS[num];
	} else if (num === 49) {
		state.bgColor = null; // Default background
	} else if (num >= 90 && num <= 97) {
		state.color = ANSI_COLORS[num];
	} else if (num >= 100 && num <= 107) {
		state.bgColor = ANSI_BG_COLORS[num];
	}
}

function stateToStyle(state: AnsiState): string {
	const styles: string[] = [];

	if (state.color) {
		styles.push(`color:${state.color}`);
	}
	if (state.bgColor) {
		styles.push(`background-color:${state.bgColor}`);
	}
	if (state.bold) {
		styles.push('font-weight:bold');
	}
	if (state.dim) {
		styles.push('opacity:0.6');
	}
	if (state.italic) {
		styles.push('font-style:italic');
	}
	if (state.underline) {
		styles.push('text-decoration:underline');
	}

	return styles.join(';');
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

/**
 * Convert a string containing ANSI escape codes to HTML
 */
export function ansiToHtml(input: string): string {
	// Match ANSI escape sequences: ESC[ followed by numbers and 'm'
	const ansiRegex = /\x1b\[([0-9;]*)m/g;

	const state: AnsiState = {
		bold: false,
		dim: false,
		italic: false,
		underline: false,
		color: null,
		bgColor: null,
	};

	let result = '';
	let lastIndex = 0;
	let inSpan = false;
	let match;

	while ((match = ansiRegex.exec(input)) !== null) {
		// Add text before this escape code
		const textBefore = input.slice(lastIndex, match.index);
		if (textBefore) {
			result += escapeHtml(textBefore);
		}

		// Close previous span if open
		if (inSpan) {
			result += '</span>';
			inSpan = false;
		}

		// Parse the ANSI codes (can be multiple separated by ;)
		const codes = match[1].split(';').filter(c => c !== '');
		for (const code of codes) {
			parseAnsiCode(code, state);
		}

		// Open new span if we have styles
		const style = stateToStyle(state);
		if (style) {
			result += `<span style="${style}">`;
			inSpan = true;
		}

		lastIndex = match.index + match[0].length;
	}

	// Add remaining text
	const remaining = input.slice(lastIndex);
	if (remaining) {
		result += escapeHtml(remaining);
	}

	// Close final span if open
	if (inSpan) {
		result += '</span>';
	}

	return result;
}

/**
 * Strip ANSI codes from a string (for plain text)
 */
export function stripAnsi(input: string): string {
	return input.replace(/\x1b\[[0-9;]*m/g, '');
}
