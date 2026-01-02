#!/bin/bash

# JAT Demo Recording Reset Script
# Run this before each recording take to ensure clean state

echo "🎬 Resetting JAT demo environment..."

# 1. Reset all demo project tasks to empty
echo "📋 Clearing task lists..."
cd ~/code/jat-demo-api 2>/dev/null && {
    echo "[]" > .beads/issues.jsonl
    git add . >/dev/null 2>&1
    git commit -m "Reset for demo" >/dev/null 2>&1
    echo "  ✓ jat-demo-api reset"
}

cd ~/code/jat-demo-ui 2>/dev/null && {
    echo "[]" > .beads/issues.jsonl
    git add . >/dev/null 2>&1
    git commit -m "Reset for demo" >/dev/null 2>&1
    echo "  ✓ jat-demo-ui reset"
}

cd ~/code/jat-demo-docs 2>/dev/null && {
    echo "[]" > .beads/issues.jsonl
    git add . >/dev/null 2>&1
    git commit -m "Reset for demo" >/dev/null 2>&1
    echo "  ✓ jat-demo-docs reset"
}

# 2. Kill any running demo sessions
echo "🔪 Killing any running demo agents..."
tmux kill-session -t jat-EpicAgent 2>/dev/null && echo "  ✓ Killed EpicAgent" || echo "  - No EpicAgent running"
tmux kill-session -t jat-ApiAgent 2>/dev/null && echo "  ✓ Killed ApiAgent" || echo "  - No ApiAgent running"
tmux kill-session -t jat-UiAgent 2>/dev/null && echo "  ✓ Killed UiAgent" || echo "  - No UiAgent running"
tmux kill-session -t jat-DocsAgent 2>/dev/null && echo "  ✓ Killed DocsAgent" || echo "  - No DocsAgent running"

# 3. Clear any temporary signal files from previous demos
echo "📡 Clearing signal files..."
rm -f /tmp/jat-signal-*.json 2>/dev/null
rm -f /tmp/jat-timeline-*.jsonl 2>/dev/null
echo "  ✓ Signal files cleared"

echo ""
echo "✅ Demo environment reset complete!"
echo ""
echo "📋 Next steps:"
echo "1. Start dashboard: jat-dashboard"
echo "2. Go to http://127.0.0.1:3333/config"
echo "3. Hide real projects, show only demo projects"
echo "4. Navigate to /tasks page"
echo "5. Start recording!"
echo ""
echo "📝 Epic description is in: assets/demo-epic.txt"
echo "📖 Full instructions in: assets/RECORDING-SCRIPT.md"