/**
 * Plugin metadata validation.
 *
 * Validates a plugin's metadata object against the required schema.
 * Used by the plugin loader to reject malformed plugins with clear errors.
 */

const VALID_CONFIG_FIELD_TYPES = ['string', 'number', 'boolean', 'secret', 'select', 'multiselect'];
const VALID_ITEM_FIELD_TYPES = ['string', 'enum', 'number', 'boolean'];
const VALID_FILTER_OPERATORS = [
  'equals', 'not_equals', 'contains', 'starts_with', 'ends_with',
  'regex', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in'
];
const SEMVER_RE = /^\d+\.\d+\.\d+/;

/**
 * Validate a plugin's metadata object.
 *
 * @param {import('../adapters/base.js').PluginMetadata} metadata
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMetadata(metadata) {
  const errors = [];

  if (!metadata || typeof metadata !== 'object') {
    return { valid: false, errors: ['metadata must be an object'] };
  }

  // Required string fields
  for (const field of ['type', 'name', 'description', 'version']) {
    if (typeof metadata[field] !== 'string' || metadata[field].length === 0) {
      errors.push(`metadata.${field} is required and must be a non-empty string`);
    }
  }

  // Type must be a simple identifier
  if (typeof metadata.type === 'string' && !/^[a-z][a-z0-9_-]*$/.test(metadata.type)) {
    errors.push(`metadata.type must be lowercase alphanumeric with hyphens/underscores (got "${metadata.type}")`);
  }

  // Version must be semver-ish
  if (typeof metadata.version === 'string' && !SEMVER_RE.test(metadata.version)) {
    errors.push(`metadata.version must be semver (e.g. "1.0.0"), got "${metadata.version}"`);
  }

  // Optional author
  if (metadata.author !== undefined && typeof metadata.author !== 'string') {
    errors.push('metadata.author must be a string if provided');
  }

  // configFields (required, array)
  if (!Array.isArray(metadata.configFields)) {
    errors.push('metadata.configFields is required and must be an array');
  } else {
    metadata.configFields.forEach((field, i) => {
      errors.push(...validateConfigField(field, i));
    });
  }

  // itemFields (required, array)
  if (!Array.isArray(metadata.itemFields)) {
    errors.push('metadata.itemFields is required and must be an array');
  } else {
    metadata.itemFields.forEach((field, i) => {
      errors.push(...validateItemField(field, i));
    });
  }

  // defaultFilter (optional, array)
  if (metadata.defaultFilter !== undefined) {
    if (!Array.isArray(metadata.defaultFilter)) {
      errors.push('metadata.defaultFilter must be an array if provided');
    } else {
      const itemFieldKeys = Array.isArray(metadata.itemFields)
        ? new Set(metadata.itemFields.map(f => f.key))
        : new Set();
      metadata.defaultFilter.forEach((cond, i) => {
        errors.push(...validateFilterCondition(cond, i, itemFieldKeys));
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * @param {import('../adapters/base.js').ConfigField} field
 * @param {number} index
 * @returns {string[]}
 */
function validateConfigField(field, index) {
  const errors = [];
  const prefix = `configFields[${index}]`;

  if (!field || typeof field !== 'object') {
    return [`${prefix} must be an object`];
  }

  if (typeof field.key !== 'string' || field.key.length === 0) {
    errors.push(`${prefix}.key is required and must be a non-empty string`);
  }

  if (typeof field.label !== 'string' || field.label.length === 0) {
    errors.push(`${prefix}.label is required and must be a non-empty string`);
  }

  if (!VALID_CONFIG_FIELD_TYPES.includes(field.type)) {
    errors.push(`${prefix}.type must be one of: ${VALID_CONFIG_FIELD_TYPES.join(', ')} (got "${field.type}")`);
  }

  // select/multiselect require options
  if ((field.type === 'select' || field.type === 'multiselect') && !Array.isArray(field.options)) {
    errors.push(`${prefix}.options is required for type "${field.type}"`);
  }

  if (field.options !== undefined && Array.isArray(field.options)) {
    field.options.forEach((opt, j) => {
      if (!opt || typeof opt !== 'object' || typeof opt.value !== 'string' || typeof opt.label !== 'string') {
        errors.push(`${prefix}.options[${j}] must have string "value" and "label" properties`);
      }
    });
  }

  if (field.required !== undefined && typeof field.required !== 'boolean') {
    errors.push(`${prefix}.required must be a boolean if provided`);
  }

  if (field.placeholder !== undefined && typeof field.placeholder !== 'string') {
    errors.push(`${prefix}.placeholder must be a string if provided`);
  }

  if (field.helpText !== undefined && typeof field.helpText !== 'string') {
    errors.push(`${prefix}.helpText must be a string if provided`);
  }

  return errors;
}

/**
 * @param {import('../adapters/base.js').ItemField} field
 * @param {number} index
 * @returns {string[]}
 */
function validateItemField(field, index) {
  const errors = [];
  const prefix = `itemFields[${index}]`;

  if (!field || typeof field !== 'object') {
    return [`${prefix} must be an object`];
  }

  if (typeof field.key !== 'string' || field.key.length === 0) {
    errors.push(`${prefix}.key is required and must be a non-empty string`);
  }

  if (typeof field.label !== 'string' || field.label.length === 0) {
    errors.push(`${prefix}.label is required and must be a non-empty string`);
  }

  if (!VALID_ITEM_FIELD_TYPES.includes(field.type)) {
    errors.push(`${prefix}.type must be one of: ${VALID_ITEM_FIELD_TYPES.join(', ')} (got "${field.type}")`);
  }

  // enum type requires values
  if (field.type === 'enum' && !Array.isArray(field.values)) {
    errors.push(`${prefix}.values is required for type "enum"`);
  }

  if (field.values !== undefined && Array.isArray(field.values)) {
    field.values.forEach((v, j) => {
      if (typeof v !== 'string') {
        errors.push(`${prefix}.values[${j}] must be a string`);
      }
    });
  }

  return errors;
}

/**
 * @param {import('../adapters/base.js').FilterCondition} cond
 * @param {number} index
 * @param {Set<string>} validFieldKeys
 * @returns {string[]}
 */
function validateFilterCondition(cond, index, validFieldKeys) {
  const errors = [];
  const prefix = `defaultFilter[${index}]`;

  if (!cond || typeof cond !== 'object') {
    return [`${prefix} must be an object`];
  }

  if (typeof cond.field !== 'string' || cond.field.length === 0) {
    errors.push(`${prefix}.field is required and must be a non-empty string`);
  } else if (validFieldKeys.size > 0 && !validFieldKeys.has(cond.field)) {
    errors.push(`${prefix}.field "${cond.field}" does not match any declared itemField`);
  }

  if (!VALID_FILTER_OPERATORS.includes(cond.operator)) {
    errors.push(`${prefix}.operator must be one of: ${VALID_FILTER_OPERATORS.join(', ')} (got "${cond.operator}")`);
  }

  if (cond.value === undefined) {
    errors.push(`${prefix}.value is required`);
  }

  return errors;
}

/**
 * Validate that an adapter class has the required methods.
 *
 * @param {Function} AdapterClass - The adapter class (constructor)
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAdapterClass(AdapterClass) {
  const errors = [];

  if (typeof AdapterClass !== 'function') {
    return { valid: false, errors: ['adapter default export must be a class/constructor'] };
  }

  const proto = AdapterClass.prototype;
  for (const method of ['poll', 'test']) {
    if (typeof proto[method] !== 'function') {
      errors.push(`adapter must implement ${method}()`);
    }
  }

  return { valid: errors.length === 0, errors };
}
