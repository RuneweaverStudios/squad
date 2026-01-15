/**
 * HTTP/2 Server for JAT IDE
 *
 * Enables HTTP/2 multiplexing to eliminate the browser's 6-connection-per-domain limit.
 * SSE and regular HTTP requests share a single TCP connection with unlimited streams.
 *
 * Note: WebSocket still uses HTTP/1.1 (RFC 8441 support is limited in browsers).
 * The connectionManager.ts handles WebSocket connection lifecycle separately.
 *
 * Usage:
 *   NODE_ENV=production node server-http2.js
 *
 * Environment variables:
 *   PORT - Server port (default: 3333)
 *   HOST - Server host (default: 127.0.0.1)
 *   CERT_PATH - Path to certificate (default: ./certs/localhost.pem)
 *   KEY_PATH - Path to private key (default: ./certs/localhost-key.pem)
 */

import { createSecureServer } from 'node:http2';
import { createServer as createHttpServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration
const PORT = parseInt(process.env.PORT || '3333', 10);
const HOST = process.env.HOST || '127.0.0.1';
const CERT_PATH = process.env.CERT_PATH || join(__dirname, 'certs', 'localhost.pem');
const KEY_PATH = process.env.KEY_PATH || join(__dirname, 'certs', 'localhost-key.pem');

// Check if we're running from build directory or development
const BUILD_DIR = join(__dirname, 'build');
const isProduction = existsSync(BUILD_DIR);

async function startServer() {
	let handler;
	let initializeWebSocket, startWatchers, stopWatchers;

	if (isProduction) {
		// Production: use built handler
		const buildHandler = await import('./build/handler.js');
		handler = buildHandler.handler;

		// WebSocket is not available in production build by default
		// We'd need to build it separately or include in the build
		console.log('[HTTP/2] Running in production mode');
	} else {
		// Development: This file is for production use
		// For dev, use `npm run dev` which uses Vite's dev server
		console.error('[HTTP/2] This server is for production use only.');
		console.error('For development, run: npm run dev');
		process.exit(1);
	}

	// Check for certificates
	if (!existsSync(CERT_PATH) || !existsSync(KEY_PATH)) {
		console.error('[HTTP/2] TLS certificates not found!');
		console.error(`Expected:\n  ${CERT_PATH}\n  ${KEY_PATH}`);
		console.error('\nGenerate with:');
		console.error('  mkdir -p certs && cd certs');
		console.error('  openssl req -x509 -newkey rsa:2048 -keyout localhost-key.pem -out localhost.pem -days 365 -nodes -subj "/CN=localhost"');
		process.exit(1);
	}

	// Read certificates
	const cert = readFileSync(CERT_PATH);
	const key = readFileSync(KEY_PATH);

	// Create HTTP/2 secure server with HTTP/1.1 fallback
	const server = createSecureServer({
		cert,
		key,
		allowHTTP1: true, // Fallback for WebSocket and older clients
	});

	// Track active connections for debugging
	let connectionCount = 0;
	let http2StreamCount = 0;

	server.on('connection', () => {
		connectionCount++;
		console.log(`[HTTP/2] New connection (total: ${connectionCount})`);
	});

	server.on('stream', (stream, headers) => {
		http2StreamCount++;
		const path = headers[':path'] || '/';
		const method = headers[':method'] || 'GET';

		// Log SSE streams specifically
		if (path.includes('/events') || path.includes('/sse')) {
			console.log(`[HTTP/2] SSE stream opened: ${method} ${path} (streams: ${http2StreamCount})`);
		}

		stream.on('close', () => {
			http2StreamCount--;
		});
	});

	// Handle HTTP/2 and HTTP/1.1 requests
	server.on('request', (req, res) => {
		// Add protocol info to response headers for debugging
		const protocol = req.httpVersion === '2.0' ? 'h2' : `http/${req.httpVersion}`;
		res.setHeader('X-Protocol', protocol);

		// Let SvelteKit handle the request
		handler(req, res);
	});

	// Set up WebSocket server (uses HTTP/1.1 upgrade)
	const wss = new WebSocketServer({ noServer: true });

	server.on('upgrade', (request, socket, head) => {
		// WebSocket upgrade requests come via HTTP/1.1
		if (request.url === '/ws') {
			wss.handleUpgrade(request, socket, head, (ws) => {
				wss.emit('connection', ws, request);
				console.log('[HTTP/2] WebSocket connection established (via HTTP/1.1 upgrade)');
			});
		} else {
			socket.destroy();
		}
	});

	// Basic WebSocket handling (channels can be added later)
	wss.on('connection', (ws) => {
		ws.on('message', (message) => {
			try {
				const data = JSON.parse(message.toString());
				if (data.action === 'subscribe') {
					console.log(`[WS] Subscribe to: ${data.channels?.join(', ')}`);
				}
			} catch (e) {
				// Ignore non-JSON messages
			}
		});

		ws.on('close', () => {
			console.log('[WS] Connection closed');
		});
	});

	// Graceful shutdown
	const shutdown = () => {
		console.log('\n[HTTP/2] Shutting down...');

		// Close all WebSocket connections
		wss.clients.forEach(client => client.close());

		// Close HTTP/2 server
		server.close(() => {
			console.log('[HTTP/2] Server closed');
			process.exit(0);
		});

		// Force exit after timeout
		setTimeout(() => {
			console.log('[HTTP/2] Forcing exit...');
			process.exit(1);
		}, 5000);
	};

	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);

	// Start server
	server.listen(PORT, HOST, () => {
		console.log('');
		console.log('╔═══════════════════════════════════════════════════════════════╗');
		console.log('║                    JAT IDE - HTTP/2 Server                    ║');
		console.log('╠═══════════════════════════════════════════════════════════════╣');
		console.log(`║  URL: https://${HOST}:${PORT}                              ║`);
		console.log('║                                                               ║');
		console.log('║  Features:                                                    ║');
		console.log('║    • HTTP/2 multiplexing (unlimited concurrent streams)       ║');
		console.log('║    • HTTP/1.1 fallback (for WebSocket)                        ║');
		console.log('║    • TLS encryption                                           ║');
		console.log('║                                                               ║');
		console.log('║  Note: Browser will show certificate warning for self-signed ║');
		console.log('║  cert. Click "Advanced" → "Proceed" to continue.             ║');
		console.log('╚═══════════════════════════════════════════════════════════════╝');
		console.log('');
	});
}

startServer().catch(err => {
	console.error('[HTTP/2] Failed to start server:', err);
	process.exit(1);
});
