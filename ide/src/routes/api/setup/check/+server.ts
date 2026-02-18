import { json } from '@sveltejs/kit';
import { execSync } from 'child_process';
import { platform } from 'os';

interface PrerequisiteCheck {
	name: string;
	installed: boolean;
	version: string | null;
	required: boolean;
	fixHint: string;
}

function checkTool(name: string, versionCmd: string): { installed: boolean; version: string | null } {
	try {
		const output = execSync(versionCmd, { timeout: 5000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
		// Extract version number from output
		const versionMatch = output.match(/(\d+\.\d+[\.\d]*)/);
		return { installed: true, version: versionMatch ? versionMatch[1] : output.split('\n')[0].slice(0, 30) };
	} catch {
		return { installed: false, version: null };
	}
}

function getFixHint(name: string, plat: string): string {
	const isMac = plat === 'darwin';
	const hints: Record<string, string> = {
		tmux: isMac ? 'brew install tmux' : 'sudo apt install -y tmux',
		sqlite3: isMac ? 'brew install sqlite' : 'sudo apt install -y sqlite3',
		jq: isMac ? 'brew install jq' : 'sudo apt install -y jq',
		git: isMac ? 'brew install git' : 'sudo apt install -y git',
		st: 'curl -sSL https://raw.githubusercontent.com/joewinke/squad/master/tools/scripts/bootstrap.sh | bash',
		node: isMac ? 'brew install node' : 'sudo apt install -y nodejs npm'
	};
	return hints[name] || `Install ${name}`;
}

export async function GET() {
	const plat = platform();

	const tools: Array<{ name: string; cmd: string; required: boolean }> = [
		{ name: 'tmux', cmd: 'tmux -V', required: true },
		{ name: 'sqlite3', cmd: 'sqlite3 --version', required: true },
		{ name: 'jq', cmd: 'jq --version', required: true },
		{ name: 'git', cmd: 'git --version', required: true },
		{ name: 'st', cmd: 'st --version', required: true },
		{ name: 'node', cmd: 'node --version', required: false }
	];

	const checks: PrerequisiteCheck[] = tools.map(tool => {
		const result = checkTool(tool.name, tool.cmd);
		return {
			name: tool.name,
			installed: result.installed,
			version: result.version,
			required: tool.required,
			fixHint: getFixHint(tool.name, plat)
		};
	});

	const allRequiredPassed = checks.filter(c => c.required).every(c => c.installed);

	return json({
		checks,
		allRequiredPassed,
		platform: plat
	});
}
