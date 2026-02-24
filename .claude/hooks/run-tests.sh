#!/bin/bash
# Run tests and write PASS/FAIL marker
# Usage:
#   bash .claude/hooks/run-tests.sh                    # Full suite (lead only)
#   bash .claude/hooks/run-tests.sh --feature invoices # Feature tests (agents)

WORKFLOW_DIR=".claude/workflow"
MARKER="$WORKFLOW_DIR/test-result.txt"
mkdir -p "$WORKFLOW_DIR"

FEATURE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --feature)
      FEATURE="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [ -n "$FEATURE" ]; then
  # Feature-scoped tests
  echo "Running tests for feature: $FEATURE"
  npm run test --workspace=packages/web -- "src/features/$FEATURE/" 2>&1
  EXIT_CODE=$?
else
  # Full suite
  echo "Running full test suite..."
  npm test 2>&1
  EXIT_CODE=$?
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [ $EXIT_CODE -eq 0 ]; then
  echo "PASS $TIMESTAMP" > "$MARKER"
  echo "Tests PASSED"
else
  echo "FAIL $TIMESTAMP" > "$MARKER"
  echo "Tests FAILED (exit code: $EXIT_CODE)"

  # Log failure to issues.md
  LOCK="$WORKFLOW_DIR/.issues.lock"
  ISSUES_FILE="$WORKFLOW_DIR/issues.md"
  ENTRY="- [$TIMESTAMP] [test_failure] Tests failed with exit code $EXIT_CODE"

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
fi

exit $EXIT_CODE
