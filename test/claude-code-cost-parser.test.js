const test = require('node:test');
const assert = require('node:assert/strict');

const { parseClaudeCodeCostAndTokens } = require('../core/agentelo-local/parsers/claude-code');

test('parses claude result usage and cost from stdout JSONL', () => {
  const stdoutText = [
    '{"type":"message","text":"starting"}',
    '{"type":"result","usage":{"input_tokens":120,"cache_creation_input_tokens":30,"cache_read_input_tokens":50,"output_tokens":80},"total_cost_usd":0.0123}',
  ].join('\n');

  const parsed = parseClaudeCodeCostAndTokens({ stdoutText, logContent: '' });
  assert.equal(parsed.tokensIn, 200);
  assert.equal(parsed.tokensOut, 80);
  assert.equal(parsed.costUsd, 0.0123);
});

test('falls back to log content when stdout has no result line', () => {
  const logContent = [
    'noise line',
    '{"type":"result","usage":{"input_tokens":11,"cache_creation_input_tokens":2,"cache_read_input_tokens":3,"output_tokens":7},"total_cost_usd":"0.0009"}',
  ].join('\n');

  const parsed = parseClaudeCodeCostAndTokens({ stdoutText: 'not-json', logContent });
  assert.equal(parsed.tokensIn, 16);
  assert.equal(parsed.tokensOut, 7);
  assert.equal(parsed.costUsd, 0.0009);
});

test('parses most recent result line by scanning from end', () => {
  const stdoutText = [
    '{"type":"result","usage":{"input_tokens":1,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":1},"total_cost_usd":0.0001}',
    '{"type":"result","usage":{"input_tokens":3,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":4},"total_cost_usd":0.0005}',
  ].join('\n');

  const parsed = parseClaudeCodeCostAndTokens({ stdoutText, logContent: '' });
  assert.equal(parsed.tokensIn, 3);
  assert.equal(parsed.tokensOut, 4);
  assert.equal(parsed.costUsd, 0.0005);
});

test('returns zeros when no parseable claude result is present', () => {
  const parsed = parseClaudeCodeCostAndTokens({
    stdoutText: '{"type":"message","usage":{"input_tokens":10}}',
    logContent: 'still not a result',
  });

  assert.equal(parsed.tokensIn, 0);
  assert.equal(parsed.tokensOut, 0);
  assert.equal(parsed.costUsd, 0);
});
