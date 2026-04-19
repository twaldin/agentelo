'use strict';

function toNonNegativeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseClaudeResultLine(line) {
  if (!line) return null;
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (parsed.type !== 'result' || !parsed.usage) return null;

  const usage = parsed.usage;
  const tokensIn =
    toNonNegativeNumber(usage.input_tokens) +
    toNonNegativeNumber(usage.cache_creation_input_tokens) +
    toNonNegativeNumber(usage.cache_read_input_tokens);
  const tokensOut = toNonNegativeNumber(usage.output_tokens);
  const costUsd = toNonNegativeNumber(parsed.total_cost_usd);

  return { tokensIn, tokensOut, costUsd };
}

function parseClaudeCodeCostAndTokens({ stdoutText = '', logContent = '' }) {
  for (const src of [stdoutText, logContent]) {
    const lines = String(src).split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const parsed = parseClaudeResultLine(lines[i]);
      if (parsed) return parsed;
    }
  }
  return { tokensIn: 0, tokensOut: 0, costUsd: 0 };
}

module.exports = {
  parseClaudeCodeCostAndTokens,
};
