# Troubleshooting

Solutions for the most common SQUAD issues. If your problem isnt listed here, check `squad-doctor` for a full installation diagnostic.

```bash
squad-doctor
```

## IDE themes not working

The most frequent IDE issue. Symptoms: theme selector changes the `data-theme` attribute but colors stay the same.

The cause is almost always Tailwind v3 syntax in `app.css`. SQUAD uses Tailwind CSS v4, which has completely different config syntax.

**Wrong (v3):**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Correct (v4):**
```css
@import "tailwindcss";

@plugin "daisyui" {
  themes: light, dark, nord --default, ...;
}
```

If you've confirmed the syntax is correct, clear the build cache:

```bash
cd ~/code/squad/ide
rm -rf .svelte-kit node_modules/.vite
npm run dev
```

Then hard refresh your browser with Ctrl+Shift+R.

## Agent shows offline or disconnected

Every Claude Code session must run inside tmux for the IDE to track it. If you started Claude directly without tmux, the IDE cant see it.

```bash
# Wrong - no tmux
cd ~/code/chimaro && claude "/squad:start"

# Correct - use a launcher function
squad-chimaro

# Or use the squad CLI for multi-agent
squad chimaro 4 --auto
```

If launcher functions arent installed:

```bash
~/code/squad/tools/scripts/setup-bash-functions.sh
source ~/.bashrc
```

## Agent Registry "not registered"

This happens when an agent tries to reserve files or check identity before registering. The quickest fix is to run `/squad:start`, which auto-registers the agent.

Manual registration:

```bash
am-register --name YourAgentName --program claude-code --model sonnet-4.5
```

Verify with:

```bash
am-whoami
am-agents
```

## Browser tools not found

If `browser-start.js` or other browser tools return "command not found", the symlinks are probably missing. Reinstall:

```bash
cd ~/code/squad
./install.sh
```

If the tools exist but fail to connect, make sure Chrome is running with remote debugging:

```bash
google-chrome --remote-debugging-port=9222
```

And check that npm dependencies are installed:

```bash
cd ~/code/squad/tools/browser && npm install
```

## Statusline not updating

The statusline reads from session files to show agent identity, task, and status. If its blank or stale:

```bash
# Verify you're in a tmux session
echo $TMUX

# Check if the session file exists
ls /tmp/squad-signal-tmux-*.json

# Manually write agent identity
SESSION_ID=$(cat /tmp/claude-session-${PPID}.txt | tr -d '\n')
mkdir -p .claude/sessions
echo "YourAgentName" > ".claude/sessions/agent-${SESSION_ID}.txt"
```

## Voice input not working

First check if whisper.cpp is installed:

```bash
ls ~/.local/share/squad/whisper/build/bin/whisper-cli
```

If not found, install it:

```bash
bash ~/code/squad/tools/scripts/install-whisper.sh
```

If the binary exists but transcription fails, the model or ffmpeg might need rebuilding:

```bash
cd ~/.local/share/squad/whisper/build
cmake .. -DWHISPER_FFMPEG=ON && make -j$(nproc) whisper-cli
```

Test the transcription API:

```bash
curl http://localhost:3333/api/transcribe
# Should return: {"status":"ok","whisper_cli":"...","model_exists":true}
```

## Common error codes

| Error | Cause | Fix |
|-------|-------|-----|
| `command not found` | `~/.local/bin` not in PATH | Add to `~/.bashrc`: `export PATH="$HOME/.local/bin:$PATH"` |
| `am-whoami` fails | Database not initialized | Run `bash ~/code/squad/tools/scripts/install-agent-mail.sh` |
| `st: command not found` | Task CLI not installed | Run `./install.sh` to create symlinks |
| `NOT IN TMUX SESSION` | Claude started outside tmux | Exit and restart with launcher function |
| File conflict | Another agent declared the same files | Check `st show` for file declarations, coordinate |
| `from_agent not registered` | Agent didnt run am-register | Run `/squad:start` to auto-register |
| IDE shows blank page | Dependencies missing | Run `cd ~/code/squad/ide && npm install` |
| Broken symlinks | Stale installation | Run `./install.sh` to refresh |

## Fresh IDE build

When in doubt, nuke the caches and rebuild:

```bash
cd ~/code/squad/ide
rm -rf .svelte-kit node_modules/.vite
npm run dev
```

## See also

- [Installation](/docs/installation/) - Initial setup steps
- [CLI Reference](/docs/cli-reference/) - Command reference with --help
- [Projects](/docs/projects/) - Project configuration
