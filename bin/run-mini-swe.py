#!/usr/bin/env python3
"""Headless mini-swe-agent runner for AgentElo.
Bypasses the Textual TUI by calling the Python API directly.

Usage: python3 run-mini-swe.py --model MODEL --task PROMPT --cwd DIR [--cost-limit N] [--output FILE]
"""
import argparse
import json
import os
import sys
from pathlib import Path

def main():
    # Allow free/local models with $0 cost
    os.environ.setdefault('MSWEA_COST_TRACKING', 'ignore_errors')

    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--model-class', default='litellm')
    parser.add_argument('--task', '-t', required=True)
    parser.add_argument('--cwd', default='.')
    parser.add_argument('--cost-limit', '-l', type=float, default=2.0)
    parser.add_argument('--step-limit', type=int, default=50)
    parser.add_argument('--output', '-o', default=None)
    parser.add_argument('--timeout', type=int, default=30, help='Per-command timeout in seconds')
    args = parser.parse_args()

    # Force litellm to use chat/completions (not responses API) for codex models.
    # The OAuth proxy only supports /v1/chat/completions, not /v1/responses.
    # litellm routes codex models to responses API by default — override that.
    import litellm
    for codex_model in ['gpt-5.3-codex', 'openai/gpt-5.3-codex', 'gpt-5.3-codex-spark', 'openai/gpt-5.3-codex-spark']:
        if codex_model in litellm.model_cost:
            litellm.model_cost[codex_model] = {**litellm.model_cost[codex_model], 'mode': 'chat'}

    import minisweagent
    from minisweagent.agents.default import DefaultAgent
    from minisweagent.environments.local import LocalEnvironment

    model_kwargs = {}

    # The local ChatGPT OAuth proxy serves standard chat completions reliably,
    # but streaming requests through the proxy are flaky for mini-swe/litellm.
    # Force non-streaming for proxy-backed GPT models so swe-agent is deterministic.
    openai_base_url = os.environ.get('OPENAI_BASE_URL', '')
    force_non_streaming = '127.0.0.1:10531' in openai_base_url and (
        args.model.startswith('gpt-') or args.model.startswith('openai/gpt-')
    )
    if force_non_streaming:
        model_kwargs['stream'] = False
        original_completion = litellm.completion

        def non_streaming_completion(*c_args, **c_kwargs):
            # Some mini-swe/litellm paths still smuggle streaming defaults through
            # retries or helper layers. Override at the final completion() boundary.
            c_kwargs['stream'] = False
            return original_completion(*c_args, **c_kwargs)

        litellm.completion = non_streaming_completion

    if args.model_class == 'openrouter':
        from minisweagent.models.openrouter_model import OpenRouterModel
        model = OpenRouterModel(model_name=args.model)
    else:
        from minisweagent.models.litellm_model import LitellmModel
        model = LitellmModel(model_name=args.model, model_kwargs=model_kwargs)

    env = LocalEnvironment(cwd=args.cwd, timeout=args.timeout)
    output_path = Path(args.output) if args.output else None

    # Load templates from default config
    import yaml
    config_path = Path(minisweagent.__file__).parent / 'config' / 'mini.yaml'
    with open(config_path) as f:
        cfg = yaml.safe_load(f)

    agent = DefaultAgent(
        model=model,
        env=env,
        system_template=cfg['agent']['system_template'],
        instance_template=cfg['agent']['instance_template'],
        step_limit=args.step_limit,
        cost_limit=args.cost_limit,
        output_path=output_path,
    )

    print(f"[mini-swe] Starting: model={args.model} cwd={args.cwd} cost_limit={args.cost_limit}")
    try:
        result = agent.run(args.task)
        exit_status = result.get('exit_status', 'unknown') if isinstance(result, dict) else str(result)
        print(f"[mini-swe] Done: exit_status={exit_status}")
        print(f"[mini-swe] Cost: ${getattr(agent, 'cost', 0):.4f}")
        print(f"[mini-swe] API calls: {getattr(agent, 'n_calls', 0)}")
    except Exception as e:
        print(f"[mini-swe] Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
