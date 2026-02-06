import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { webSocketPlugin } from './src/lib/server/websocket/vitePlugin';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// HTTPS configuration for dev:https mode only
// Certificates are generated via: npm run certs:generate
// Only returns config when --https flag is passed (npm run dev:https),
// NOT when certs merely exist on disk (npm run dev should stay HTTP)
function getHttpsConfig(): { key: Buffer; cert: Buffer } | undefined {
	const wantsHttps = process.argv.includes('--https');
	if (!wantsHttps) return undefined;

	const certPath = resolve(__dirname, 'certs', 'localhost.pem');
	const keyPath = resolve(__dirname, 'certs', 'localhost-key.pem');

	if (existsSync(certPath) && existsSync(keyPath)) {
		return {
			key: readFileSync(keyPath),
			cert: readFileSync(certPath)
		};
	}

	// Certificates not found - will use Vite's auto-generated certs if --https is passed
	return undefined;
}

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
		host: '127.0.0.1',
		https: getHttpsConfig()
	}
});
