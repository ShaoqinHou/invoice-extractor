#!/bin/bash
# Task completion check — verifies test evidence exists when source files changed

WORKFLOW_DIR=".claude/workflow"
MARKER="$WORKFLOW_DIR/test-result.txt"

# Check if source files were changed (git diff against HEAD)
CHANGED_SOURCE=$(git diff --name-only HEAD 2>/dev/null | grep -E '^packages/.*\.(ts|tsx)$' | head -1)
UNTRACKED_SOURCE=$(git ls-files --others --exclude-standard 2>/dev/null | grep -E '^packages/.*\.(ts|tsx)$' | head -1)

# If no source changes, pass through
if [ -z "$CHANGED_SOURCE" ] && [ -z "$UNTRACKED_SOURCE" ]; then
  exit 0
fi

# Source files changed — check for PASS marker
if [ -f "$MARKER" ]; then
  RESULT=$(head -1 "$MARKER" | cut -d' ' -f1)
  if [ "$RESULT" = "PASS" ]; then
    exit 0
  fi
fi

# No PASS marker — warn (but don't block, since TaskCompleted doesn't support blocking)
cat <<'EOF'
{"additionalContext": "WARNING: Source files were changed but no passing test evidence found. Run tests with: bash .claude/hooks/run-tests.sh"}
EOF

exit 0
