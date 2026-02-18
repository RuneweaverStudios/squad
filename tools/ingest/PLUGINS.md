# Ingest Plugin Format Specification

Ingest plugins are self-contained modules that teach the ingest daemon how to poll an external source (RSS, Slack, Telegram, API, etc.) and produce items for task creation.

## Plugin Structure

A plugin is a directory with an `index.js` entry point:

```
my-plugin/
  index.js       # Exports metadata + default adapter class
  package.json   # (optional) If the plugin has npm dependencies
  node_modules/  # (optional) Plugin manages its own deps
```

### Exports

Every plugin must export two things:

```js
import { BaseAdapter } from '../base.js';  // built-in
// or for user plugins:
// import { BaseAdapter } from 'squad-ingest/adapters/base.js';

export const metadata = {
  type: 'my-source',
  name: 'My Source',
  description: 'Ingests items from My Source',
  version: '1.0.0',
  author: 'Your Name',           // optional
  configFields: [ /* ... */ ],
  itemFields: [ /* ... */ ],
  defaultFilter: [ /* ... */ ],  // optional
};

export default class MyAdapter extends BaseAdapter {
  constructor() { super('my-source'); }
  async poll(sourceConfig, adapterState, getSecret) { /* ... */ }
  validate(sourceConfig) { /* ... */ }
  async test(sourceConfig, getSecret) { /* ... */ }
}
```

## Plugin Directories

Plugins are discovered from two directories:

| Directory | Purpose |
|-----------|---------|
| `tools/ingest/adapters/*/index.js` | Built-in adapters (ship with SQUAD) |
| `~/.config/squad/ingest-plugins/*/index.js` | User-installed plugins |

If both directories contain a plugin with the same `type`, the user plugin wins.

---

## Metadata Schema

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Unique identifier. Lowercase alphanumeric, hyphens, underscores. (e.g. `'rss'`, `'cloudflare'`) |
| `name` | `string` | Display name shown in the IDE. (e.g. `'RSS Feed'`) |
| `description` | `string` | Short description of what this plugin ingests. |
| `version` | `string` | Semver version. (e.g. `'1.0.0'`) |
| `configFields` | `ConfigField[]` | Source-specific configuration fields (drives IDE form rendering). |
| `itemFields` | `ItemField[]` | Filterable properties on ingested items. |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `author` | `string` | Plugin author name. |
| `defaultFilter` | `FilterCondition[]` | Default filter applied when no user filter is configured. |

---

## ConfigField

Describes a configuration field for the source. The IDE renders these as form inputs when creating/editing an integration source.

```js
{
  key: 'feedUrl',           // Key in the source config object
  label: 'Feed URL',        // Form label
  type: 'string',           // Field type (see below)
  required: true,           // Whether the field is required (default: false)
  default: undefined,       // Default value (optional)
  options: undefined,       // For select/multiselect only
  placeholder: 'https://example.com/feed.xml',  // optional
  helpText: 'The RSS/Atom feed URL to poll'      // optional
}
```

### ConfigField Types

| Type | Rendered As | Notes |
|------|-------------|-------|
| `string` | Text input | General-purpose text |
| `number` | Number input | Numeric value |
| `boolean` | Toggle/checkbox | On/off flag |
| `secret` | Password input | Value stored via `squad-secret`, not in config file |
| `select` | Dropdown | Requires `options` array |
| `multiselect` | Multi-select chips | Requires `options` array |

### Options Format (for select/multiselect)

```js
options: [
  { value: 'all', label: 'All channels' },
  { value: 'specific', label: 'Specific channel' }
]
```

---

## ItemField

Describes a filterable property on ingested items. These are used by the filter engine and the IDE's filter builder UI.

```js
{
  key: 'category',    // Matches key in item.fields
  label: 'Category',  // Human-readable label
  type: 'string',     // Field type (see below)
  values: undefined   // For enum type only
}
```

### ItemField Types

| Type | Description | Filter Operators |
|------|-------------|-----------------|
| `string` | Free-text value | equals, not_equals, contains, starts_with, ends_with, regex |
| `enum` | One of a fixed set of values | equals, not_equals, in, not_in |
| `number` | Numeric value | equals, not_equals, gt, gte, lt, lte |
| `boolean` | True/false | equals, not_equals |

### Enum Values

Enum fields require a `values` array listing all possible values:

```js
{
  key: 'chatType',
  label: 'Chat Type',
  type: 'enum',
  values: ['private', 'group', 'supergroup', 'channel']
}
```

---

## FilterCondition

A single filter condition. Multiple conditions are combined with AND logic.

```js
{
  field: 'status',       // Must match an itemField key
  operator: 'equals',   // See operator list below
  value: 'failure'       // Comparison value
}
```

### Operators

| Operator | Works With | Description |
|----------|-----------|-------------|
| `equals` | all types | Exact match |
| `not_equals` | all types | Not equal |
| `contains` | string | Substring match |
| `starts_with` | string | Prefix match |
| `ends_with` | string | Suffix match |
| `regex` | string | Regular expression match |
| `gt` | number | Greater than |
| `gte` | number | Greater than or equal |
| `lt` | number | Less than |
| `lte` | number | Less than or equal |
| `in` | enum | Value is in list |
| `not_in` | enum | Value is not in list |

### Filter Resolution Order

1. `source.filter` in integrations config (user override)
2. `metadata.defaultFilter` (plugin default)
3. No filter (pass everything through)

---

## Adapter Contract

All adapters extend `BaseAdapter` and implement these methods:

### `poll(sourceConfig, adapterState, getSecret) → PollResult`

**Required.** Called on each poll cycle to fetch new items.

- `sourceConfig` - The source's configuration from integrations.json (includes all config field values)
- `adapterState` - Persisted state from the previous poll (cursors, offsets, timestamps). Empty object `{}` on first poll.
- `getSecret(name)` - Function to retrieve a secret by name from `squad-secret`

Returns:

```js
{
  items: [
    {
      id: 'unique-item-id',          // Unique within this source
      title: 'Item title',
      description: 'Item body text',
      hash: 'abc123def456',           // Content hash for dedup (hex)
      author: 'Author Name',          // optional
      timestamp: '2025-01-15T12:00:00Z',
      attachments: [                   // optional
        { url: 'https://...', type: 'image', filename: 'photo.jpg' }
      ],
      fields: {                        // optional - matches declared itemFields
        category: 'tech',
        hasImage: true
      }
    }
  ],
  state: {
    // Updated adapter state to persist for next poll
    lastSeenId: 'unique-item-id',
    cursor: 'next-page-token'
  }
}
```

### `validate(sourceConfig) → ValidateResult`

**Optional** (base returns `{ valid: true }`). Validates config without network calls.

```js
validate(source) {
  if (!source.feedUrl) {
    return { valid: false, error: 'feedUrl is required' };
  }
  return { valid: true };
}
```

### `test(sourceConfig, getSecret) → TestResult`

**Required.** Makes a real connection and returns sample items.

```js
{
  ok: true,
  message: 'Connected to feed "Tech News" with 25 items',
  sampleItems: [
    { id: '...', title: '...', description: '...', timestamp: '...' }
  ]
}
```

### `pollReplies(source, threads, getSecret) → replies[]`

**Optional.** For adapters that support threaded conversations (e.g. Slack). Default returns `[]`.

---

## Item Structure

Items returned by `poll()` have these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier within this source |
| `title` | `string` | Yes | Item title |
| `description` | `string` | Yes | Item body/description |
| `hash` | `string` | Yes | Content hash for dedup (hex string) |
| `author` | `string` | No | Author name |
| `timestamp` | `string` | Yes | ISO 8601 timestamp |
| `attachments` | `Attachment[]` | No | Attached media |
| `fields` | `Record<string, string\|number\|boolean>` | No | Plugin-declared filterable fields |

### Attachment Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | `string` | Yes | Resource URL |
| `type` | `string` | No | Type hint: `'image'`, `'file'`, etc. (default: `'image'`) |
| `filename` | `string` | No | Original filename |
| `localPath` | `string` | No | Set if file is already downloaded locally |

---

## Validation

Plugin metadata is validated on load by `lib/pluginSchema.js`:

```js
import { validateMetadata, validateAdapterClass } from './lib/pluginSchema.js';

const { valid, errors } = validateMetadata(plugin.metadata);
if (!valid) {
  console.error('Invalid plugin metadata:', errors);
}

const adapterResult = validateAdapterClass(plugin.default);
if (!adapterResult.valid) {
  console.error('Invalid adapter:', adapterResult.errors);
}
```

### What Gets Validated

- All required metadata fields are present and correct type
- `type` is lowercase alphanumeric with hyphens/underscores
- `version` is semver format
- `configFields` entries have valid key, label, and type
- `select`/`multiselect` fields include `options`
- `itemFields` entries have valid key, label, and type
- `enum` fields include `values`
- `defaultFilter` conditions reference valid itemField keys
- Filter operators are from the allowed set
- Adapter class implements `poll()` and `test()`

---

## Example: RSS Plugin

```js
import RssParser from 'rss-parser';
import { createHash } from 'node:crypto';
import { BaseAdapter, makeAttachment } from './base.js';

export const metadata = {
  type: 'rss',
  name: 'RSS Feed',
  description: 'Ingests items from RSS and Atom feeds',
  version: '1.0.0',
  configFields: [
    {
      key: 'feedUrl',
      label: 'Feed URL',
      type: 'string',
      required: true,
      placeholder: 'https://example.com/feed.xml',
      helpText: 'The RSS or Atom feed URL to poll'
    }
  ],
  itemFields: [
    { key: 'category', label: 'Category', type: 'string' },
    { key: 'author', label: 'Author', type: 'string' },
    { key: 'hasImage', label: 'Has Image', type: 'boolean' }
  ]
};

export default class RssAdapter extends BaseAdapter {
  constructor() { super('rss'); }

  validate(source) {
    if (!source.feedUrl) return { valid: false, error: 'feedUrl is required' };
    try { new URL(source.feedUrl); } catch {
      return { valid: false, error: `Invalid feedUrl: ${source.feedUrl}` };
    }
    return { valid: true };
  }

  async poll(source, adapterState, _getSecret) {
    // ... fetch and parse feed ...
    // Each item includes:
    //   fields: { category: 'tech', author: 'Jane', hasImage: true }
  }

  async test(source, _getSecret) {
    // ... connect and return sample items ...
  }
}
```
