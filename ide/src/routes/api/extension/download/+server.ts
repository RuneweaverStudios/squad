import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';

export async function GET() {
	const zipPath = resolve(process.cwd(), '..', 'extension', 'jat-bug-reporter-chrome-v1.0.0.zip');
	if (!existsSync(zipPath)) {
		return new Response('Extension zip not found', { status: 404 });
	}
	const stats = statSync(zipPath);
	const data = readFileSync(zipPath);
	return new Response(data, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': 'attachment; filename="jat-bug-reporter-chrome-v1.0.0.zip"',
			'Content-Length': stats.size.toString()
		}
	});
}
