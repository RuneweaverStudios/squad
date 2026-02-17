<script lang="ts">
	import { onMount } from 'svelte';

	let copied = $state<string | null>(null);
	let healthStatus = $state<'checking' | 'ok' | 'error' | null>(null);
	let widgetFileExists = $state<boolean | null>(null);

	function copyText(text: string, id: string) {
		navigator.clipboard.writeText(text);
		copied = id;
		setTimeout(() => { if (copied === id) copied = null; }, 2000);
	}

	onMount(async () => {
		// Check if widget JS file is served
		try {
			const res = await fetch('/widget/jat-feedback.js', { method: 'HEAD' });
			widgetFileExists = res.ok;
		} catch {
			widgetFileExists = false;
		}
		// Check if feedback API is healthy
		try {
			healthStatus = 'checking';
			const res = await fetch('/api/feedback/report');
			const data = await res.json();
			healthStatus = data.status === 'ok' ? 'ok' : 'error';
		} catch {
			healthStatus = 'error';
		}
	});

	const quickStartSnippet = `<script src="http://localhost:3333/widget/jat-feedback.js"><\/script>
<jat-feedback endpoint="http://localhost:3333"></jat-feedback>`;

	const tunnelSnippet = `<script src="https://YOUR-TUNNEL.trycloudflare.com/widget/jat-feedback.js"><\/script>
<jat-feedback endpoint="https://YOUR-TUNNEL.trycloudflare.com"></jat-feedback>`;

	const reactSnippet = `// In your index.html or layout component:
// <script src="http://localhost:3333/widget/jat-feedback.js"><\/script>

// Then in any React component:
export default function App() {
  return (
    <div>
      <h1>My App</h1>
      {/* Widget renders as a floating button */}
      <jat-feedback endpoint="http://localhost:3333"></jat-feedback>
    </div>
  );
}`;

	const svelteSnippet = `<!-- In app.html: -->
<!-- <script src="http://localhost:3333/widget/jat-feedback.js"><\/script> -->

<!-- In any .svelte file: -->
<svelte:head>
  <script src="http://localhost:3333/widget/jat-feedback.js"><\/script>
</svelte:head>

<jat-feedback endpoint="http://localhost:3333"></jat-feedback>`;

	const nextSnippet = `// In pages/_app.tsx or layout.tsx:
import Script from 'next/script';

export default function Layout({ children }) {
  return (
    <>
      {children}
      <Script src="http://localhost:3333/widget/jat-feedback.js" strategy="lazyOnload" />
      <jat-feedback endpoint="http://localhost:3333"></jat-feedback>
    </>
  );
}`;

	const buildSnippet = `cd widget && npm install && npm run build

# Copy to IDE static directory
cp dist/jat-feedback.js ../ide/static/widget/

# Or use the IDE shortcut:
cd ide && npm run build:widget`;

	let activeFramework = $state<'html' | 'react' | 'svelte' | 'next'>('html');

	const frameworks = [
		{ id: 'html' as const, label: 'HTML', snippet: quickStartSnippet },
		{ id: 'react' as const, label: 'React', snippet: reactSnippet },
		{ id: 'svelte' as const, label: 'SvelteKit', snippet: svelteSnippet },
		{ id: 'next' as const, label: 'Next.js', snippet: nextSnippet },
	];
</script>

<div class="min-h-screen" style="background: oklch(0.13 0.01 250);">
	<div class="max-w-4xl mx-auto px-6 py-10">

		<!-- Header -->
		<div class="mb-10">
			<div class="flex items-center gap-3 mb-3">
				<div
					class="w-10 h-10 rounded-xl flex items-center justify-center"
					style="background: linear-gradient(135deg, oklch(0.45 0.15 270), oklch(0.35 0.12 220));"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" style="color: oklch(0.90 0.05 270);">
						<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
					</svg>
				</div>
				<div>
					<h1 class="font-mono text-lg font-bold" style="color: oklch(0.90 0.04 250);">
						Feedback Widget
					</h1>
					<p class="font-mono text-xs" style="color: oklch(0.50 0.04 250);">
						&lt;jat-feedback&gt; &mdash; v1.0.0
					</p>
				</div>
			</div>
			<p class="font-mono text-sm leading-relaxed max-w-2xl" style="color: oklch(0.65 0.03 250);">
				A drop-in web component that lets your end users submit bug reports directly into JAT.
				No browser extension needed &mdash; just a script tag. Reports appear as tasks with screenshots,
				console logs, and element data attached.
			</p>

			<!-- Status indicators -->
			<div class="flex gap-3 mt-4">
				<div
					class="flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-[10px]"
					style="
						background: {widgetFileExists === true ? 'oklch(0.20 0.04 145)' : widgetFileExists === false ? 'oklch(0.20 0.04 25)' : 'oklch(0.18 0.02 250)'};
						border: 1px solid {widgetFileExists === true ? 'oklch(0.30 0.08 145)' : widgetFileExists === false ? 'oklch(0.30 0.08 25)' : 'oklch(0.25 0.02 250)'};
						color: {widgetFileExists === true ? 'oklch(0.75 0.12 145)' : widgetFileExists === false ? 'oklch(0.75 0.12 25)' : 'oklch(0.55 0.02 250)'};
					"
				>
					<span class="w-1.5 h-1.5 rounded-full" style="background: {widgetFileExists === true ? 'oklch(0.65 0.18 145)' : widgetFileExists === false ? 'oklch(0.65 0.18 25)' : 'oklch(0.45 0.02 250)'};"></span>
					{widgetFileExists === true ? 'Widget JS serving' : widgetFileExists === false ? 'Widget JS not found' : 'Checking...'}
				</div>
				<div
					class="flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-[10px]"
					style="
						background: {healthStatus === 'ok' ? 'oklch(0.20 0.04 145)' : healthStatus === 'error' ? 'oklch(0.20 0.04 25)' : 'oklch(0.18 0.02 250)'};
						border: 1px solid {healthStatus === 'ok' ? 'oklch(0.30 0.08 145)' : healthStatus === 'error' ? 'oklch(0.30 0.08 25)' : 'oklch(0.25 0.02 250)'};
						color: {healthStatus === 'ok' ? 'oklch(0.75 0.12 145)' : healthStatus === 'error' ? 'oklch(0.75 0.12 25)' : 'oklch(0.55 0.02 250)'};
					"
				>
					<span class="w-1.5 h-1.5 rounded-full" style="background: {healthStatus === 'ok' ? 'oklch(0.65 0.18 145)' : healthStatus === 'error' ? 'oklch(0.65 0.18 25)' : 'oklch(0.45 0.02 250)'};"></span>
					{healthStatus === 'ok' ? 'Report API healthy' : healthStatus === 'error' ? 'Report API unreachable' : 'Checking API...'}
				</div>
			</div>
		</div>

		<!-- How It Works -->
		<section class="mb-10">
			<h2 class="font-mono text-xs font-bold uppercase tracking-widest mb-4" style="color: oklch(0.50 0.04 250);">How It Works</h2>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
				{#each [
					{ step: '1', title: 'Add the script tag', desc: 'One script tag loads the widget. One custom element places it. Zero dependencies on your end.' },
					{ step: '2', title: 'User submits a report', desc: 'Floating button opens a form. Users describe the bug, capture a screenshot, and hit submit.' },
					{ step: '3', title: 'Report becomes a task', desc: 'The report POSTs to your JAT IDE. A task is created with screenshots saved to .jat/screenshots/.' },
				] as item}
					<div
						class="rounded-lg px-4 py-3"
						style="background: oklch(0.16 0.02 250); border: 1px solid oklch(0.24 0.03 250);"
					>
						<div class="flex items-center gap-2 mb-2">
							<span
								class="w-5 h-5 rounded-full flex items-center justify-center font-mono text-[9px] font-bold"
								style="background: oklch(0.30 0.10 270); color: oklch(0.80 0.10 270);"
							>{item.step}</span>
							<h3 class="font-mono text-[11px] font-semibold" style="color: oklch(0.80 0.06 250);">{item.title}</h3>
						</div>
						<p class="font-mono text-[10px] leading-relaxed" style="color: oklch(0.55 0.03 250);">{item.desc}</p>
					</div>
				{/each}
			</div>
		</section>

		<!-- Quick Start -->
		<section class="mb-10">
			<h2 class="font-mono text-xs font-bold uppercase tracking-widest mb-4" style="color: oklch(0.50 0.04 250);">Quick Start</h2>

			<!-- Framework tabs -->
			<div class="flex gap-1 mb-3">
				{#each frameworks as fw}
					<button
						class="font-mono text-[10px] font-semibold px-3 py-1.5 rounded-t cursor-pointer transition-colors duration-100"
						style="
							background: {activeFramework === fw.id ? 'oklch(0.20 0.03 250)' : 'transparent'};
							color: {activeFramework === fw.id ? 'oklch(0.85 0.08 270)' : 'oklch(0.50 0.03 250)'};
							border: 1px solid {activeFramework === fw.id ? 'oklch(0.28 0.04 250)' : 'transparent'};
							border-bottom: none;
						"
						onclick={() => activeFramework = fw.id}
					>
						{fw.label}
					</button>
				{/each}
			</div>

			<div class="relative">
				<pre
					class="font-mono text-[10px] leading-relaxed px-4 py-3 rounded-lg rounded-tl-none overflow-x-auto"
					style="background: oklch(0.12 0.01 250); color: oklch(0.68 0.06 200); border: 1px solid oklch(0.22 0.02 250); margin: 0;"
				>{frameworks.find(f => f.id === activeFramework)?.snippet}</pre>
				<button
					class="absolute top-2.5 right-2.5 font-mono text-[9px] px-2 py-1 rounded cursor-pointer transition-colors duration-150"
					style="
						background: {copied === 'quickstart' ? 'oklch(0.30 0.08 145)' : 'oklch(0.22 0.03 250)'};
						color: {copied === 'quickstart' ? 'oklch(0.80 0.12 145)' : 'oklch(0.60 0.04 250)'};
						border: 1px solid {copied === 'quickstart' ? 'oklch(0.40 0.10 145)' : 'oklch(0.30 0.03 250)'};
					"
					onclick={() => copyText(frameworks.find(f => f.id === activeFramework)?.snippet || '', 'quickstart')}
				>
					{copied === 'quickstart' ? 'Copied!' : 'Copy'}
				</button>
			</div>

			{#if widgetFileExists === false}
				<div
					class="mt-3 px-3 py-2 rounded-lg font-mono text-[10px] leading-relaxed"
					style="background: oklch(0.18 0.04 45); border: 1px solid oklch(0.28 0.08 45); color: oklch(0.70 0.12 45);"
				>
					The widget JS file is not found at <code style="color: oklch(0.80 0.10 45);">/widget/jat-feedback.js</code>. Run <code style="color: oklch(0.80 0.10 45);">npm run build:widget</code> from the <code>ide/</code> directory to build and copy it.
				</div>
			{/if}
		</section>

		<!-- Features -->
		<section class="mb-10">
			<h2 class="font-mono text-xs font-bold uppercase tracking-widest mb-4" style="color: oklch(0.50 0.04 250);">What It Captures</h2>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				{#each [
					{ icon: '📸', title: 'Screenshots', desc: 'Captures the visible viewport using html2canvas. Screenshots are saved as base64 data URLs and stored in .jat/screenshots/ as PNG or JPEG files.', detail: 'Max 5 per report. Compressed to JPEG for efficiency.' },
					{ icon: '🐛', title: 'Console Logs', desc: 'Hooks into console.log, console.error, console.warn, and console.info. Captures the last 50 entries with timestamps, file names, and line numbers.', detail: 'Sensitive data (API keys, JWTs, passwords) is automatically redacted.' },
					{ icon: '🎯', title: 'Element Picker', desc: 'Click any element on the page to capture its tag, classes, ID, bounding rect, XPath, and CSS selector. Useful for pointing at exactly what\'s broken.', detail: 'Highlights elements on hover. Press ESC to cancel.' },
					{ icon: '📡', title: 'Offline Queue', desc: 'If the JAT endpoint is unreachable, reports are queued in localStorage and retried every 30 seconds. Up to 50 reports can be queued.', detail: 'Queue persists across page reloads. Auto-submits when connection returns.' },
				] as feat}
					<div
						class="rounded-lg px-4 py-3"
						style="background: oklch(0.16 0.02 250); border: 1px solid oklch(0.24 0.03 250);"
					>
						<div class="flex items-center gap-2 mb-1.5">
							<span class="text-sm">{feat.icon}</span>
							<h3 class="font-mono text-[11px] font-semibold" style="color: oklch(0.80 0.06 250);">{feat.title}</h3>
						</div>
						<p class="font-mono text-[10px] leading-relaxed mb-1.5" style="color: oklch(0.55 0.03 250);">{feat.desc}</p>
						<p class="font-mono text-[9px] leading-relaxed" style="color: oklch(0.45 0.03 250);">{feat.detail}</p>
					</div>
				{/each}
			</div>
		</section>

		<!-- Configuration -->
		<section class="mb-10">
			<h2 class="font-mono text-xs font-bold uppercase tracking-widest mb-4" style="color: oklch(0.50 0.04 250);">Configuration</h2>
			<p class="font-mono text-[11px] mb-4 leading-relaxed" style="color: oklch(0.55 0.03 250);">
				All configuration is done via HTML attributes on the <code style="color: oklch(0.70 0.10 270);">&lt;jat-feedback&gt;</code> element.
			</p>

			<div
				class="rounded-lg overflow-hidden"
				style="border: 1px solid oklch(0.24 0.03 250);"
			>
				<table class="w-full">
					<thead>
						<tr style="background: oklch(0.18 0.02 250);">
							<th class="font-mono text-[9px] font-bold uppercase tracking-wider text-left px-4 py-2" style="color: oklch(0.50 0.03 250);">Attribute</th>
							<th class="font-mono text-[9px] font-bold uppercase tracking-wider text-left px-4 py-2" style="color: oklch(0.50 0.03 250);">Default</th>
							<th class="font-mono text-[9px] font-bold uppercase tracking-wider text-left px-4 py-2" style="color: oklch(0.50 0.03 250);">Description</th>
						</tr>
					</thead>
					<tbody>
						{#each [
							{ attr: 'endpoint', default: '(required)', desc: 'URL of your JAT IDE. Reports are POSTed to /api/feedback/report on this host.' },
							{ attr: 'position', default: 'bottom-right', desc: 'Where the floating button appears. Options: bottom-right, bottom-left, top-right, top-left.' },
							{ attr: 'theme', default: 'dark', desc: 'Color theme for the widget panel. Options: dark, light.' },
							{ attr: 'buttoncolor', default: '#3b82f6', desc: 'Background color of the floating button. Accepts any CSS color value.' },
						] as row, i}
							<tr style="background: {i % 2 === 0 ? 'oklch(0.14 0.01 250)' : 'oklch(0.16 0.02 250)'}; border-top: 1px solid oklch(0.22 0.02 250);">
								<td class="px-4 py-2.5">
									<code class="font-mono text-[10px] font-bold" style="color: oklch(0.75 0.12 270);">{row.attr}</code>
								</td>
								<td class="px-4 py-2.5">
									<code class="font-mono text-[10px]" style="color: {row.default === '(required)' ? 'oklch(0.70 0.12 25)' : 'oklch(0.60 0.04 200)'};">{row.default}</code>
								</td>
								<td class="px-4 py-2.5">
									<span class="font-mono text-[10px]" style="color: oklch(0.60 0.03 250);">{row.desc}</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Example with all options -->
			<div class="mt-4">
				<p class="font-mono text-[10px] mb-2" style="color: oklch(0.50 0.03 250);">Full example with all options:</p>
				<pre
					class="font-mono text-[10px] leading-relaxed px-4 py-3 rounded-lg overflow-x-auto"
					style="background: oklch(0.12 0.01 250); color: oklch(0.68 0.06 200); border: 1px solid oklch(0.22 0.02 250); margin: 0;"
				>{`<jat-feedback
  endpoint="http://localhost:3333"
  position="bottom-left"
  theme="dark"
  buttoncolor="#10b981"
></jat-feedback>`}</pre>
			</div>
		</section>

		<!-- Report API -->
		<section class="mb-10">
			<h2 class="font-mono text-xs font-bold uppercase tracking-widest mb-4" style="color: oklch(0.50 0.04 250);">Report API</h2>
			<p class="font-mono text-[11px] mb-4 leading-relaxed" style="color: oklch(0.55 0.03 250);">
				The widget sends reports to <code style="color: oklch(0.70 0.10 270);">POST {'{endpoint}'}/api/feedback/report</code>.
				CORS is fully supported &mdash; the widget can run on any origin.
			</p>

			<div
				class="rounded-lg overflow-hidden"
				style="border: 1px solid oklch(0.24 0.03 250);"
			>
				<div class="px-4 py-2.5" style="background: oklch(0.18 0.02 250); border-bottom: 1px solid oklch(0.24 0.03 250);">
					<div class="flex items-center gap-2">
						<span class="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded" style="background: oklch(0.30 0.10 145); color: oklch(0.85 0.12 145);">POST</span>
						<code class="font-mono text-[10px]" style="color: oklch(0.70 0.06 250);">/api/feedback/report</code>
					</div>
				</div>
				<pre
					class="font-mono text-[9px] leading-relaxed px-4 py-3 overflow-x-auto"
					style="background: oklch(0.12 0.01 250); color: oklch(0.62 0.06 200); margin: 0;"
				>{`{
  "title": "Button doesn't respond on mobile",
  "description": "Tapping the submit button on iPhone does nothing",
  "type": "bug",              // "bug" | "enhancement" | "other"
  "priority": "high",         // "low" | "medium" | "high" | "critical"
  "page_url": "https://app.example.com/checkout",
  "user_agent": "Mozilla/5.0 ...",
  "screenshots": ["data:image/jpeg;base64,..."],
  "console_logs": [
    { "type": "error", "message": "TypeError: ...", "timestamp": "..." }
  ],
  "selected_elements": [
    { "tagName": "BUTTON", "id": "submit-btn", "selector": "#submit-btn", ... }
  ]
}`}</pre>
			</div>

			<div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
				{#each [
					{ method: 'GET', path: '/api/feedback/report', desc: 'Health check. Returns { status: "ok" }.' },
					{ method: 'OPTIONS', path: '/api/feedback/report', desc: 'CORS preflight. Returns 204 with Access-Control headers.' },
					{ method: 'POST', path: '/api/feedback/report', desc: 'Submit report. Returns { ok: true, id: "jat-xxx" }.' },
				] as ep}
					<div
						class="rounded-lg px-3 py-2"
						style="background: oklch(0.16 0.02 250); border: 1px solid oklch(0.24 0.03 250);"
					>
						<div class="flex items-center gap-1.5 mb-1">
							<span
								class="font-mono text-[8px] font-bold px-1 py-0.5 rounded"
								style="background: {ep.method === 'POST' ? 'oklch(0.30 0.10 145)' : ep.method === 'OPTIONS' ? 'oklch(0.30 0.08 45)' : 'oklch(0.30 0.08 200)'}; color: {ep.method === 'POST' ? 'oklch(0.85 0.12 145)' : ep.method === 'OPTIONS' ? 'oklch(0.85 0.10 45)' : 'oklch(0.85 0.10 200)'};"
							>{ep.method}</span>
							<code class="font-mono text-[9px]" style="color: oklch(0.65 0.05 250);">{ep.path}</code>
						</div>
						<p class="font-mono text-[9px]" style="color: oklch(0.50 0.03 250);">{ep.desc}</p>
					</div>
				{/each}
			</div>
		</section>

		<!-- Task Mapping -->
		<section class="mb-10">
			<h2 class="font-mono text-xs font-bold uppercase tracking-widest mb-4" style="color: oklch(0.50 0.04 250);">How Reports Map to Tasks</h2>
			<div
				class="rounded-lg overflow-hidden"
				style="border: 1px solid oklch(0.24 0.03 250);"
			>
				<table class="w-full">
					<thead>
						<tr style="background: oklch(0.18 0.02 250);">
							<th class="font-mono text-[9px] font-bold uppercase tracking-wider text-left px-4 py-2" style="color: oklch(0.50 0.03 250);">Report Field</th>
							<th class="font-mono text-[9px] font-bold uppercase tracking-wider text-left px-4 py-2" style="color: oklch(0.50 0.03 250);">Task Field</th>
							<th class="font-mono text-[9px] font-bold uppercase tracking-wider text-left px-4 py-2" style="color: oklch(0.50 0.03 250);">Mapping</th>
						</tr>
					</thead>
					<tbody>
						{#each [
							{ report: 'title', task: 'title', mapping: 'Prefixed with [Feedback]' },
							{ report: 'description', task: 'description', mapping: 'Includes page URL, browser info, screenshot paths, console logs' },
							{ report: 'type: "bug"', task: 'type: bug', mapping: 'Direct mapping' },
							{ report: 'type: "enhancement"', task: 'type: feature', mapping: 'Mapped to feature' },
							{ report: 'type: "other"', task: 'type: task', mapping: 'Mapped to task' },
							{ report: 'priority: "critical"', task: 'priority: P0', mapping: 'critical=0, high=1, medium=2, low=3' },
							{ report: 'screenshots', task: '.jat/screenshots/', mapping: 'Base64 decoded and saved as files' },
						] as row, i}
							<tr style="background: {i % 2 === 0 ? 'oklch(0.14 0.01 250)' : 'oklch(0.16 0.02 250)'}; border-top: 1px solid oklch(0.22 0.02 250);">
								<td class="px-4 py-2"><code class="font-mono text-[9px]" style="color: oklch(0.70 0.10 200);">{row.report}</code></td>
								<td class="px-4 py-2"><code class="font-mono text-[9px]" style="color: oklch(0.70 0.10 145);">{row.task}</code></td>
								<td class="px-4 py-2"><span class="font-mono text-[9px]" style="color: oklch(0.55 0.03 250);">{row.mapping}</span></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="font-mono text-[9px] mt-2" style="color: oklch(0.45 0.03 250);">
				All tasks created from widget reports get the labels: widget, bug-report
			</p>
		</section>

		<!-- Production: Cloudflare Tunnel -->
		<section class="mb-10">
			<h2 class="font-mono text-xs font-bold uppercase tracking-widest mb-4" style="color: oklch(0.50 0.04 250);">Production Setup</h2>
			<p class="font-mono text-[11px] mb-4 leading-relaxed" style="color: oklch(0.55 0.03 250);">
				JAT runs locally. To receive reports from production apps, expose your IDE via a
				<a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/" target="_blank" rel="noopener" class="underline" style="color: oklch(0.70 0.10 200);">Cloudflare Tunnel</a>.
				Free quick tunnels require no account.
			</p>

			<div class="space-y-3">
				{#each [
					{ step: '1', title: 'Install cloudflared', code: 'brew install cloudflared    # macOS\nsudo apt install cloudflared  # Debian/Ubuntu' },
					{ step: '2', title: 'Start a tunnel to your IDE', code: 'cloudflared tunnel --url http://localhost:3333' },
					{ step: '3', title: 'Copy the tunnel URL', code: '# Output shows:\n# +----------------------------+\n# | Your quick Tunnel has been created!\n# | https://abc-xyz.trycloudflare.com\n# +----------------------------+' },
					{ step: '4', title: 'Update the widget', code: '' },
				] as item}
					<div
						class="rounded-lg px-4 py-3"
						style="background: oklch(0.16 0.02 250); border: 1px solid oklch(0.24 0.03 250);"
					>
						<div class="flex items-center gap-2 mb-2">
							<span
								class="w-5 h-5 rounded-full flex items-center justify-center font-mono text-[9px] font-bold"
								style="background: oklch(0.30 0.08 30); color: oklch(0.80 0.10 30);"
							>{item.step}</span>
							<h3 class="font-mono text-[11px] font-semibold" style="color: oklch(0.80 0.06 250);">{item.title}</h3>
						</div>
						{#if item.code}
							<pre
								class="font-mono text-[9px] leading-relaxed px-3 py-2 rounded overflow-x-auto"
								style="background: oklch(0.12 0.01 250); color: oklch(0.62 0.06 200); border: 1px solid oklch(0.20 0.02 250); margin: 0;"
							>{item.code}</pre>
						{:else}
							<div class="relative">
								<pre
									class="font-mono text-[9px] leading-relaxed px-3 py-2 rounded overflow-x-auto"
									style="background: oklch(0.12 0.01 250); color: oklch(0.62 0.06 200); border: 1px solid oklch(0.20 0.02 250); margin: 0;"
								>{tunnelSnippet}</pre>
								<button
									class="absolute top-1.5 right-1.5 font-mono text-[8px] px-1.5 py-0.5 rounded cursor-pointer transition-colors duration-150"
									style="
										background: {copied === 'tunnel' ? 'oklch(0.30 0.08 145)' : 'oklch(0.22 0.03 250)'};
										color: {copied === 'tunnel' ? 'oklch(0.80 0.12 145)' : 'oklch(0.60 0.04 250)'};
										border: 1px solid {copied === 'tunnel' ? 'oklch(0.40 0.10 145)' : 'oklch(0.30 0.03 250)'};
									"
									onclick={() => copyText(tunnelSnippet, 'tunnel')}
								>
									{copied === 'tunnel' ? 'Copied!' : 'Copy'}
								</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<div
				class="mt-4 px-4 py-3 rounded-lg font-mono text-[10px] leading-relaxed"
				style="background: oklch(0.18 0.04 45); border: 1px solid oklch(0.28 0.06 45); color: oklch(0.65 0.08 45);"
			>
				<strong>Note:</strong> Free quick tunnels rotate URLs each time you restart cloudflared.
				For a persistent URL, create a named tunnel:
				<code style="color: oklch(0.75 0.10 45);">cloudflared tunnel create my-jat</code>
				then configure DNS via the Cloudflare dashboard.
			</div>
		</section>

		<!-- Security -->
		<section class="mb-10">
			<h2 class="font-mono text-xs font-bold uppercase tracking-widest mb-4" style="color: oklch(0.50 0.04 250);">Security</h2>
			<div class="space-y-2">
				{#each [
					{ title: 'Sensitive Data Redaction', desc: 'Console logs are automatically scanned for API keys, JWT tokens, passwords, credit card numbers, and other sensitive patterns. Matches are replaced with [REDACTED] before sending.' },
					{ title: 'Shadow DOM Isolation', desc: 'The widget renders inside Shadow DOM. Its styles cannot leak into or be affected by your app\'s CSS.' },
					{ title: 'CORS', desc: 'The report API returns Access-Control-Allow-Origin: * so the widget can POST from any domain. The endpoint only accepts structured JSON payloads.' },
					{ title: 'No External Requests', desc: 'The widget only communicates with your JAT IDE endpoint. No telemetry, no third-party services, no analytics.' },
				] as item}
					<div
						class="flex gap-3 px-4 py-2.5 rounded-lg"
						style="background: oklch(0.16 0.02 250); border: 1px solid oklch(0.24 0.03 250);"
					>
						<span class="font-mono text-[10px] font-bold shrink-0" style="color: oklch(0.75 0.08 145); min-width: 160px;">{item.title}</span>
						<span class="font-mono text-[10px] leading-relaxed" style="color: oklch(0.55 0.03 250);">{item.desc}</span>
					</div>
				{/each}
			</div>
		</section>

		<!-- Build from Source -->
		<section class="mb-10">
			<h2 class="font-mono text-xs font-bold uppercase tracking-widest mb-4" style="color: oklch(0.50 0.04 250);">Build from Source</h2>
			<p class="font-mono text-[11px] mb-3 leading-relaxed" style="color: oklch(0.55 0.03 250);">
				The widget source lives in the <code style="color: oklch(0.70 0.10 270);">widget/</code> directory.
				It builds to a single IIFE file (~293KB, ~80KB gzipped).
			</p>
			<div class="relative">
				<pre
					class="font-mono text-[10px] leading-relaxed px-4 py-3 rounded-lg overflow-x-auto"
					style="background: oklch(0.12 0.01 250); color: oklch(0.68 0.06 200); border: 1px solid oklch(0.22 0.02 250); margin: 0;"
				>{buildSnippet}</pre>
				<button
					class="absolute top-2.5 right-2.5 font-mono text-[9px] px-2 py-1 rounded cursor-pointer transition-colors duration-150"
					style="
						background: {copied === 'build' ? 'oklch(0.30 0.08 145)' : 'oklch(0.22 0.03 250)'};
						color: {copied === 'build' ? 'oklch(0.80 0.12 145)' : 'oklch(0.60 0.04 250)'};
						border: 1px solid {copied === 'build' ? 'oklch(0.40 0.10 145)' : 'oklch(0.30 0.03 250)'};
					"
					onclick={() => copyText(buildSnippet, 'build')}
				>
					{copied === 'build' ? 'Copied!' : 'Copy'}
				</button>
			</div>
			<div class="mt-3 font-mono text-[10px] leading-relaxed" style="color: oklch(0.50 0.03 250);">
				<strong style="color: oklch(0.65 0.04 250);">Tech stack:</strong> Svelte 5 (custom element mode), Vite (lib mode, IIFE output), html2canvas, TypeScript.
			</div>
		</section>

		<!-- Troubleshooting -->
		<section class="mb-10">
			<h2 class="font-mono text-xs font-bold uppercase tracking-widest mb-4" style="color: oklch(0.50 0.04 250);">Troubleshooting</h2>
			<div
				class="rounded-lg overflow-hidden"
				style="border: 1px solid oklch(0.24 0.03 250);"
			>
				{#each [
					{ issue: 'Widget button doesn\'t appear', cause: 'Script not loaded or endpoint missing', fix: 'Check browser console for 404 on jat-feedback.js. Verify the script src URL is correct.' },
					{ issue: 'Reports not submitting', cause: 'Endpoint unreachable or CORS error', fix: 'Open browser DevTools Network tab. Check the POST to /api/feedback/report. Make sure JAT IDE is running.' },
					{ issue: '"No endpoint configured" message', cause: 'Missing endpoint attribute', fix: 'Add the endpoint attribute: <jat-feedback endpoint="http://localhost:3333">' },
					{ issue: 'Screenshots are blank', cause: 'html2canvas limitation with cross-origin images', fix: 'Cross-origin images (from CDNs) may not render. Local images work fine.' },
					{ issue: 'Widget styles look wrong', cause: 'CSS conflict (unlikely with Shadow DOM)', fix: 'The widget uses Shadow DOM for isolation. If issues persist, check for global * selectors overriding shadow styles.' },
					{ issue: 'Reports queue but never send', cause: 'Endpoint permanently unreachable', fix: 'The offline queue retries every 30s. Check that your JAT IDE URL is correct and the server is running.' },
				] as row, i}
					<div
						class="px-4 py-3"
						style="background: {i % 2 === 0 ? 'oklch(0.14 0.01 250)' : 'oklch(0.16 0.02 250)'}; {i > 0 ? 'border-top: 1px solid oklch(0.22 0.02 250);' : ''}"
					>
						<div class="flex items-start gap-3">
							<div class="shrink-0" style="min-width: 200px;">
								<p class="font-mono text-[10px] font-semibold" style="color: oklch(0.75 0.08 25);">{row.issue}</p>
								<p class="font-mono text-[9px] mt-0.5" style="color: oklch(0.50 0.04 250);">{row.cause}</p>
							</div>
							<p class="font-mono text-[10px] leading-relaxed" style="color: oklch(0.60 0.03 250);">{row.fix}</p>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- Back link -->
		<div class="pt-4" style="border-top: 1px solid oklch(0.22 0.02 250);">
			<a
				href="/integrations"
				class="font-mono text-[11px] inline-flex items-center gap-1.5 transition-colors duration-150"
				style="color: oklch(0.60 0.08 270);"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
					<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
				</svg>
				Back to Integrations
			</a>
		</div>

	</div>
</div>
