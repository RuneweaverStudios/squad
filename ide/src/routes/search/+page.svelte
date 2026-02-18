<script lang="ts">
	/**
	 * Unified Search Page — thin wrapper around UnifiedSearch in route mode.
	 *
	 * All search logic (API calls, tabs, synthesis, keyboard nav) lives in
	 * UnifiedSearch.svelte. This page just fetches projects and passes URL params.
	 *
	 * Task: squad-fqaqf (replaces inline search from squad-tvos9.4)
	 */

	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import UnifiedSearch from '$lib/components/search/UnifiedSearch.svelte';

	type SourceTab = 'all' | 'tasks' | 'memory' | 'filenames' | 'content';

	// Projects
	let projects = $state<string[]>([]);
	let selectedProject = $state('');

	// Initial values from URL (read once on mount)
	let initialQuery = $state('');
	let initialTab = $state<SourceTab>('all');
	let mounted = $state(false);

	function handleProjectChange(project: string) {
		selectedProject = project;
		const url = new URL(window.location.href);
		if (project) url.searchParams.set('project', project);
		else url.searchParams.delete('project');
		goto(url.toString(), { replaceState: true, keepFocus: true });
	}

	onMount(async () => {
		// Fetch projects
		try {
			const res = await fetch('/api/projects?visible=true');
			const data = await res.json();
			projects = (data.projects || []).map((p: { name: string }) => p.name);
		} catch {
			// Non-critical
		}

		// Read URL params
		const params = new URL(window.location.href).searchParams;
		const q = params.get('q');
		const tab = params.get('tab');
		const project = params.get('project');

		if (q) initialQuery = q;
		if (tab && ['all', 'tasks', 'memory', 'filenames', 'content'].includes(tab)) {
			initialTab = tab as SourceTab;
		}
		if (project) selectedProject = project;

		mounted = true;
	});
</script>

{#if mounted}
	<UnifiedSearch
		mode="route"
		{projects}
		{selectedProject}
		onProjectChange={handleProjectChange}
		{initialQuery}
		{initialTab}
	/>
{/if}
