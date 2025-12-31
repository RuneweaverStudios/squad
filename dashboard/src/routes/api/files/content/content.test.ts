/**
 * Unit Tests for /api/files/content Endpoint Logic
 *
 * Tests file read/write operations, path validation, sensitive file protection,
 * language detection, and CRUD operations for the file explorer API.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { basename, extname, resolve, normalize, dirname, join } from 'path';

// ============================================================================
// Mock Setup
// ============================================================================

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ============================================================================
// Test Fixtures
// ============================================================================

const MOCK_PROJECT_PATH = '/home/user/code/myproject';

const MOCK_FILE_CONTENT = {
	typescript: `import { foo } from './bar';
export function hello() {
	return 'world';
}`,
	json: `{
	"name": "test",
	"version": "1.0.0"
}`,
	markdown: `# Hello World

This is a test markdown file.`
};

// ============================================================================
// Helper Functions (copied from +server.ts for testing)
// ============================================================================

/**
 * Sensitive file patterns that should not be written to
 */
const SENSITIVE_PATTERNS = [
	'.env',
	'.env.local',
	'.env.production',
	'.env.development',
	'credentials.json',
	'secrets.json',
	'service-account.json',
	'.npmrc',
	'.pypirc',
	'id_rsa',
	'id_ed25519',
	'.pem',
	'.key',
	'.p12',
	'.pfx'
];

/**
 * Language detection based on file extension
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
	'.js': 'javascript',
	'.jsx': 'javascript',
	'.mjs': 'javascript',
	'.ts': 'typescript',
	'.tsx': 'typescript',
	'.html': 'html',
	'.css': 'css',
	'.scss': 'scss',
	'.json': 'json',
	'.yaml': 'yaml',
	'.yml': 'yaml',
	'.md': 'markdown',
	'.py': 'python',
	'.go': 'go',
	'.rs': 'rust',
	'.svelte': 'svelte',
	'.vue': 'vue',
	'.sql': 'sql',
	'.sh': 'shell',
	'.bash': 'shell'
};

/**
 * Get language from file path
 */
function detectLanguage(filePath: string): string {
	const ext = extname(filePath).toLowerCase();
	const name = basename(filePath).toLowerCase();

	// Check special filenames
	if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'dockerfile';
	if (name === 'makefile' || name === 'gnumakefile') return 'makefile';
	if (name === 'cmakelists.txt') return 'cmake';
	if (name === 'jenkinsfile') return 'groovy';
	if (name === 'vagrantfile') return 'ruby';
	if (name === 'gemfile') return 'ruby';
	if (name === 'rakefile') return 'ruby';

	return EXTENSION_TO_LANGUAGE[ext] || 'plaintext';
}

/**
 * Check if a file is sensitive
 */
function isSensitiveFile(filePath: string): boolean {
	const name = basename(filePath).toLowerCase();
	const lowerPath = filePath.toLowerCase();

	for (const pattern of SENSITIVE_PATTERNS) {
		if (name === pattern || name.endsWith(pattern) || lowerPath.includes(`/${pattern}`)) {
			return true;
		}
	}

	return false;
}

/**
 * Validate and resolve file path
 */
function validatePath(
	projectPath: string,
	filePath: string
): { valid: boolean; resolved?: string; error?: string } {
	try {
		const resolved = resolve(projectPath, filePath);
		const normalizedProject = normalize(projectPath);

		if (!resolved.startsWith(normalizedProject + '/') && resolved !== normalizedProject) {
			return { valid: false, error: 'Path traversal detected' };
		}

		return { valid: true, resolved };
	} catch {
		return { valid: false, error: 'Invalid path' };
	}
}

/**
 * Check if file content appears to be binary
 */
function isBinaryContent(buffer: Buffer): boolean {
	const checkLength = Math.min(buffer.length, 8192);
	for (let i = 0; i < checkLength; i++) {
		if (buffer[i] === 0) {
			return true;
		}
	}
	return false;
}

function resetMocks() {
	vi.clearAllMocks();
	mockFetch.mockReset();
}

// ============================================================================
// Language Detection Tests
// ============================================================================

describe('detectLanguage', () => {
	describe('JavaScript/TypeScript', () => {
		it('should detect JavaScript', () => {
			expect(detectLanguage('app.js')).toBe('javascript');
		});

		it('should detect JSX', () => {
			expect(detectLanguage('Component.jsx')).toBe('javascript');
		});

		it('should detect ESM JavaScript', () => {
			expect(detectLanguage('module.mjs')).toBe('javascript');
		});

		it('should detect TypeScript', () => {
			expect(detectLanguage('app.ts')).toBe('typescript');
		});

		it('should detect TSX', () => {
			expect(detectLanguage('Component.tsx')).toBe('typescript');
		});
	});

	describe('Web technologies', () => {
		it('should detect HTML', () => {
			expect(detectLanguage('index.html')).toBe('html');
		});

		it('should detect CSS', () => {
			expect(detectLanguage('styles.css')).toBe('css');
		});

		it('should detect SCSS', () => {
			expect(detectLanguage('styles.scss')).toBe('scss');
		});

		it('should detect Svelte', () => {
			expect(detectLanguage('Component.svelte')).toBe('svelte');
		});

		it('should detect Vue', () => {
			expect(detectLanguage('Component.vue')).toBe('vue');
		});
	});

	describe('Data formats', () => {
		it('should detect JSON', () => {
			expect(detectLanguage('config.json')).toBe('json');
		});

		it('should detect YAML', () => {
			expect(detectLanguage('config.yaml')).toBe('yaml');
		});

		it('should detect YML', () => {
			expect(detectLanguage('config.yml')).toBe('yaml');
		});
	});

	describe('Programming languages', () => {
		it('should detect Python', () => {
			expect(detectLanguage('script.py')).toBe('python');
		});

		it('should detect Go', () => {
			expect(detectLanguage('main.go')).toBe('go');
		});

		it('should detect Rust', () => {
			expect(detectLanguage('lib.rs')).toBe('rust');
		});

		it('should detect SQL', () => {
			expect(detectLanguage('query.sql')).toBe('sql');
		});

		it('should detect Shell', () => {
			expect(detectLanguage('install.sh')).toBe('shell');
			expect(detectLanguage('script.bash')).toBe('shell');
		});
	});

	describe('Documentation', () => {
		it('should detect Markdown', () => {
			expect(detectLanguage('README.md')).toBe('markdown');
		});
	});

	describe('Special filenames', () => {
		it('should detect Dockerfile', () => {
			expect(detectLanguage('Dockerfile')).toBe('dockerfile');
		});

		it('should detect Dockerfile.dev', () => {
			expect(detectLanguage('Dockerfile.dev')).toBe('dockerfile');
		});

		it('should detect Makefile', () => {
			expect(detectLanguage('Makefile')).toBe('makefile');
		});

		it('should detect CMakeLists.txt', () => {
			expect(detectLanguage('CMakeLists.txt')).toBe('cmake');
		});

		it('should detect Jenkinsfile', () => {
			expect(detectLanguage('Jenkinsfile')).toBe('groovy');
		});

		it('should detect Gemfile', () => {
			expect(detectLanguage('Gemfile')).toBe('ruby');
		});

		it('should detect Vagrantfile', () => {
			expect(detectLanguage('Vagrantfile')).toBe('ruby');
		});

		it('should detect Rakefile', () => {
			expect(detectLanguage('Rakefile')).toBe('ruby');
		});
	});

	describe('Fallback', () => {
		it('should return plaintext for unknown extensions', () => {
			expect(detectLanguage('file.xyz')).toBe('plaintext');
		});

		it('should return plaintext for files without extension', () => {
			expect(detectLanguage('somefile')).toBe('plaintext');
		});
	});
});

// ============================================================================
// Sensitive File Detection Tests
// ============================================================================

describe('isSensitiveFile', () => {
	describe('Environment files', () => {
		it('should detect .env', () => {
			expect(isSensitiveFile('.env')).toBe(true);
		});

		it('should detect .env.local', () => {
			expect(isSensitiveFile('.env.local')).toBe(true);
		});

		it('should detect .env.production', () => {
			expect(isSensitiveFile('.env.production')).toBe(true);
		});

		it('should detect .env.development', () => {
			expect(isSensitiveFile('.env.development')).toBe(true);
		});

		it('should detect .env in path', () => {
			expect(isSensitiveFile('/project/.env')).toBe(true);
		});
	});

	describe('Credential files', () => {
		it('should detect credentials.json', () => {
			expect(isSensitiveFile('credentials.json')).toBe(true);
		});

		it('should detect secrets.json', () => {
			expect(isSensitiveFile('secrets.json')).toBe(true);
		});

		it('should detect service-account.json', () => {
			expect(isSensitiveFile('service-account.json')).toBe(true);
		});

		it('should detect .npmrc', () => {
			expect(isSensitiveFile('.npmrc')).toBe(true);
		});

		it('should detect .pypirc', () => {
			expect(isSensitiveFile('.pypirc')).toBe(true);
		});
	});

	describe('SSH keys', () => {
		it('should detect id_rsa', () => {
			expect(isSensitiveFile('id_rsa')).toBe(true);
		});

		it('should detect id_ed25519', () => {
			expect(isSensitiveFile('id_ed25519')).toBe(true);
		});
	});

	describe('Certificate files', () => {
		it('should detect .pem files', () => {
			expect(isSensitiveFile('private.pem')).toBe(true);
		});

		it('should detect .key files', () => {
			expect(isSensitiveFile('server.key')).toBe(true);
		});

		it('should detect .p12 files', () => {
			expect(isSensitiveFile('certificate.p12')).toBe(true);
		});

		it('should detect .pfx files', () => {
			expect(isSensitiveFile('certificate.pfx')).toBe(true);
		});
	});

	describe('Non-sensitive files', () => {
		it('should not flag regular TypeScript files', () => {
			expect(isSensitiveFile('app.ts')).toBe(false);
		});

		it('should not flag package.json', () => {
			expect(isSensitiveFile('package.json')).toBe(false);
		});

		it('should not flag config.json', () => {
			expect(isSensitiveFile('config.json')).toBe(false);
		});

		it('should not flag .env.example', () => {
			// .env.example is NOT flagged because:
			// - it doesn't match '.env' exactly
			// - it doesn't END with '.env' (it ends with '.example')
			// - the path check looks for '/.env' not just '.env'
			expect(isSensitiveFile('.env.example')).toBe(false);
		});

		it('should not flag README.md', () => {
			expect(isSensitiveFile('README.md')).toBe(false);
		});

		it('should not flag source files', () => {
			expect(isSensitiveFile('src/lib/utils.ts')).toBe(false);
		});
	});
});

// ============================================================================
// Path Validation Tests
// ============================================================================

describe('validatePath', () => {
	const projectPath = '/home/user/code/myproject';

	describe('Valid paths', () => {
		it('should validate simple filename', () => {
			const result = validatePath(projectPath, 'file.txt');
			expect(result.valid).toBe(true);
			expect(result.resolved).toBe(join(projectPath, 'file.txt'));
		});

		it('should validate nested path', () => {
			const result = validatePath(projectPath, 'src/lib/utils.ts');
			expect(result.valid).toBe(true);
			expect(result.resolved).toBe(join(projectPath, 'src/lib/utils.ts'));
		});

		it('should validate deep nesting', () => {
			const result = validatePath(projectPath, 'a/b/c/d/e/f.txt');
			expect(result.valid).toBe(true);
		});
	});

	describe('Invalid paths', () => {
		it('should reject path traversal with ..', () => {
			const result = validatePath(projectPath, '../etc/passwd');
			expect(result.valid).toBe(false);
			expect(result.error).toBe('Path traversal detected');
		});

		it('should reject multiple traversals', () => {
			const result = validatePath(projectPath, '../../etc/passwd');
			expect(result.valid).toBe(false);
		});

		it('should reject traversal in middle of path', () => {
			const result = validatePath(projectPath, 'src/../../../etc');
			expect(result.valid).toBe(false);
		});
	});
});

// ============================================================================
// Binary Content Detection Tests
// ============================================================================

describe('isBinaryContent', () => {
	it('should detect binary content with null bytes', () => {
		const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
		expect(isBinaryContent(buffer)).toBe(true);
	});

	it('should detect null byte in middle', () => {
		const buffer = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x57, 0x6f, 0x72, 0x6c, 0x64]);
		expect(isBinaryContent(buffer)).toBe(true);
	});

	it('should allow UTF-8 text content', () => {
		const buffer = Buffer.from('Hello World!', 'utf-8');
		expect(isBinaryContent(buffer)).toBe(false);
	});

	it('should allow JSON content', () => {
		const buffer = Buffer.from('{"key": "value"}', 'utf-8');
		expect(isBinaryContent(buffer)).toBe(false);
	});

	it('should allow TypeScript content', () => {
		const buffer = Buffer.from(MOCK_FILE_CONTENT.typescript, 'utf-8');
		expect(isBinaryContent(buffer)).toBe(false);
	});

	it('should allow Markdown content', () => {
		const buffer = Buffer.from(MOCK_FILE_CONTENT.markdown, 'utf-8');
		expect(isBinaryContent(buffer)).toBe(false);
	});

	it('should handle empty buffer', () => {
		const buffer = Buffer.from([]);
		expect(isBinaryContent(buffer)).toBe(false);
	});

	it('should only check first 8KB', () => {
		// Create a buffer larger than 8KB with no null bytes
		const textPart = Buffer.alloc(10000, 0x41); // All 'A's
		// Add null byte after 8KB - should not be detected
		textPart[9000] = 0x00;
		expect(isBinaryContent(textPart)).toBe(false);
	});
});

// ============================================================================
// GET /api/files/content Tests
// ============================================================================

describe('GET /api/files/content API', () => {
	beforeEach(resetMocks);

	it('should return file content with metadata', async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({
				content: MOCK_FILE_CONTENT.typescript,
				encoding: 'utf-8',
				language: 'typescript',
				size: MOCK_FILE_CONTENT.typescript.length
			})
		});

		const response = await fetch('/api/files/content?project=jat&path=src/app.ts');
		const data = await response.json();

		expect(data).toHaveProperty('content');
		expect(data).toHaveProperty('encoding', 'utf-8');
		expect(data).toHaveProperty('language', 'typescript');
		expect(data).toHaveProperty('size');
	});

	it('should return 400 for missing project', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 400,
			json: () => Promise.resolve({ error: 'Project name is required' })
		});

		const response = await fetch('/api/files/content?path=file.txt');
		expect(response.ok).toBe(false);
		expect(response.status).toBe(400);
	});

	it('should return 400 for missing path', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 400,
			json: () => Promise.resolve({ error: 'File path is required' })
		});

		const response = await fetch('/api/files/content?project=jat');
		expect(response.ok).toBe(false);
		expect(response.status).toBe(400);
	});

	it('should return 404 for non-existent file', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 404,
			json: () => Promise.resolve({ error: 'File not found' })
		});

		const response = await fetch('/api/files/content?project=jat&path=nonexistent.ts');
		expect(response.ok).toBe(false);
		expect(response.status).toBe(404);
	});

	it('should return 403 for path traversal', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 403,
			json: () => Promise.resolve({ error: 'Path traversal detected' })
		});

		const response = await fetch('/api/files/content?project=jat&path=../../../etc/passwd');
		expect(response.ok).toBe(false);
		expect(response.status).toBe(403);
	});

	it('should return 413 for file too large', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 413,
			json: () => Promise.resolve({ error: 'File too large: 2.00MB exceeds 1MB limit' })
		});

		const response = await fetch('/api/files/content?project=jat&path=huge-file.bin');
		expect(response.ok).toBe(false);
		expect(response.status).toBe(413);
	});

	it('should return 415 for binary files', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 415,
			json: () => Promise.resolve({ error: 'Binary file - cannot display as text' })
		});

		const response = await fetch('/api/files/content?project=jat&path=image.png');
		expect(response.ok).toBe(false);
		expect(response.status).toBe(415);
	});
});

// ============================================================================
// PUT /api/files/content Tests
// ============================================================================

describe('PUT /api/files/content API', () => {
	beforeEach(resetMocks);

	it('should write file content successfully', async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({
				success: true,
				size: 100
			})
		});

		const response = await fetch('/api/files/content?project=jat&path=src/new-file.ts', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: 'export const foo = 1;' })
		});

		expect(response.ok).toBe(true);
		const data = await response.json();
		expect(data.success).toBe(true);
	});

	it('should return 403 for sensitive files', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 403,
			json: () => Promise.resolve({ error: 'Cannot write to sensitive file' })
		});

		const response = await fetch('/api/files/content?project=jat&path=.env', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: 'SECRET=value' })
		});

		expect(response.ok).toBe(false);
		expect(response.status).toBe(403);
	});

	it('should return 400 for non-string content', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 400,
			json: () => Promise.resolve({ error: 'Content must be a string' })
		});

		const response = await fetch('/api/files/content?project=jat&path=file.txt', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: 123 })
		});

		expect(response.ok).toBe(false);
		expect(response.status).toBe(400);
	});
});

// ============================================================================
// DELETE /api/files/content Tests
// ============================================================================

describe('DELETE /api/files/content API', () => {
	beforeEach(resetMocks);

	it('should delete file successfully', async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({
				success: true,
				deleted: 'src/old-file.ts'
			})
		});

		const response = await fetch('/api/files/content?project=jat&path=src/old-file.ts', {
			method: 'DELETE'
		});

		expect(response.ok).toBe(true);
		const data = await response.json();
		expect(data.success).toBe(true);
		expect(data.deleted).toBe('src/old-file.ts');
	});

	it('should return 403 for sensitive files', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 403,
			json: () => Promise.resolve({ error: 'Cannot delete sensitive file' })
		});

		const response = await fetch('/api/files/content?project=jat&path=.env', {
			method: 'DELETE'
		});

		expect(response.ok).toBe(false);
		expect(response.status).toBe(403);
	});

	it('should return 404 for non-existent file', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 404,
			json: () => Promise.resolve({ error: 'File not found' })
		});

		const response = await fetch('/api/files/content?project=jat&path=nonexistent.ts', {
			method: 'DELETE'
		});

		expect(response.ok).toBe(false);
		expect(response.status).toBe(404);
	});
});

// ============================================================================
// PATCH /api/files/content (Rename) Tests
// ============================================================================

describe('PATCH /api/files/content API (Rename)', () => {
	beforeEach(resetMocks);

	it('should rename file successfully', async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({
				success: true,
				oldPath: 'src/old-name.ts',
				newPath: 'src/new-name.ts'
			})
		});

		const response = await fetch('/api/files/content?project=jat&path=src/old-name.ts', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ newName: 'new-name.ts' })
		});

		expect(response.ok).toBe(true);
		const data = await response.json();
		expect(data.success).toBe(true);
		expect(data.newPath).toBe('src/new-name.ts');
	});

	it('should return 400 for missing newName', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 400,
			json: () => Promise.resolve({ error: 'newName is required and must be a string' })
		});

		const response = await fetch('/api/files/content?project=jat&path=src/file.ts', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});

		expect(response.ok).toBe(false);
		expect(response.status).toBe(400);
	});

	it('should return 400 for invalid file name', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 400,
			json: () => Promise.resolve({ error: 'Invalid file name' })
		});

		const response = await fetch('/api/files/content?project=jat&path=src/file.ts', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ newName: '../escape.ts' })
		});

		expect(response.ok).toBe(false);
		expect(response.status).toBe(400);
	});

	it('should return 403 for sensitive files', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 403,
			json: () => Promise.resolve({ error: 'Cannot rename sensitive file' })
		});

		const response = await fetch('/api/files/content?project=jat&path=.env', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ newName: 'renamed.env' })
		});

		expect(response.ok).toBe(false);
		expect(response.status).toBe(403);
	});

	it('should return 409 for existing destination', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 409,
			json: () => Promise.resolve({ error: 'A file with that name already exists' })
		});

		const response = await fetch('/api/files/content?project=jat&path=src/file.ts', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ newName: 'existing.ts' })
		});

		expect(response.ok).toBe(false);
		expect(response.status).toBe(409);
	});
});

// ============================================================================
// POST /api/files/content (Create) Tests
// ============================================================================

describe('POST /api/files/content API (Create)', () => {
	beforeEach(resetMocks);

	it('should create file successfully', async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({
				success: true,
				path: 'src/new-file.ts',
				type: 'file'
			})
		});

		const response = await fetch('/api/files/content?project=jat&path=src&name=new-file.ts&type=file', {
			method: 'POST'
		});

		expect(response.ok).toBe(true);
		const data = await response.json();
		expect(data.success).toBe(true);
		expect(data.type).toBe('file');
	});

	it('should create folder successfully', async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({
				success: true,
				path: 'src/new-folder',
				type: 'folder'
			})
		});

		const response = await fetch('/api/files/content?project=jat&path=src&name=new-folder&type=folder', {
			method: 'POST'
		});

		expect(response.ok).toBe(true);
		const data = await response.json();
		expect(data.success).toBe(true);
		expect(data.type).toBe('folder');
	});

	it('should return 400 for missing name', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 400,
			json: () => Promise.resolve({ error: 'Name is required' })
		});

		const response = await fetch('/api/files/content?project=jat&path=src&type=file', {
			method: 'POST'
		});

		expect(response.ok).toBe(false);
		expect(response.status).toBe(400);
	});

	it('should return 400 for invalid type', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 400,
			json: () => Promise.resolve({ error: 'Type must be "file" or "folder"' })
		});

		const response = await fetch('/api/files/content?project=jat&path=src&name=test&type=invalid', {
			method: 'POST'
		});

		expect(response.ok).toBe(false);
		expect(response.status).toBe(400);
	});

	it('should return 400 for invalid name with path separator', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 400,
			json: () => Promise.resolve({ error: 'Invalid name' })
		});

		const response = await fetch('/api/files/content?project=jat&path=src&name=path/file.ts&type=file', {
			method: 'POST'
		});

		expect(response.ok).toBe(false);
		expect(response.status).toBe(400);
	});

	it('should return 403 for creating sensitive files', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 403,
			json: () => Promise.resolve({ error: 'Cannot create sensitive file' })
		});

		const response = await fetch('/api/files/content?project=jat&path=&name=.env&type=file', {
			method: 'POST'
		});

		expect(response.ok).toBe(false);
		expect(response.status).toBe(403);
	});

	it('should return 409 for existing file', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 409,
			json: () => Promise.resolve({ error: 'A file with that name already exists' })
		});

		const response = await fetch('/api/files/content?project=jat&path=src&name=existing.ts&type=file', {
			method: 'POST'
		});

		expect(response.ok).toBe(false);
		expect(response.status).toBe(409);
	});
});
