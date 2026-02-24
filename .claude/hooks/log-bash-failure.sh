#!/bin/bash
# PostToolUseFailure hook for Bash — logs command failures to issues.md

WORKFLOW_DIR=".claude/workflow"
ISSUES_FILE="$WORKFLOW_DIR/issues.md"
LOCK="$WORKFLOW_DIR/.issues.lock"

mkdir -p "$WORKFLOW_DIR"

# Get info from environment (Claude Code sets these for hook context)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
ENTRY="- [$TIMESTAMP] [command_failure] Bash command failed"

# Safe concurrent write
if command -v flock &>/dev/null; then
  (
    flock -w 5 200 || { echo "$ENTRY" >> "$ISSUES_FILE"; exit 0; }
    echo "$ENTRY" >> "$ISSUES_FILE"
  ) 200>"$LOCK"
else
  LOCKDIR="$WORKFLOW_DIR/.issues.lockdir"
  if mkdir "$LOCKDIR" 2>/dev/null; then
    echo "$ENTRY" >> "$ISSUES_FILE"
    rmdir "$LOCKDIR"
  else
    sleep 0.5
    echo "$ENTRY" >> "$ISSUES_FILE"
  fi
fi

exit 0
