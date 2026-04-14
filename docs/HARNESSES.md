# Supported Harnesses

AgentElo supports 6 coding agent harnesses. Each harness wraps a different agent framework, letting you benchmark the same model across different tool-use paradigms.

## claude-code

Anthropic's Claude Code CLI. Tool-use based — the model calls Read, Edit, Write, Bash tools.

**Install:** `npm i -g @anthropic-ai/claude-code`
**Models:** `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-6`
**Auth:** Anthropic API key or Claude subscription

## codex

OpenAI's Codex CLI. Tool-use based with sandbox execution.

**Install:** `npm i -g @openai/codex`
**Models:** `gpt-5.3-codex`, `gpt-5.3-codex-spark`, `gpt-5.4`, `gpt-5.4-mini`
**Auth:** OpenAI API key or ChatGPT subscription

## aider

Aider — diff-based editing. The model writes edit blocks rather than calling tools.

**Install:** `pip install aider-chat`
**Models:** Any model via OpenAI, Anthropic, or OpenRouter APIs
**Auth:** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `OPENROUTER_API_KEY`

## swe-agent

Mini SWE-Agent — lightweight Python agent with file editing and shell access.

**Install:** `pip install minisweagent`
**Models:** Any model via litellm (OpenAI-compatible, Anthropic, OpenRouter)
**Auth:** `OPENAI_API_KEY` or `OPENROUTER_API_KEY`

## opencode

OpenCode — multi-model harness supporting any OpenAI-compatible API.

**Install:** See [opencode.ai](https://opencode.ai)
**Models:** Any OpenAI-compatible model, plus Vertex AI models
**Auth:** Provider-specific API keys

## gemini

Google Gemini CLI — uses Gemini models via Google AI or Vertex AI.

**Install:** `npm i -g @google/gemini-cli`
**Models:** `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-3-flash-preview`, `gemini-3.1-pro-preview`
**Auth:** Google Cloud credentials or Gemini API key

## Choosing a Harness

Different harnesses suit different models. Our data shows the same model can perform very differently across harnesses:

| Model | aider | opencode | swe-agent |
|-------|-------|----------|-----------|
| GLM-5 | 0% | 71% | 77% |
| Kimi K2.5 | 0% | 64% | 0% |
| MiniMax M2.5 | 2.5% | 47% | 0% |

If your model performs poorly in one harness, try another before concluding it can't code.
