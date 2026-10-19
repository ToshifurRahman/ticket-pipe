#!/usr/bin/env bash
# Run a ux-ui-agent-skills gate so its receipt lands where the Stop hook reads it.
#
# Usage: scripts/gate.sh <gate> [args...]
#   scripts/gate.sh lint_hardcodes.py web/src/index.css
#
# A gate run from a plain shell writes receipts to .ds-receipts/, but the Stop
# hook reads the plugin data dir. Setting CLAUDE_PLUGIN_DATA points the gate at
# that dir. CLAUDE_SESSION_ID stays unset, as it is in the hook's process, so
# both sides use receipts/local.jsonl.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

PLUGIN_CODE="$HOME/.claude/plugins/marketplaces/ux-ui-agent-skills"
PLUGIN_DATA="$(ls -d "$HOME"/.claude/plugins/data/ux-ui-agent-skills-* 2>/dev/null | head -1 || true)"

if [[ ! -f "$PLUGIN_CODE/scripts/gate.mjs" ]]; then
  echo "gate.sh: plugin not found at $PLUGIN_CODE/scripts/gate.mjs" >&2
  exit 2
fi
if [[ -z "$PLUGIN_DATA" ]]; then
  echo "gate.sh: no plugin data dir under ~/.claude/plugins/data/ux-ui-agent-skills-*" >&2
  exit 2
fi
if [[ $# -lt 1 ]]; then
  echo "usage: scripts/gate.sh <gate> [args...]" >&2
  exit 2
fi

env -u CLAUDE_SESSION_ID \
  CLAUDE_PLUGIN_DATA="$PLUGIN_DATA" \
  node "$PLUGIN_CODE/scripts/gate.mjs" "$@"
