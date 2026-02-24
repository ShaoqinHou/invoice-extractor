#!/bin/bash
# PostToolUse hook for Edit/Write — checks cross-feature imports

# Parse the file path from tool input (passed as $1)
TOOL_INPUT="$1"

# Try to extract file_path from the input
FILE_PATH=""
if command -v jq &>/dev/null; then
  FILE_PATH=$(echo "$TOOL_INPUT" | jq -r '.file_path // empty' 2>/dev/null)
else
  # Fallback: use node for JSON parsing
  FILE_PATH=$(node -e "try{console.log(JSON.parse(process.argv[1]).file_path||'')}catch{console.log('')}" "$TOOL_INPUT" 2>/dev/null)
fi

# Only check .ts/.tsx files in features/
if [[ ! "$FILE_PATH" =~ features/ ]] || [[ ! "$FILE_PATH" =~ \.(ts|tsx)$ ]]; then
  exit 0
fi

# Extract the feature name from the path
FEATURE=$(echo "$FILE_PATH" | sed -n 's|.*features/\([^/]*\)/.*|\1|p')
if [ -z "$FEATURE" ]; then
  exit 0
fi

# Check for cross-feature imports in the file
VIOLATIONS=""
if [ -f "$FILE_PATH" ]; then
  # Look for imports from other features
  while IFS= read -r line; do
    # Check if line imports from features/ but not from the same feature
    if echo "$line" | grep -qE "from.*['\"].*features/" ; then
      IMPORTED_FEATURE=$(echo "$line" | sed -n "s|.*features/\([^/'\"]*\).*|\1|p")
      if [ -n "$IMPORTED_FEATURE" ] && [ "$IMPORTED_FEATURE" != "$FEATURE" ]; then
        VIOLATIONS="${VIOLATIONS}\n  - ${FILE_PATH}: imports from features/${IMPORTED_FEATURE}"
      fi
    fi
  done < "$FILE_PATH"
fi

if [ -n "$VIOLATIONS" ]; then
  WORKFLOW_DIR=".claude/workflow"
  LOCK="$WORKFLOW_DIR/.issues.lock"
  ISSUES_FILE="$WORKFLOW_DIR/issues.md"

  # Safe concurrent write with lockfile
  _write_issue() {
    echo "- [$(date -u +%Y-%m-%d)] [cross-feature-import] ${FILE_PATH} imports from another feature: ${VIOLATIONS}" >> "$ISSUES_FILE"
  }

  if command -v flock &>/dev/null; then
    (
      flock -w 5 200 || { _write_issue; exit 0; }
      _write_issue
    ) 200>"$LOCK"
  else
    # mkdir-based lock fallback for MINGW64
    LOCKDIR="$WORKFLOW_DIR/.issues.lockdir"
    if mkdir "$LOCKDIR" 2>/dev/null; then
      _write_issue
      rmdir "$LOCKDIR"
    else
      sleep 0.5
      _write_issue
    fi
  fi

  cat <<EOF
{"additionalContext": "WARNING: Cross-feature import detected in ${FILE_PATH}. Feature '${FEATURE}' imports from another feature. Use shared components in components/ui/ or components/patterns/ instead."}
EOF
fi

exit 0
