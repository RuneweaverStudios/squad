export interface DocPage {
	slug: string;
	title: string;
	description?: string;
}

export interface DocSection {
	title: string;
	pages: DocPage[];
}

export const docSections: DocSection[] = [
	{
		title: 'Getting Started',
		pages: [
			{ slug: 'introduction', title: 'Introduction', description: 'What is SQUAD and why it exists' },
			{ slug: 'installation', title: 'Installation', description: 'Install SQUAD and prerequisites' },
			{ slug: 'quick-start', title: 'Quick Start', description: 'Get up and running in minutes' }
		]
	},
	{
		title: 'Core Concepts',
		pages: [
			{
				slug: 'architecture',
				title: 'Architecture',
				description: 'Two-layer design: transparent enhancement + explicit coordination'
			},
			{
				slug: 'sessions',
				title: 'Sessions & Agents',
				description: 'One agent, one session, one task'
			},
			{
				slug: 'task-management',
				title: 'Task Management',
				description: 'Dependency-aware task planning'
			},
			{
				slug: 'agent-mail',
				title: 'Agent Mail',
				description: 'Async coordination between agents'
			}
		]
	},
	{
		title: 'The IDE',
		pages: [
			{ slug: 'ide-overview', title: 'IDE Overview', description: 'The SQUAD IDE' },
			{ slug: 'work-sessions', title: 'Work Sessions', description: 'Managing agent sessions' },
			{
				slug: 'task-views',
				title: 'Task Views',
				description: 'Table, Kanban, Timeline, and Graph views'
			},
			{
				slug: 'file-explorer',
				title: 'File Explorer',
				description: 'Browse and edit project files'
			},
			{
				slug: 'keyboard-shortcuts',
				title: 'Keyboard Shortcuts',
				description: 'Global, session, and command shortcuts'
			}
		]
	},
	{
		title: 'Workflow',
		pages: [
			{
				slug: 'workflow-commands',
				title: 'Workflow Commands',
				description: '/squad:start, /squad:complete, /squad:pause'
			},
			{
				slug: 'signals',
				title: 'Signals',
				description: 'Agent state tracking via the signal system'
			},
			{
				slug: 'automation',
				title: 'Automation Rules',
				description: 'Pattern-matching session automation'
			},
			{
				slug: 'multi-agent',
				title: 'Multi-Agent Swarm',
				description: 'Running parallel agents on a backlog'
			}
		]
	},
	{
		title: 'Configuration',
		pages: [
			{
				slug: 'projects',
				title: 'Projects',
				description: 'Adding and configuring projects'
			},
			{
				slug: 'agent-programs',
				title: 'Agent Programs',
				description: 'Claude Code, Codex, Gemini, and more'
			},
			{
				slug: 'credentials',
				title: 'Credentials & Secrets',
				description: 'API keys and per-project secrets'
			},
			{
				slug: 'review-rules',
				title: 'Review Rules',
				description: 'Auto-proceed vs human review matrix'
			}
		]
	},
	{
		title: 'Tools',
		pages: [
			{
				slug: 'browser-automation',
				title: 'Browser Automation',
				description: 'Chrome DevTools Protocol tools'
			},
			{
				slug: 'database-tools',
				title: 'Database Tools',
				description: 'SQL queries, schema inspection'
			},
			{
				slug: 'media-tools',
				title: 'Media & Image Generation',
				description: 'Gemini-powered image tools'
			}
		]
	},
	{
		title: 'Reference',
		pages: [
			{
				slug: 'cli-reference',
				title: 'CLI Reference',
				description: 'All SQUAD CLI commands'
			},
			{
				slug: 'api-reference',
				title: 'IDE API Reference',
				description: 'REST endpoints for the IDE'
			},
			{
				slug: 'troubleshooting',
				title: 'Troubleshooting',
				description: 'Common issues and solutions'
			}
		]
	}
];

export const allPages: DocPage[] = docSections.flatMap((s) => s.pages);

export function getPageBySlug(slug: string): DocPage | undefined {
	return allPages.find((p) => p.slug === slug);
}

export function getSectionForSlug(slug: string): DocSection | undefined {
	return docSections.find((s) => s.pages.some((p) => p.slug === slug));
}

export function getAdjacentPages(slug: string): { prev?: DocPage; next?: DocPage } {
	const idx = allPages.findIndex((p) => p.slug === slug);
	return {
		prev: idx > 0 ? allPages[idx - 1] : undefined,
		next: idx < allPages.length - 1 ? allPages[idx + 1] : undefined
	};
}
