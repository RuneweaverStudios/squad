import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as logger from './logger.js';

// Resolve jat root from this file's location (tools/ingest/lib/ → jat/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const JAT_ROOT = join(__dirname, '..', '..', '..');
const TASK_IMAGES_PATH = join(JAT_ROOT, '.jat', 'task-images.json');

/**
 * Create a task via jt create CLI.
 * Returns the created task ID or null on failure.
 */
export function createTask(source, item, downloadedAttachments = []) {
  const defaults = source.taskDefaults || {};
  const type = defaults.type || 'task';
  const priority = String(defaults.priority ?? 2);
  const labels = defaults.labels || [];

  const description = buildDescription(item, downloadedAttachments);

  const args = [
    'create',
    item.title,
    '--type', type,
    '--priority', priority,
    '--description', description
  ];

  if (labels.length > 0) {
    args.push('--labels', labels.join(','));
  }

  if (item.author) {
    args.push('--notes', `Author: ${item.author}`);
  }

  try {
    const output = execFileSync('jt', args, {
      encoding: 'utf-8',
      timeout: 15000,
      cwd: getProjectPath(source.project)
    }).trim();
    // jt create outputs "Created jat-xxxxx: Title" - extract the task ID
    const match = output.match(/^Created\s+(\S+):/);
    const taskId = match ? match[1] : output;

    logger.info(`created task ${taskId}: ${item.title.slice(0, 60)}`, source.id);
    return taskId;
  } catch (err) {
    logger.error(`jt create failed: ${err.message}`, source.id);
    return null;
  }
}

function buildDescription(item, attachments) {
  const parts = [];

  if (item.author) {
    parts.push(`From: ${item.author}`);
  }

  if (item.description) {
    parts.push(item.description);
  }

  if (attachments.length > 0) {
    parts.push('');
    parts.push('Attachments:');
    for (const att of attachments) {
      if (att.localPath) {
        parts.push(`- ${att.localPath}`);
      } else if (att.error) {
        parts.push(`- ${att.error}`);
      }
    }
  }

  if (item.permalink) {
    parts.push('');
    parts.push(`[View in Slack](${item.permalink})`);
  }

  if (item.timestamp) {
    parts.push(`Source: ${item.timestamp}`);
  }

  return parts.join('\n');
}

/**
 * Append one or more replies to a task description in a single read-write cycle.
 * @param {string} taskId
 * @param {Array<{text: string, author: string, timestamp: string}>} replies
 * @param {string} project
 * @returns {boolean}
 */
export function appendToTask(taskId, replies, project) {
  if (!replies || replies.length === 0) return false;
  const cwd = getProjectPath(project);

  // Read current task description once
  let currentDesc = '';
  try {
    const showOutput = execFileSync('jt', ['show', taskId, '--json'], {
      encoding: 'utf-8',
      timeout: 15000,
      cwd
    });
    const parsed = JSON.parse(showOutput);
    const task = Array.isArray(parsed) ? parsed[0] : parsed;
    currentDesc = task?.description || '';
  } catch (err) {
    logger.error(`jt show failed for ${taskId}: ${err.message}`);
    return false;
  }

  // Format all reply blocks at once
  let newDesc = currentDesc;
  for (const reply of replies) {
    const ts = reply.timestamp || new Date().toISOString();
    const author = reply.author || 'unknown';
    newDesc += `\n---\n**Reply from ${author}** (${ts}):\n${reply.text}`;
    if (reply.downloaded?.length > 0) {
      for (const att of reply.downloaded) {
        if (att.localPath) {
          newDesc += `\n- ${att.localPath}`;
        }
      }
    }
  }

  // Single write with all replies
  try {
    execFileSync('jt', ['update', taskId, '--description', newDesc], {
      encoding: 'utf-8',
      timeout: 15000,
      cwd
    });
    logger.info(`appended ${replies.length} reply(s) to ${taskId}`, project);
    return true;
  } catch (err) {
    logger.error(`jt update failed for ${taskId}: ${err.message}`);
    return false;
  }
}

/**
 * Register downloaded files as task attachments in .jat/task-images.json
 * so they appear in the IDE's ATTACHMENTS section.
 */
export function registerTaskAttachments(taskId, downloadedFiles, project) {
  if (!downloadedFiles?.length) return;

  // Write to jat's .jat/task-images.json (where the IDE reads from)
  const storePath = TASK_IMAGES_PATH;

  // Load existing
  let images = {};
  try {
    if (existsSync(storePath)) {
      images = JSON.parse(readFileSync(storePath, 'utf-8'));
    }
  } catch { /* start fresh */ }

  const existing = Array.isArray(images[taskId]) ? images[taskId] : [];

  for (const file of downloadedFiles) {
    if (!file.localPath) continue;
    // Skip if already registered
    if (existing.some(img => img.path === file.localPath)) continue;

    existing.push({
      path: file.localPath,
      uploadedAt: new Date().toISOString(),
      id: `img-ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    });
  }

  images[taskId] = existing;

  try {
    mkdirSync(dirname(storePath), { recursive: true });
    writeFileSync(storePath, JSON.stringify(images, null, 2), 'utf-8');
  } catch (err) {
    logger.error(`Failed to register attachments for ${taskId}: ${err.message}`);
    return;
  }

  // Sync to task notes so agents see them via jt show
  const imageList = existing.map((img, i) => `  ${i + 1}. ${img.path}`).join('\n');
  const notes = `Author: ${project}\n📷 Attached files:\n${imageList}\n(Use Read tool to view)`;
  try {
    execFileSync('jt', ['update', taskId, '--notes', notes], {
      encoding: 'utf-8',
      timeout: 15000,
      cwd: getProjectPath(project)
    });
  } catch { /* notes sync is secondary */ }

  logger.info(`registered ${downloadedFiles.length} attachment(s) for ${taskId}`, project);
}

export function getProjectPath(projectName) {
  if (!projectName) return process.cwd();

  // Check common project locations
  const home = process.env.HOME;
  const candidates = [
    `${home}/code/${projectName}`,
    `${home}/projects/${projectName}`,
    `${home}/${projectName}`
  ];

  for (const p of candidates) {
    try {
      // Use the path if it has a .jat directory (or legacy .beads)
      try {
        execFileSync('test', ['-d', `${p}/.jat`], { timeout: 1000 });
      } catch {
        execFileSync('test', ['-d', `${p}/.beads`], { timeout: 1000 });
      }
      return p;
    } catch { /* skip */ }
  }

  // Fallback to ~/code/project
  return `${home}/code/${projectName}`;
}
