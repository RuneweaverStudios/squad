/**
 * Generic filter engine for ingested items.
 *
 * Applies user-configured or plugin-default filter conditions to items
 * based on the fields declared by each plugin's metadata.itemFields.
 *
 * Filter resolution order:
 *   1. source.filter in config (user override)
 *   2. metadata.defaultFilter (plugin default)
 *   3. No filter (pass everything through)
 */

/**
 * Apply filter conditions to an item. ALL conditions must match (AND logic).
 *
 * @param {import('../adapters/base.js').IngestItem} item - Item with optional .fields property
 * @param {import('../adapters/base.js').FilterCondition[]} filterConditions - Array of conditions
 * @returns {boolean} True if item passes the filter (should be ingested)
 */
export function applyFilter(item, filterConditions) {
  // Null/undefined/empty filter → pass everything
  if (!filterConditions || filterConditions.length === 0) {
    return true;
  }

  const fields = item.fields || {};

  // ALL conditions must match (AND logic)
  for (const condition of filterConditions) {
    const value = fields[condition.field];

    // Item missing a field referenced by filter → treat as no match
    if (value === undefined) {
      return false;
    }

    if (!evaluateCondition(value, condition.operator, condition.value)) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluate a single condition against a field value.
 *
 * @param {string|number|boolean} fieldValue - The item's field value
 * @param {string} operator - The comparison operator
 * @param {*} conditionValue - The value to compare against
 * @returns {boolean}
 */
function evaluateCondition(fieldValue, operator, conditionValue) {
  switch (operator) {
    case 'equals':
      return fieldValue === conditionValue;

    case 'not_equals':
      return fieldValue !== conditionValue;

    case 'contains':
      return String(fieldValue).includes(String(conditionValue));

    case 'starts_with':
      return String(fieldValue).startsWith(String(conditionValue));

    case 'ends_with':
      return String(fieldValue).endsWith(String(conditionValue));

    case 'regex': {
      try {
        const re = new RegExp(conditionValue);
        return re.test(String(fieldValue));
      } catch {
        return false;
      }
    }

    case 'gt':
      return Number(fieldValue) > Number(conditionValue);

    case 'gte':
      return Number(fieldValue) >= Number(conditionValue);

    case 'lt':
      return Number(fieldValue) < Number(conditionValue);

    case 'lte':
      return Number(fieldValue) <= Number(conditionValue);

    case 'in':
      return Array.isArray(conditionValue) && conditionValue.includes(fieldValue);

    case 'not_in':
      return Array.isArray(conditionValue) && !conditionValue.includes(fieldValue);

    default:
      return false;
  }
}

/**
 * Validate filter conditions against declared item fields.
 *
 * Checks that:
 * - Filter references valid field names from itemFields
 * - Operator is valid for the field type
 * - Value is valid for enum fields
 *
 * @param {import('../adapters/base.js').FilterCondition[]} filterConditions
 * @param {import('../adapters/base.js').ItemField[]} itemFields
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateFilter(filterConditions, itemFields) {
  const errors = [];

  if (!filterConditions || filterConditions.length === 0) {
    return { valid: true, errors: [] };
  }

  if (!Array.isArray(filterConditions)) {
    return { valid: false, errors: ['filterConditions must be an array'] };
  }

  /** @type {Map<string, import('../adapters/base.js').ItemField>} */
  const fieldMap = new Map();
  if (Array.isArray(itemFields)) {
    for (const f of itemFields) {
      fieldMap.set(f.key, f);
    }
  }

  for (let i = 0; i < filterConditions.length; i++) {
    const cond = filterConditions[i];
    const prefix = `filter[${i}]`;

    if (!cond || typeof cond !== 'object') {
      errors.push(`${prefix} must be an object`);
      continue;
    }

    // Check field reference
    if (typeof cond.field !== 'string' || cond.field.length === 0) {
      errors.push(`${prefix}.field is required`);
      continue;
    }

    const itemField = fieldMap.get(cond.field);
    if (!itemField) {
      errors.push(`${prefix}.field "${cond.field}" does not match any declared itemField`);
      continue;
    }

    // Check operator validity for field type
    if (!isOperatorValidForType(cond.operator, itemField.type)) {
      errors.push(`${prefix}.operator "${cond.operator}" is not valid for field type "${itemField.type}"`);
    }

    // Check enum values
    if (itemField.type === 'enum' && Array.isArray(itemField.values)) {
      if (cond.operator === 'equals' || cond.operator === 'not_equals') {
        if (!itemField.values.includes(cond.value)) {
          errors.push(`${prefix}.value "${cond.value}" is not a valid enum value for "${cond.field}" (allowed: ${itemField.values.join(', ')})`);
        }
      }
      if (cond.operator === 'in' || cond.operator === 'not_in') {
        if (Array.isArray(cond.value)) {
          for (const v of cond.value) {
            if (!itemField.values.includes(v)) {
              errors.push(`${prefix}.value contains "${v}" which is not a valid enum value for "${cond.field}"`);
            }
          }
        }
      }
    }

    if (cond.value === undefined) {
      errors.push(`${prefix}.value is required`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** String operators */
const STRING_OPS = ['equals', 'not_equals', 'contains', 'starts_with', 'ends_with', 'regex'];
/** Numeric operators */
const NUMBER_OPS = ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte'];
/** Enum operators */
const ENUM_OPS = ['equals', 'not_equals', 'in', 'not_in'];
/** Boolean operators */
const BOOLEAN_OPS = ['equals', 'not_equals'];

/**
 * Check if an operator is valid for a given field type.
 *
 * @param {string} operator
 * @param {import('../adapters/base.js').ItemFieldType} fieldType
 * @returns {boolean}
 */
function isOperatorValidForType(operator, fieldType) {
  switch (fieldType) {
    case 'string': return STRING_OPS.includes(operator);
    case 'number': return NUMBER_OPS.includes(operator);
    case 'enum':   return ENUM_OPS.includes(operator);
    case 'boolean': return BOOLEAN_OPS.includes(operator);
    default: return false;
  }
}

/**
 * Resolve which filter to use for a source.
 *
 * Resolution order:
 *   1. source.filter (user override from config)
 *   2. defaultFilter (plugin's default from metadata)
 *   3. null (no filter, pass everything)
 *
 * @param {import('../adapters/base.js').FilterCondition[]} [sourceFilter] - User-configured filter
 * @param {import('../adapters/base.js').FilterCondition[]} [defaultFilter] - Plugin's default filter
 * @returns {import('../adapters/base.js').FilterCondition[] | null}
 */
export function resolveFilter(sourceFilter, defaultFilter) {
  if (Array.isArray(sourceFilter) && sourceFilter.length > 0) {
    return sourceFilter;
  }
  if (Array.isArray(defaultFilter) && defaultFilter.length > 0) {
    return defaultFilter;
  }
  return null;
}
