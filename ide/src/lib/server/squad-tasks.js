/**
 * Server-side task integration
 * Wraps lib/tasks.js for use in SvelteKit server routes
 */

export {
	// Reads
	getTasks,
	getTaskById,
	getReadyTasks,
	getScheduledTasks,
	searchTasks,
	// Writes
	createTask,
	updateTask,
	closeTask,
	deleteTask,
	// Dependencies
	addDependency,
	removeDependency,
	getDependencyTree,
	// Comments
	addComment,
	// Helpers
	generateTaskId,
	initProject,
	getProjects
} from '../../../../lib/tasks.js';
