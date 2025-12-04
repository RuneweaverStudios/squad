/**
 * Convert ANSI escape codes to HTML spans with inline styles
 * Supports common color codes used by Claude Code / terminal output
 * Includes automatic contrast adjustment for background colors
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

/**
 * Parse a hex color string to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result
		? {
				r: parseInt(result[1], 16),
				g: parseInt(result[2], 16),
				b: parseInt(result[3], 16),
			}
		: null;
}

/**
 * Calculate relative luminance of a color (WCAG formula)
 * Returns value between 0 (black) and 1 (white)
 */
function getLuminance(r: number, g: number, b: number): number {
	const [rs, gs, bs] = [r, g, b].map((c) => {
		c = c / 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors (WCAG formula)
 * Returns ratio from 1 (same color) to 21 (black vs white)
 */
function getContrastRatio(
	fg: { r: number; g: number; b: number },
	bg: { r: number; g: number; b: number }
): number {
	const fgLum = getLuminance(fg.r, fg.g, fg.b);
	const bgLum = getLuminance(bg.r, bg.g, bg.b);
	const lighter = Math.max(fgLum, bgLum);
	const darker = Math.min(fgLum, bgLum);
	return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Get a contrasting foreground color for a given background
 * Uses WCAG 4.5:1 contrast ratio as minimum threshold
 */
function getContrastingForeground(bgColor: string, currentFg: string | null): string | null {
	const bg = hexToRgb(bgColor);
	if (!bg) return currentFg;

	// If we have a foreground color, check if it has sufficient contrast
	if (currentFg) {
		const fg = hexToRgb(currentFg);
		if (fg && getContrastRatio(fg, bg) >= 4.5) {
			return currentFg; // Current foreground is fine
		}
	}

	// Calculate background luminance to determine if we need light or dark text
	const bgLum = getLuminance(bg.r, bg.g, bg.b);

	// Dark backgrounds (luminance < 0.5) need light text
	// Light backgrounds (luminance >= 0.5) need dark text
	// Using a slightly lower threshold (0.4) to be more aggressive about dark text on mid-tones
	if (bgLum < 0.4) {
		return '#ffffff'; // White text on dark backgrounds
	} else {
		return '#1a1a1a'; // Near-black text on light backgrounds
	}
}

interface AnsiState {
	bold: boolean;
	dim: boolean;
	italic: boolean;
	underline: boolean;
	reverse: boolean;
	color: string | null;
	bgColor: string | null;
}

/**
 * Parse ANSI codes and update state
 * Handles both single codes and extended color sequences (38;2;R;G;B and 48;2;R;G;B)
 * @param codes - Array of code strings from the escape sequence
 * @param state - Current ANSI state to update
 */
function parseAnsiCodes(codes: string[], state: AnsiState): void {
	let i = 0;
	while (i < codes.length) {
		const num = parseInt(codes[i], 10);

		// Check for 24-bit color codes: 38;2;R;G;B (foreground) or 48;2;R;G;B (background)
		if ((num === 38 || num === 48) && codes[i + 1] === '2' && i + 4 < codes.length) {
			const r = parseInt(codes[i + 2], 10);
			const g = parseInt(codes[i + 3], 10);
			const b = parseInt(codes[i + 4], 10);

			if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
				const color = `rgb(${r},${g},${b})`;
				if (num === 38) {
					state.color = color;
				} else {
					state.bgColor = color;
				}
				i += 5; // Skip 38/48, 2, R, G, B
				continue;
			}
		}

		// Check for 256-color codes: 38;5;N (foreground) or 48;5;N (background)
		if ((num === 38 || num === 48) && codes[i + 1] === '5' && i + 2 < codes.length) {
			const colorIndex = parseInt(codes[i + 2], 10);
			if (!isNaN(colorIndex)) {
				const color = get256Color(colorIndex);
				if (num === 38) {
					state.color = color;
				} else {
					state.bgColor = color;
				}
				i += 3; // Skip 38/48, 5, N
				continue;
			}
		}

		// Standard single-code handling
		if (num === 0) {
			// Reset all
			state.bold = false;
			state.dim = false;
			state.italic = false;
			state.underline = false;
			state.reverse = false;
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
		} else if (num === 7) {
			state.reverse = true;
		} else if (num === 22) {
			state.bold = false;
			state.dim = false;
		} else if (num === 23) {
			state.italic = false;
		} else if (num === 24) {
			state.underline = false;
		} else if (num === 27) {
			state.reverse = false;
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

		i++;
	}
}

/**
 * Convert 256-color palette index to CSS color
 * 0-7: Standard colors, 8-15: Bright colors
 * 16-231: 6x6x6 color cube, 232-255: Grayscale
 */
function get256Color(index: number): string {
	if (index < 8) {
		// Standard colors
		const colors = ['#000000', '#cd0000', '#00cd00', '#cdcd00', '#0000cd', '#cd00cd', '#00cdcd', '#e5e5e5'];
		return colors[index];
	} else if (index < 16) {
		// Bright colors
		const colors = ['#7f7f7f', '#ff0000', '#00ff00', '#ffff00', '#5c5cff', '#ff00ff', '#00ffff', '#ffffff'];
		return colors[index - 8];
	} else if (index < 232) {
		// 6x6x6 color cube
		const i = index - 16;
		const r = Math.floor(i / 36);
		const g = Math.floor((i % 36) / 6);
		const b = i % 6;
		const toHex = (n: number) => (n === 0 ? 0 : 55 + n * 40);
		return `rgb(${toHex(r)},${toHex(g)},${toHex(b)})`;
	} else {
		// Grayscale (232-255 -> 24 shades)
		const gray = (index - 232) * 10 + 8;
		return `rgb(${gray},${gray},${gray})`;
	}
}

function stateToStyle(state: AnsiState): string {
	const styles: string[] = [];

	// Handle reverse video by swapping foreground and background
	let fgColor = state.color;
	let bgColor = state.bgColor;
	if (state.reverse) {
		// Swap fg and bg colors
		const temp = fgColor;
		fgColor = bgColor || '#1a1a1a'; // Default bg if none set
		bgColor = temp || '#ecf0f1'; // Default fg if none set
	}

	// When background color is set, ensure foreground has sufficient contrast
	if (bgColor) {
		styles.push(`background-color:${bgColor}`);
		// Get a contrasting foreground color (either the current one if sufficient, or auto-selected)
		const contrastingFg = getContrastingForeground(bgColor, fgColor);
		if (contrastingFg) {
			styles.push(`color:${contrastingFg}`);
		}
	} else if (fgColor) {
		// No background, just use the specified foreground color
		styles.push(`color:${fgColor}`);
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
	// First, strip cursor show/hide sequences (ESC[?25l and ESC[?25h)
	// These are output by chafa and other terminal tools but not needed in HTML
	input = input.replace(/\x1b\[\?25[lh]/g, '');

	// Match ANSI escape sequences: ESC[ followed by numbers and 'm'
	const ansiRegex = /\x1b\[([0-9;]*)m/g;

	const state: AnsiState = {
		bold: false,
		dim: false,
		italic: false,
		underline: false,
		reverse: false,
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
		// Uses parseAnsiCodes which handles extended color sequences (24-bit RGB, 256-color)
		const codes = match[1].split(';').filter(c => c !== '');
		parseAnsiCodes(codes, state);

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
