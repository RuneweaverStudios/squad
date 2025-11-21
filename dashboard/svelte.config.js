import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	vitePlugin: {
		inspector: {
			toggleKeyCombo: 'control-shift',
			showToggleButton: 'always',
			toggleButtonPos: 'bottom-left',
			holdMode: false
		},
		experimental: {
			useVitePreprocess: true
		}
	},

	kit: {
		// Using adapter-node for server-side SQLite database queries
		adapter: adapter()
	}
};

export default config;
