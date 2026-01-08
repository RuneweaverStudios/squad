import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { webSocketPlugin } from './src/lib/server/websocket/vitePlugin';
import { execSync } from 'child_process';

// Get git commit info at build time
function getGitCommitSha(): string {
	try {
		return execSync('git rev-parse HEAD').toString().trim();
	} catch {
		return 'unknown';
	}
}

function getGitCommitShort(): string {
	try {
		return execSync('git rev-parse --short HEAD').toString().trim();
	} catch {
		return 'dev';
	}
}

const commitSha = getGitCommitSha();
const commitShort = getGitCommitShort();
const buildTimestamp = new Date().toISOString();
const buildDate = new Date().toLocaleDateString('en-US', {
	month: 'short',
	day: 'numeric',
	year: 'numeric'
});

export default defineConfig({
	define: {
		__BUILD_COMMIT_SHA__: JSON.stringify(commitSha),
		__BUILD_COMMIT_SHORT__: JSON.stringify(commitShort),
		__BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
		__BUILD_DATE__: JSON.stringify(buildDate)
	},
	plugins: [sveltekit(), webSocketPlugin()],
	server: {
		port: 3333,
		strictPort: true,
		host: '127.0.0.1'
	}
});
