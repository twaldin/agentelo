'use strict';

// Canonical model name mapping — normalizes provider-specific IDs to model identity.
// This ensures openrouter/deepseek/deepseek-v3.2 and deepseek-ai/deepseek-v3.2-maas
// are treated as the same model for dedup and agent identity.
const CANONICAL_NAMES = {
  // Vertex AI model IDs
  'google/gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
  'google/gemini-3-flash-preview': 'gemini-3-flash-preview',
  'google/gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite-preview',
  'google/gemini-2.5-pro': 'gemini-2.5-pro',
  'google/gemini-2.5-flash': 'gemini-2.5-flash',
  'google/gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
  'deepseek-ai/deepseek-v3.2-maas': 'deepseek-v3.2',
  'deepseek-ai/deepseek-v3.1-maas': 'deepseek-v3.1',
  'deepseek-ai/deepseek-r1-0528-maas': 'deepseek-r1-0528',
  'qwen/qwen3-235b-a22b-instruct-2507-maas': 'qwen3-235b',
  'qwen/qwen3-coder-480b-a35b-instruct-maas': 'qwen3-coder',
  'qwen/qwen3-next-80b-a3b-instruct-maas': 'qwen3-next-80b',
  'qwen/qwen3-next-80b-a3b-thinking-maas': 'qwen3-next-80b-thinking',
  'meta/llama-4-scout-17b-16e-instruct-maas': 'llama-4-scout',
  'meta/llama-4-maverick-17b-128e-instruct-maas': 'llama-4-maverick',
  'meta/llama-3.3-70b-instruct-maas': 'llama-3.3-70b',
  'mistralai/codestral-2501': 'codestral-2',
  'mistralai/mistral-medium-2505': 'mistral-medium-3',
  'mistralai/mistral-large-3': 'mistral-large-3',
  'mistralai/mistral-small-3-1': 'mistral-small-3.1',
  'openai/gpt-oss-120b-maas': 'gpt-oss-120b',
  'openai/gpt-oss-20b-maas': 'gpt-oss-20b',
  'zai-org/glm-5-maas': 'glm-5',
  'zai-org/glm-4.7-maas': 'glm-4.7',
  'moonshotai/kimi-k2-thinking-maas': 'kimi-k2-thinking',
  'minimax/minimax-m2-maas': 'minimax-m2',
  // OpenRouter model IDs
  'openrouter/deepseek/deepseek-v3.2': 'deepseek-v3.2',
  'openrouter/qwen/qwen3-coder': 'qwen3-coder',
  'openrouter/qwen/qwen3-coder-flash': 'qwen3-coder-flash',
  'openrouter/qwen/qwen3-coder-next': 'qwen3-coder-next',
  'openrouter/qwen/qwen3.6-plus:free': 'qwen3.6-plus',
  'openrouter/qwen/qwen3-next-80b-a3b-instruct:free': 'qwen3-next-80b',
  'openrouter/openai/gpt-oss-120b:free': 'gpt-oss-120b',
  'openrouter/minimax/minimax-m2.5': 'minimax-m2.5',
  'openrouter/minimax/minimax-m2.7': 'minimax-m2.7',
  'openrouter/kwaipilot/kat-coder-pro-v2': 'kat-coder-pro-v2',
  'openrouter/mistralai/devstral-small': 'devstral-small',
  'openrouter/mistralai/devstral-small-2507': 'devstral-small-2507',
  'openrouter/moonshotai/kimi-k2.5': 'kimi-k2.5',
  'openrouter/moonshotai/kimi-k2:free': 'kimi-k2',
  'openrouter/z-ai/glm-4.5-air:free': 'glm-4.5-air',
  'openrouter/meta-llama/llama-3.3-70b-instruct:free': 'llama-3.3-70b',
  'openrouter/nvidia/nemotron-3-super-120b-a12b:free': 'nemotron-3-super-120b',
  'openrouter/google/gemini-2.5-flash-lite:free': 'gemini-2.5-flash-lite',
  'openrouter/google/gemma-3-27b-it:free': 'gemma-3-27b',
  'openrouter/nousresearch/hermes-3-llama-3.1-405b:free': 'hermes-3-405b',
  'openrouter/x-ai/grok-4.1-fast': 'grok-4.1-fast',
  'openrouter/x-ai/grok-code-fast-1': 'grok-code-fast-1',
  'openrouter/x-ai/grok-3-mini': 'grok-3-mini',
  // OpenAI subscription models via opencode (openai/ prefix)
  'openai/gpt-5.4': 'gpt-5.4',
  'openai/gpt-5.4-mini': 'gpt-5.4-mini',
  'openai/gpt-5.4-nano': 'gpt-5.4-nano',
  'openai/gpt-5.3-codex': 'gpt-5.3-codex',
  'openai/gpt-5.3-codex-spark': 'gpt-5.3-codex-spark',
  // Dated Claude names
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5',
};

/**
 * Resolve a raw model name to its canonical form.
 * First tries exact match in CANONICAL_NAMES, then applies generic stripping.
 */
function resolveCanonical(model) {
  if (CANONICAL_NAMES[model]) return CANONICAL_NAMES[model];

  let m = model;
  // Strip provider prefixes: openrouter/vendor/model, openai/model, google/model, etc.
  m = m.replace(/^(?:openrouter\/[^/]+\/|vertex_ai\/|openai\/|google\/|gemini\/|deepseek-ai\/|qwen\/|meta\/|zai-org\/|minimax\/|moonshotai\/|mistralai\/|kwaipilot\/|nvidia\/|nousresearch\/|x-ai\/|ollama\/)/, '');
  // Strip -maas suffix
  m = m.replace(/-maas$/, '');
  // Strip :free suffix
  m = m.replace(/:free$/, '');
  // Map dated Claude names (claude-haiku-4-5-YYYYMMDD → claude-haiku-4-5)
  m = m.replace(/^(claude-(?:haiku|sonnet|opus)-\d+-\d+)-\d{8,}$/, '$1');

  return m;
}

/**
 * Normalize an agent ID from harness + model.
 * Produces a consistent, human-readable ID like "swe-agent-deepseek-v3.2".
 *
 * Key properties:
 * - Dots preserved in version numbers (gpt-5.4, not gpt-5-4)
 * - Provider prefixes stripped (openai/, google/, openrouter/x-ai/, etc.)
 * - Suffixes stripped (-maas, :free)
 * - Harness normalized (swe → swe-agent)
 * - Colons replaced with dashes (ollama gemma4:31b → gemma4-31b)
 * - Slashes replaced with dashes
 */
function normalizeAgentId(harness, model) {
  // Normalize harness
  let h = harness;
  if (h === 'swe') h = 'swe-agent';

  // Resolve model to canonical form
  const canonical = resolveCanonical(model);

  // Clean up remaining problematic characters but preserve dots
  const cleaned = canonical
    .replace(/[\/\\:]+/g, '-')     // slashes, colons → dash
    .replace(/\s+/g, '-')          // whitespace → dash
    .replace(/[^a-zA-Z0-9.\-]/g, '') // remove anything except alphanum, dots, dashes
    .replace(/-+/g, '-')           // collapse multiple dashes
    .replace(/^-|-$/g, '')         // trim leading/trailing dashes
    .toLowerCase();

  return `${h}-${cleaned}`;
}

module.exports = { CANONICAL_NAMES, resolveCanonical, normalizeAgentId };
