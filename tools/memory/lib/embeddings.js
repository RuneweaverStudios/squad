/**
 * Embedding provider abstraction.
 * Supports OpenAI, Gemini, and Voyage embedding APIs.
 */

import { execSync } from 'node:child_process';

/**
 * Provider configurations with model defaults.
 */
const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    defaultModel: 'text-embedding-3-small',
    dimensions: { 'text-embedding-3-small': 1536, 'text-embedding-3-large': 3072 },
    envVar: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1/embeddings',
    maxBatchSize: 2048,
  },
  gemini: {
    name: 'Gemini',
    defaultModel: 'gemini-embedding-001',
    dimensions: { 'gemini-embedding-001': 3072 },
    envVar: 'GEMINI_API_KEY',
    secretAliases: ['google'],
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    maxBatchSize: 100,
  },
  voyage: {
    name: 'Voyage',
    defaultModel: 'voyage-3',
    dimensions: { 'voyage-3': 1024, 'voyage-3-lite': 512 },
    envVar: 'VOYAGE_API_KEY',
    baseUrl: 'https://api.voyageai.com/v1/embeddings',
    maxBatchSize: 128,
  },
};

/**
 * Get provider info.
 * @param {string} providerName
 * @returns {object}
 */
export function getProvider(providerName) {
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(`Unknown embedding provider: ${providerName}. Supported: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider;
}

/**
 * Get the dimension for a provider/model combination.
 * @param {string} providerName
 * @param {string} [model]
 * @returns {number}
 */
export function getDimension(providerName, model) {
  const provider = getProvider(providerName);
  model = model ?? provider.defaultModel;
  const dim = provider.dimensions[model];
  if (!dim) {
    throw new Error(`Unknown model ${model} for provider ${providerName}`);
  }
  return dim;
}

/**
 * Resolve the API key for a provider.
 * Checks environment variables and squad-secret.
 * @param {string} providerName
 * @returns {string|null}
 */
export function resolveApiKey(providerName) {
  const provider = getProvider(providerName);

  // Try squad-secret first (IDE-managed keys, more likely to be correct)
  const secretNames = [providerName, ...(provider.secretAliases ?? [])];
  for (const name of secretNames) {
    try {
      const key = execSync(`squad-secret ${name} 2>/dev/null`, { encoding: 'utf-8' }).trim();
      if (key && !key.startsWith('Error') && !key.includes('not found')) return key;
    } catch {
      // squad-secret not available or no key configured
    }
  }

  // Fall back to environment variable
  const envKey = process.env[provider.envVar];
  if (envKey) return envKey;

  return null;
}

/**
 * Generate embeddings for a batch of texts.
 * @param {string[]} texts - Array of text strings to embed
 * @param {string} providerName - "openai", "gemini", or "voyage"
 * @param {string} [model] - Specific model (defaults to provider default)
 * @param {string} [apiKey] - API key (resolved automatically if not provided)
 * @returns {Promise<Float32Array[]>} - Array of embedding vectors
 */
export async function embed(texts, providerName, model, apiKey) {
  const provider = getProvider(providerName);
  model = model ?? provider.defaultModel;

  if (!apiKey) {
    apiKey = resolveApiKey(providerName);
  }
  if (!apiKey) {
    throw new Error(
      `No API key found for ${provider.name}. Set ${provider.envVar} or configure via squad-secret.`
    );
  }

  // Batch if needed
  const results = [];
  for (let i = 0; i < texts.length; i += provider.maxBatchSize) {
    const batch = texts.slice(i, i + provider.maxBatchSize);
    const batchResults = await embedBatch(batch, providerName, model, apiKey);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Embed a single batch (within provider limits).
 * @param {string[]} texts
 * @param {string} providerName
 * @param {string} model
 * @param {string} apiKey
 * @returns {Promise<Float32Array[]>}
 */
async function embedBatch(texts, providerName, model, apiKey) {
  switch (providerName) {
    case 'openai':
      return embedOpenAI(texts, model, apiKey);
    case 'gemini':
      return embedGemini(texts, model, apiKey);
    case 'voyage':
      return embedVoyage(texts, model, apiKey);
    default:
      throw new Error(`No embed implementation for ${providerName}`);
  }
}

/**
 * OpenAI embeddings API.
 */
async function embedOpenAI(texts, model, apiKey) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: texts, model }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embedding error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.data
    .sort((a, b) => a.index - b.index)
    .map(d => new Float32Array(d.embedding));
}

/**
 * Gemini embeddings API.
 */
async function embedGemini(texts, model, apiKey) {
  // Gemini uses batchEmbedContents endpoint
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`;

  const requests = texts.map(text => ({
    model: `models/${model}`,
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT',
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini embedding error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.embeddings.map(e => new Float32Array(e.values));
}

/**
 * Voyage embeddings API.
 */
async function embedVoyage(texts, model, apiKey) {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: texts, model }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Voyage embedding error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.data
    .sort((a, b) => a.index - b.index)
    .map(d => new Float32Array(d.embedding));
}

/**
 * List available providers with their API key status.
 * @returns {Array<{ name: string, id: string, available: boolean, envVar: string }>}
 */
export function listProviders() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id,
    name: p.name,
    defaultModel: p.defaultModel,
    envVar: p.envVar,
    available: !!process.env[p.envVar],
  }));
}
