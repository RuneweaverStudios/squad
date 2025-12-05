/**
 * Project detection utilities
 *
 * Extracts project names from task IDs for multi-project filtering
 * Also handles hierarchical task IDs (parent.child format)
 */

/**
 * Task interface with minimal required properties
 */
export interface Task {
  id: string;
  [key: string]: any; // Allow additional properties
}

/**
 * Extract project name from a task ID
 *
 * @param taskId - Task ID (e.g., "chimaro-abc", "jomarchy-xyz")
 * @returns Project name or null if no valid prefix
 *
 * @example
 * getProjectFromTaskId("chimaro-abc") // "chimaro"
 * getProjectFromTaskId("jat-bov") // "jat"
 * getProjectFromTaskId("invalid") // null
 */
export function getProjectFromTaskId(taskId: string): string | null {
  if (!taskId || typeof taskId !== 'string') {
    return null;
  }

  // Task IDs should be in format: "project-hash" (e.g., "chimaro-abc", "jat-bov")
  // Project prefix must be followed by a hyphen and at least one character
  const match = taskId.match(/^([a-zA-Z0-9_-]+?)-([a-zA-Z0-9]+)$/);

  if (!match) {
    return null;
  }

  const [, projectPrefix] = match;

  // Validate project prefix (shouldn't be empty or just hyphens)
  if (!projectPrefix || projectPrefix.trim() === '' || /^-+$/.test(projectPrefix)) {
    return null;
  }

  return projectPrefix;
}

/**
 * Extract parent ID from a hierarchical task ID
 *
 * Hierarchical IDs use dot notation: parent.childNumber (e.g., "jat-abc.1", "jat-abc.2")
 * This function extracts the parent portion before the last dot.
 *
 * @param taskId - Task ID (e.g., "jat-abc.1", "jat-abc", "jat-qub2.7")
 * @returns Parent ID or null if not hierarchical
 *
 * @example
 * extractParentId("jat-abc.1") // "jat-abc"
 * extractParentId("jat-qub2.7") // "jat-qub2"
 * extractParentId("jat-abc.10") // "jat-abc"
 * extractParentId("jat-abc") // null (not hierarchical)
 * extractParentId("invalid") // null
 */
export function extractParentId(taskId: string): string | null {
  if (!taskId || typeof taskId !== 'string') {
    return null;
  }

  // Hierarchical IDs have format: parentId.childNumber (e.g., "jat-abc.1", "jat-qub2.7")
  // The dot must be followed by one or more digits
  const match = taskId.match(/^(.+)\.(\d+)$/);

  if (!match) {
    return null;
  }

  const [, parentId] = match;

  // Validate parent ID isn't empty
  if (!parentId || parentId.trim() === '') {
    return null;
  }

  return parentId;
}

/**
 * Check if a task ID is hierarchical (has a parent)
 *
 * @param taskId - Task ID to check
 * @returns true if the ID has hierarchical format (parent.child)
 *
 * @example
 * isHierarchicalId("jat-abc.1") // true
 * isHierarchicalId("jat-abc") // false
 */
export function isHierarchicalId(taskId: string): boolean {
  return extractParentId(taskId) !== null;
}

/**
 * Extract child number from a hierarchical task ID
 *
 * @param taskId - Task ID (e.g., "jat-abc.1", "jat-abc.10")
 * @returns Child number or null if not hierarchical
 *
 * @example
 * extractChildNumber("jat-abc.1") // 1
 * extractChildNumber("jat-abc.10") // 10
 * extractChildNumber("jat-abc") // null
 */
export function extractChildNumber(taskId: string): number | null {
  if (!taskId || typeof taskId !== 'string') {
    return null;
  }

  // Hierarchical IDs have format: parentId.childNumber (e.g., "jat-abc.1", "jat-qub2.7")
  const match = taskId.match(/^.+\.(\d+)$/);

  if (!match) {
    return null;
  }

  return parseInt(match[1], 10);
}

/**
 * Compare two task IDs for sorting, handling hierarchical IDs numerically
 *
 * For hierarchical IDs (jat-abc.1, jat-abc.2), sorts by:
 * 1. Parent ID (alphabetically)
 * 2. Child number (numerically)
 *
 * For non-hierarchical IDs, sorts alphabetically.
 *
 * @param idA - First task ID
 * @param idB - Second task ID
 * @returns Negative if idA < idB, positive if idA > idB, 0 if equal
 *
 * @example
 * compareTaskIds("jat-abc.1", "jat-abc.2") // -1 (1 < 2)
 * compareTaskIds("jat-abc.2", "jat-abc.10") // -1 (2 < 10, numeric)
 * compareTaskIds("jat-abc.10", "jat-abc.2") // 1 (10 > 2)
 * compareTaskIds("jat-abc", "jat-def") // alphabetical
 */
export function compareTaskIds(idA: string, idB: string): number {
  const parentA = extractParentId(idA);
  const parentB = extractParentId(idB);
  const childA = extractChildNumber(idA);
  const childB = extractChildNumber(idB);

  // Both are hierarchical with same parent - sort by child number
  if (parentA && parentB && parentA === parentB && childA !== null && childB !== null) {
    return childA - childB;
  }

  // Both are hierarchical but different parents - sort by parent first
  if (parentA && parentB) {
    const parentCompare = parentA.localeCompare(parentB);
    if (parentCompare !== 0) return parentCompare;
    // Same parent, compare child numbers
    if (childA !== null && childB !== null) {
      return childA - childB;
    }
  }

  // One is a child of the other's ID
  // e.g., comparing "jat-abc" (parent) with "jat-abc.1" (child)
  // Parent should come first
  if (parentA === idB) return 1; // idA is child of idB, so idB comes first
  if (parentB === idA) return -1; // idB is child of idA, so idA comes first

  // Default alphabetical comparison
  return idA.localeCompare(idB);
}

/**
 * Extract unique project names from a list of tasks
 *
 * @param tasks - Array of task objects with id property
 * @returns Sorted array of project names with "All Projects" as first item
 *
 * @example
 * const tasks = [
 *   { id: "chimaro-abc", title: "Task 1" },
 *   { id: "jomarchy-xyz", title: "Task 2" },
 *   { id: "chimaro-def", title: "Task 3" },
 *   { id: "jat-ghi", title: "Task 4" }
 * ];
 *
 * getProjectsFromTasks(tasks)
 * // ["All Projects", "chimaro", "jat", "jomarchy"]
 */
export function getProjectsFromTasks(tasks: Task[]): string[] {
  if (!Array.isArray(tasks)) {
    return ['All Projects'];
  }

  // Extract unique project names
  const projectsSet = new Set<string>();

  for (const task of tasks) {
    if (!task || !task.id) {
      continue;
    }

    const project = getProjectFromTaskId(task.id);
    if (project) {
      projectsSet.add(project);
    }
  }

  // Convert to array and sort alphabetically
  const projects = Array.from(projectsSet).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  // Always return "All Projects" as the first option
  return ['All Projects', ...projects];
}

/**
 * Count tasks per project (filtered by status)
 *
 * @param tasks - Array of task objects
 * @param statusFilter - Optional status filter ('open', 'in_progress', 'blocked', 'closed', or 'all' for no filter)
 * @returns Map of project name to task count
 *
 * @example
 * const tasks = [
 *   { id: "chimaro-abc", status: "open" },
 *   { id: "chimaro-def", status: "closed" },
 *   { id: "jat-ghi", status: "open" }
 * ];
 *
 * getTaskCountByProject(tasks, 'open')
 * // Map { "chimaro" => 1, "jat" => 1 }
 *
 * getTaskCountByProject(tasks, 'all')
 * // Map { "chimaro" => 2, "jat" => 1 }
 */
export function getTaskCountByProject(tasks: Task[], statusFilter: string = 'open'): Map<string, number> {
  const counts = new Map<string, number>();

  if (!Array.isArray(tasks)) {
    return counts;
  }

  for (const task of tasks) {
    if (!task || !task.id) {
      continue;
    }

    // Apply status filter (default to 'open' to match TaskQueue default)
    if (statusFilter && statusFilter !== 'all' && task.status !== statusFilter) {
      continue;
    }

    const project = getProjectFromTaskId(task.id);
    if (project) {
      counts.set(project, (counts.get(project) || 0) + 1);
    }
  }

  return counts;
}

/**
 * Get filesystem path for a project based on task ID
 *
 * @param taskId - Task ID with project prefix (e.g., "chimaro-abc", "jat-xyz")
 * @returns Absolute path to project directory, or null if project cannot be determined
 *
 * @example
 * getProjectPath("chimaro-abc") // "/home/user/code/chimaro"
 * getProjectPath("jat-xyz") // "/home/user/code/jat"
 * getProjectPath("invalid") // null
 */
export function getProjectPath(taskId: string): string | null {
  const projectName = getProjectFromTaskId(taskId);

  if (!projectName) {
    return null;
  }

  // Map project name to filesystem path
  // All projects are in ~/code/{project-name}
  const homeDir = process.env.HOME || '~';
  return `${homeDir}/code/${projectName}`;
}

/**
 * Filter tasks by project name
 *
 * @param tasks - Array of task objects
 * @param projectName - Project to filter by ("All Projects" returns all tasks)
 * @returns Filtered array of tasks
 *
 * @example
 * const tasks = [
 *   { id: "chimaro-abc", title: "Task 1" },
 *   { id: "jat-def", title: "Task 2" }
 * ];
 *
 * filterTasksByProject(tasks, "chimaro")
 * // [{ id: "chimaro-abc", title: "Task 1" }]
 *
 * filterTasksByProject(tasks, "All Projects")
 * // [{ id: "chimaro-abc", title: "Task 1" }, { id: "jat-def", title: "Task 2" }]
 */
export function filterTasksByProject(tasks: Task[], projectName: string): Task[] {
  if (!Array.isArray(tasks)) {
    return [];
  }

  // "All Projects" returns everything
  if (projectName === 'All Projects' || !projectName) {
    return tasks;
  }

  return tasks.filter(task => {
    if (!task || !task.id) {
      return false;
    }

    const taskProject = getProjectFromTaskId(task.id);
    return taskProject === projectName;
  });
}

/**
 * Filter tasks by multiple project names (Set-based filtering)
 *
 * @param tasks - Array of task objects
 * @param projectNames - Set of project names to include (empty Set returns all tasks)
 * @returns Filtered array of tasks belonging to any of the specified projects
 *
 * @example
 * const tasks = [
 *   { id: "chimaro-abc", title: "Task 1" },
 *   { id: "jat-def", title: "Task 2" },
 *   { id: "jomarchy-ghi", title: "Task 3" }
 * ];
 *
 * // Empty set returns all tasks
 * filterTasksByProjects(tasks, new Set())
 * // [all 3 tasks]
 *
 * // Single project
 * filterTasksByProjects(tasks, new Set(["chimaro"]))
 * // [{ id: "chimaro-abc", title: "Task 1" }]
 *
 * // Multiple projects (union)
 * filterTasksByProjects(tasks, new Set(["chimaro", "jat"]))
 * // [{ id: "chimaro-abc", ... }, { id: "jat-def", ... }]
 */
export function filterTasksByProjects(tasks: Task[], projectNames: Set<string>): Task[] {
  if (!Array.isArray(tasks)) {
    return [];
  }

  // Empty set = no filter = return all tasks
  if (projectNames.size === 0) {
    return tasks;
  }

  return tasks.filter(task => {
    if (!task || !task.id) {
      return false;
    }

    const project = getProjectFromTaskId(task.id);
    return project && projectNames.has(project);
  });
}
