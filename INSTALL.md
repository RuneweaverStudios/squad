# SQUAD Installation Guide

## Quick Install (Recommended)

**Copy and paste this single line:**

```bash
curl -fsSL https://raw.githubusercontent.com/RuneweaverStudios/squad/master/install.sh | bash && source ~/.zshrc
```

For bash users (Linux):
```bash
curl -fsSL https://raw.githubusercontent.com/RuneweaverStudios/squad/master/install.sh | bash && source ~/.bashrc
```

Then start the IDE:
```bash
squad
```

Open your browser to: http://localhost:3333

## What the Installer Does

1. **Checks dependencies**: tmux, sqlite3, jq, node, npm
2. **Installs missing dependencies** (with your permission)
   - macOS: Uses Homebrew
   - Linux: Guides you through package manager installation
3. **Chooses installation location**:
   - Default: `~/.local/share/squad` (XDG-compliant)
   - Alternative: `~/code/squad`
   - Custom: You can specify your own path
4. **Clones the repository**
5. **Installs IDE dependencies** (npm packages)
6. **Adds SQUAD to your PATH**
7. **Creates the `squad` command**

## Shell Detection

The installer automatically detects your shell and updates the correct config file:

| Shell | Config File | OS |
|-------|-------------|-----|
| zsh | `~/.zshrc` | macOS (default), Some Linux |
| bash | `~/.bashrc` | Most Linux |
| bash | `~/.bash_profile` | macOS (if using bash) |

## Installation Locations

The installer checks for existing installations in this order:

1. `$SQUAD_INSTALL_DIR` (if set as environment variable)
2. `${XDG_DATA_HOME:-$HOME/.local/share}/squad` (XDG standard)
3. `$HOME/code/squad` (traditional developer location)
4. `$HOME/code/jomarchy-agent-tools` (legacy name)

If none exist, you'll be prompted to choose.

## Manual Installation

If you prefer to install manually:

```bash
# 1. Install dependencies
# macOS:
brew install tmux sqlite jq node

# Ubuntu/Debian:
sudo apt install tmux sqlite3 jq nodejs npm

# Arch/Manjaro:
sudo pacman -S tmux sqlite jq nodejs npm

# 2. Clone the repository
git clone https://github.com/RuneweaverStudios/squad ~/.local/share/squad
cd ~/.local/share/squad

# 3. Install IDE dependencies
cd ide
npm install
cd ..

# 4. Run the installer to create symlinks and configure shell
./install.sh

# 5. Reload shell and test
source ~/.zshrc   # or ~/.bashrc on Linux
squad
```

## Troubleshooting

### "command not found: squad"

**Cause**: Shell config not reloaded or PATH not set

**Solution**:
```bash
# macOS (zsh):
source ~/.zshrc

# Linux (bash):
source ~/.bashrc

# Verify PATH includes SQUAD:
echo $PATH | grep squad
```

### "zsh: command not found: #"

**Cause**: Copying code blocks with comment lines

**Solution**: Don't copy the `#` comment lines. Only copy the actual commands:

**DON'T DO THIS:**
```bash
# Install and launch IDE
curl -fsSL https://raw.githubusercontent.com/RuneweaverStudios/squad/master/install.sh | bash
```

**DO THIS:**
```bash
curl -fsSL https://raw.githubusercontent.com/RuneweaverStudios/squad/master/install.sh | bash
```

### "source ~/.bashrc && squad" fails on macOS

**Cause**: macOS uses `zsh` by default, not `bash`

**Solution**: Use `~/.zshrc` instead:
```bash
source ~/.zshrc && squad
```

### Homebrew not found on macOS

**Cause**: Homebrew not installed

**Solution**: Install Homebrew first:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then run the SQUAD installer again.

### Dependencies still missing after installation

**Cause**: Shell hasn't picked up newly installed packages

**Solution**:
1. Close and reopen your terminal
2. Run the installer again: `./install.sh`
3. Verify installations:
   ```bash
   tmux -V
   sqlite3 --version
   jq --version
   node --version
   npm --version
   ```

### IDE won't start

**Cause**: Missing npm dependencies

**Solution**:
```bash
cd ~/.local/share/squad/ide  # or wherever you installed SQUAD
npm install
npm run dev
```

### Installation directory doesn't exist

**Cause**: Installer couldn't create directory

**Solution**: Create it manually and re-run:
```bash
mkdir -p ~/.local/share/squad
curl -fsSL https://raw.githubusercontent.com/RuneweaverStudios/squad/master/install.sh | bash
```

### Want to change installation directory?

Set the `SQUAD_INSTALL_DIR` environment variable:

```bash
export SQUAD_INSTALL_DIR=~/my/custom/path
curl -fsSL https://raw.githubusercontent.com/RuneweaverStudios/squad/master/install.sh | bash
```

## Uninstalling

To completely remove SQUAD:

```bash
# 1. Remove installation directory
rm -rf ~/.local/share/squad  # or your custom install location

# 2. Remove from PATH (edit your shell config)
# Remove these lines from ~/.zshrc or ~/.bashrc:
# # SQUAD - Jomarchy Agent Tools
# export PATH="$PATH:/path/to/squad/tools"

# 3. Reload shell
source ~/.zshrc  # or ~/.bashrc
```

## Updating

To update SQUAD to the latest version:

```bash
cd ~/.local/share/squad  # or your install location
git pull origin master
cd ide
npm install  # update IDE dependencies
```

## Platform-Specific Notes

### macOS

- **Default shell**: zsh (since macOS Catalina)
- **Config file**: `~/.zshrc`
- **Package manager**: Homebrew (required)
- **ARM Macs (M1/M2/M3)**: Homebrew installs to `/opt/homebrew`
- **Intel Macs**: Homebrew installs to `/usr/local`

### Linux (Ubuntu/Debian)

- **Default shell**: bash
- **Config file**: `~/.bashrc`
- **Package manager**: apt
- **Note**: sqlite3 package name (not sqlite)

### Linux (Arch/Manjaro)

- **Default shell**: bash
- **Config file**: `~/.bashrc`
- **Package manager**: pacman
- **Note**: nodejs and npm are in the main repos

## Getting Help

- **Documentation**: [README.md](README.md)
- **Issues**: https://github.com/RuneweaverStudios/squad/issues
- **Discussions**: https://github.com/RuneweaverStudios/squad/discussions

## Next Steps

After installation:

1. **Start the IDE**: `squad`
2. **Open browser**: http://localhost:3333
3. **Initialize a project**:
   ```bash
   cd ~/code/myproject
   st init
   ```
4. **Read the docs**: Check out [CLAUDE.md](CLAUDE.md) for full documentation

Happy coding with AI agents!
