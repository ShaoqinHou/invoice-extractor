#!/bin/bash
# Stop hook — nudges Claude to run /verify if new code exists without verification

WORKFLOW_DIR=".claude/workflow"
VERIFY_MARKER="$WORKFLOW_DIR/verify-marker.txt"
GUARD="$WORKFLOW_DIR/.stop_hook_active"

# Ensure workflow dir exists
mkdir -p "$WORKFLOW_DIR"

# Prevent infinite loop: if we already nudged, don't block again
if [ -f "$GUARD" ]; then
  rm -f "$GUARD"
  exit 0
fi

# Check if source files changed recently without verify marker
# Use git to detect uncommitted changes in packages/
CHANGED_SOURCE=$(git diff --name-only HEAD 2>/dev/null | grep -E '^packages/.*\.(ts|tsx)$' | head -1)
# Also check untracked source files
UNTRACKED_SOURCE=$(git ls-files --others --exclude-standard 2>/dev/null | grep -E '^packages/.*\.(ts|tsx)$' | head -1)

HAS_CHANGES=""
if [ -n "$CHANGED_SOURCE" ] || [ -n "$UNTRACKED_SOURCE" ]; then
  HAS_CHANGES="yes"
fi

if [ -n "$HAS_CHANGES" ]; then
  # Check if verify marker exists and is recent (less than 30 min old)
  NEEDS_VERIFY="yes"
  if [ -f "$VERIFY_MARKER" ]; then
    MARKER_AGE=$(( $(date +%s) - $(date -r "$VERIFY_MARKER" +%s 2>/dev/null || echo 0) ))
    if [ "$MARKER_AGE" -lt 1800 ]; then
      NEEDS_VERIFY=""
    fi
  fi

  if [ -n "$NEEDS_VERIFY" ]; then
    # Set guard to prevent next Stop from blocking again
    touch "$GUARD"
    cat <<'JSON'
{"decision":"block","reason":"You have new code changes but no recent E2E verification. Please run /verify to check your changes in the browser before stopping."}
JSON
    exit 0
  fi
fi

exit 0
