const PREFIX = '[squad-ingest]';

function timestamp() {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z/, '');
}

export function log(msg, sourceId) {
  const src = sourceId ? ` [${sourceId}]` : '';
  process.stderr.write(`${PREFIX}${src} ${msg}\n`);
}

export function info(msg, sourceId) {
  log(msg, sourceId);
}

export function error(msg, sourceId) {
  log(`error: ${msg}`, sourceId);
}

export function warn(msg, sourceId) {
  log(`warn: ${msg}`, sourceId);
}

export function ready(sourceCount) {
  log(`ready - polling ${sourceCount} source${sourceCount !== 1 ? 's' : ''}`);
}

export function polled(sourceId, newCount, skippedCount) {
  log(`polled: ${newCount} new, ${skippedCount} skipped`, sourceId);
}

export function shutting() {
  log('shutting down...');
}
