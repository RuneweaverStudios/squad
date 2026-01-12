# JAT Installation Guide

## Quick Install (Recommended)

**Copy and paste this single line:**

```bash
curl -fsSL https://raw.githubusercontent.com/joewinke/jat/master/install.sh | bash && source ~/.zshrc
```

For bash users (Linux):
```bash
curl -fsSL https://raw.githubusercontent.com/joewinke/jat/master/install.sh | bash && source ~/.bashrc
```

Then start the IDE:
```bash
jat
```

Open your browser to: http://localhost:3333

## What the Installer Does

1. **Checks dependencies**: tmux, sqlite3, jq, node, npm
2. **Installs missing dependencies** (with your permission)
   - macOS: Uses Homebrew
   - Linux: Guides you through package manager installation
3. **Chooses installation location**:
   - Default: `~/.local/share/jat` (XDG-compliant)
   - Alternative: `~/code/jat`
   - Custom: You can specify your own path
4. **Clones the repository**
5. **Installs IDE dependencies** (npm packages)
6. **Adds JAT to your PATH**
7. **Creates the `jat` command**

## Shell Detection

The installer automatically detects your shell and updates the correct config file:

| Shell | Config File | OS |
|-------|-------------|-----|
| zsh | `~/.zshrc` | macOS (default), Some Linux |
| bash | `~/.bashrc` | Most Linux |
| bash | `~/.bash_profile` | macOS (if using bash) |

## Installation Locations

The installer checks for existing installations in this order:

1. `$JAT_INSTALL_DIR` (if set as environment variable)
2. `${XDG_DATA_HOME:-$HOME/.local/share}/jat` (XDG standard)
3. `$HOME/code/jat` (traditional developer location)
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
git clone https://github.com/joewinke/jat ~/.local/share/jat
cd ~/.local/share/jat

# 3. Install IDE dependencies
cd ide
npm install
cd ..

# 4. Run the installer to create symlinks and configure shell
./install.sh

# 5. Reload shell and test
source ~/.zshrc   # or ~/.bashrc on Linux
jat
```

## Troubleshooting

### "command not found: jat"

**Cause**: Shell config not reloaded or PATH not set

**Solution**:
```bash
# macOS (zsh):
source ~/.zshrc

# Linux (bash):
source ~/.bashrc

# Verify PATH includes JAT:
echo $PATH | grep jat
```

### "zsh: command not found: #"

**Cause**: Copying code blocks with comment lines

**Solution**: Don't copy the `#` comment lines. Only copy the actual commands:

**DON'T DO THIS:**
```bash
# Install and launch IDE
curl -fsSL https://raw.githubusercontent.com/joewinke/jat/master/install.sh | bash
```

**DO THIS:**
```bash
curl -fsSL https://raw.githubusercontent.com/joewinke/jat/master/install.sh | bash
```

### "source ~/.bashrc && jat" fails on macOS

**Cause**: macOS uses `zsh` by default, not `bash`

**Solution**: Use `~/.zshrc` instead:
```bash
source ~/.zshrc && jat
```

### Homebrew not found on macOS

**Cause**: Homebrew not installed

**Solution**: Install Homebrew first:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then run the JAT installer again.

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
cd ~/.local/share/jat/ide  # or wherever you installed JAT
npm install
npm run dev
```

### Installation directory doesn't exist

**Cause**: Installer couldn't create directory

**Solution**: Create it manually and re-run:
```bash
mkdir -p ~/.local/share/jat
curl -fsSL https://raw.githubusercontent.com/joewinke/jat/master/install.sh | bash
```

### Want to change installation directory?

Set the `JAT_INSTALL_DIR` environment variable:

```bash
export JAT_INSTALL_DIR=~/my/custom/path
curl -fsSL https://raw.githubusercontent.com/joewinke/jat/master/install.sh | bash
```

## Uninstalling

To completely remove JAT:

```bash
# 1. Remove installation directory
rm -rf ~/.local/share/jat  # or your custom install location

# 2. Remove from PATH (edit your shell config)
# Remove these lines from ~/.zshrc or ~/.bashrc:
# # JAT - Jomarchy Agent Tools
# export PATH="$PATH:/path/to/jat/tools"

# 3. Reload shell
source ~/.zshrc  # or ~/.bashrc
```

## Updating

To update JAT to the latest version:

```bash
cd ~/.local/share/jat  # or your install location
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
- **Issues**: https://github.com/joewinke/jat/issues
- **Discussions**: https://github.com/joewinke/jat/discussions

## Next Steps

After installation:

1. **Start the IDE**: `jat`
2. **Open browser**: http://localhost:3333
3. **Initialize a project**:
   ```bash
   cd ~/code/myproject
   bd init
   ```
4. **Read the docs**: Check out [CLAUDE.md](CLAUDE.md) for full documentation

Happy coding with AI agents!
