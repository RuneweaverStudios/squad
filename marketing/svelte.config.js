import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: false,
			strict: true
		}),
		prerender: {
			handleHttpError: ({ path, message }) => {
				// Ignore missing images during prerender - they'll be added later
				if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.gif')) {
					console.warn(`Warning: Missing asset ${path}`);
					return;
				}
				throw new Error(message);
			},
			handleMissingId: 'warn'
		}
	},
	vitePlugin: {
		inspector: {
			toggleKeyCombo: 'control-shift',
			showToggleButton: 'always',
			toggleButtonPos: 'bottom-left'
		}
	}
};

export default config;
