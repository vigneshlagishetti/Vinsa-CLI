<p align="center">
  <img src="https://img.shields.io/badge/Vinsa_CLI-v3.0.0-7C3AED?style=for-the-badge&logo=terminal&logoColor=white" alt="Vinsa CLI v3.0.0" />
  <img src="https://img.shields.io/badge/100%25_Free-Groq_Powered-00C853?style=for-the-badge&logo=lightning&logoColor=white" alt="Free" />
  <img src="https://img.shields.io/badge/Node.js->=18-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License" />
</p>

<h1 align="center">⚡ Vinsa CLI</h1>
<p align="center"><b>The most powerful free AI CLI ever built.</b></p>
<p align="center">
  Agentic AI shell with 11 built-in tools, 24 MCP tools, 49 slash commands,<br/>
  9 auto-rotating models, multi-agent mode, interactive command cards, and more.
</p>

---

## Why Vinsa?

| Feature | Vinsa CLI | Claude Code | GitHub Copilot CLI | Aider |
|---|:---:|:---:|:---:|:---:|
| **Price** | **Free forever** | $20/mo+ | $10/mo+ | API costs |
| **Built-in Tools** | **11** | 5 | 0 | 2 |
| **MCP Support** | **24 tools, 10 presets** | Limited | No | No |
| **Slash Commands** | **48** | ~15 | ~5 | ~10 |
| **Auto-Model Rotation** | **9 models, 3 tiers** | 1 model | 1 model | Manual |
| **Multi-Agent Mode** | **Yes** | No | No | No |
| **Git Integration** | **23 operations** | Basic | Basic | Good |
| **Interactive Command Cards** | **Yes** | No | No | No |
| **Custom Teach Commands** | **Yes** | No | No | No |
| **Session Timeline** | **Yes** | No | No | No |
| **System Snapshots + Diff** | **Yes** | No | No | No |
| **Autopilot Mode** | **Yes** | No | No | No |
| **Voice Input (Whisper)** | **Yes** | No | No | No |
| **Plugin System** | **Yes** | No | No | Yes |
| **HTTP API Server** | **Yes** | No | No | No |
| **Install Size** | **~30 MB** | ~800 MB | ~200 MB | ~150 MB |

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Commands](#cli-commands)
- [Interactive Shell](#interactive-shell)
- [Slash Commands](#slash-commands)
- [Unique Features](#unique-features)
  - [Interactive Command Cards](#-interactive-command-cards)
  - [Teach Commands](#-teach-commands)
  - [Autopilot Mode](#-autopilot-mode)
  - [Quickfix](#-quickfix)
  - [Explain](#-explain)
  - [Session Timeline](#-session-timeline)
  - [System Snapshots](#-system-snapshots)
- [Built-in Tools](#built-in-tools)
- [MCP Integration](#mcp-integration)
- [Model Pool](#model-pool)
- [Git Integration](#git-integration)
- [Multi-Agent Mode](#multi-agent-mode)
- [Plugin System](#plugin-system)
- [HTTP API Server](#http-api-server)
- [Architecture](#architecture)
- [Why Free?](#why-free)
- [License](#license)

---

## Installation

```bash
# Install globally from npm
npm install -g vinsa-cli

# Or clone and link
git clone https://github.com/lagishettyvignesh/vinsa-cli.git
cd vinsa-cli
npm install
npm link
```

### Setup

```bash
# Set your free Groq API key (get one at https://console.groq.com)
vinsa config set-key <YOUR_GROQ_API_KEY>

# Optional: set a preferred model
vinsa config set-model llama-3.3-70b-versatile

# Verify setup
vinsa config show
```

---

## Quick Start

```bash
# Launch interactive shell (default)
vinsa

# One-shot question
vinsa ask "explain async/await in JavaScript"

# Run & explain a command
vinsa run "find . -name '*.log' -mtime +30 -delete"

# Debug system issues
vinsa debug

# Scan a codebase
vinsa scan ./my-project

# AI-powered code review
vinsa review ./src/app.js
```

---

## CLI Commands

Vinsa provides **20 CLI commands** via Commander.js:

| Command | Description |
|---|---|
| `vinsa` | Launch interactive AI shell (default) |
| `vinsa chat` | Start interactive chat (`--continue` to resume last session) |
| `vinsa ask <prompt>` | One-shot question (non-interactive) |
| `vinsa run <command>` | Ask AI to run & explain a system command |
| `vinsa debug` | AI diagnoses system/network issues |
| `vinsa scan <path>` | AI analyzes a codebase |
| `vinsa config set-key <key>` | Set Groq API key |
| `vinsa config set-model <model>` | Set preferred model |
| `vinsa config show` | Show current configuration |
| `vinsa config reset` | Reset all configuration |
| `vinsa config path` | Show config file path |
| `vinsa mcp add <name> <cmd> [args...]` | Add an MCP server |
| `vinsa mcp remove <name>` | Remove an MCP server |
| `vinsa mcp list` | List MCP servers |
| `vinsa tools` | List all available tools |
| `vinsa review <file>` | AI-powered code review |
| `vinsa init [dir]` | Initialize a project with AI guidance |
| `vinsa watch <dir>` | Watch a directory for changes |
| `vinsa serve` | Start HTTP API server |
| `vinsa git <command>` | Git operations via the CLI |

---

## Interactive Shell

Launch with `vinsa` or `vinsa chat`. Features include:

- **Tab-completion** for all 49 slash commands
- **Smart conversation management** — save, load, branch, switch
- **Interactive command cards** — Run/Edit/Insert shell commands with one keypress
- **Teach commands** — save reusable custom commands with placeholders
- **Autopilot mode** — AI autonomously works toward a goal
- **Session timeline** — track every action with timestamps
- **System snapshots** — capture and diff system state
- **Multi-agent mode** — spawn specialist agents for complex tasks
- **Voice input** — speak your prompts via Groq Whisper
- **Alias system** — shorten frequently-used prompts
- **Tool hooks** — trigger actions before/after tool calls
- **Plan mode** — AI thinks before acting
- **History search** — fuzzy search through past sessions
- **Export** — save conversations as Markdown, HTML, or JSON

---

## Slash Commands

All **49 slash commands** organized by category:

### Core

| Command | Description |
|---|---|
| `/help` | Show all available commands |
| `/clear` | Clear conversation history |
| `/tools` | List all available tools |
| `/models` | Show model rotation status & available models |
| `/mcp` | Show MCP server status |
| `/system` | Show system information |
| `/config` | Show current configuration |
| `/history` | Show conversation history summary |
| `/stats` | Show token usage & session statistics |
| `/compact` | Compress conversation to save context |
| `/doctor` | Run self-diagnostic checks |
| `/exit` / `/quit` | Exit Vinsa shell |

### Session Management

| Command | Description |
|---|---|
| `/save [name]` | Save current session |
| `/load <name>` | Load a saved session |
| `/list` | List all saved sessions |
| `/copy` | Copy last response to clipboard |
| `/export [md\|html\|json]` | Export conversation to file |
| `/branch [name]` | Fork conversation into a branch |
| `/switch <name>` | Switch to a different branch |

### Productivity

| Command | Description |
|---|---|
| `/plan` | Toggle plan mode (think before acting) |
| `/alias name = prompt` | Create/list/remove prompt aliases |
| `/recall <keyword>` | Search conversation history |
| `/voice` | Voice input via Groq Whisper (microphone) |
| `/hooks [list\|add\|remove\|clear]` | Manage tool execution hooks |
| `/confirm` | Toggle interactive diff preview for writes |
| `/plugins` | List loaded plugins |
| `/multi <task>` | Multi-agent mode for complex tasks |
| `/undo` | Undo the last file change made by Vinsa |

### Git

| Command | Description |
|---|---|
| `/git <command>` | Full git source control |
| `/commit` | AI-powered commit message + commit |
| `/diff` | Show git diff (staged or unstaged) |
| `/status` | Git status (shortcut) |
| `/log [count] [--graph] [--all]` | Git log |
| `/stash [save\|list\|pop\|apply\|drop\|clear]` | Git stash |
| `/push [remote] [branch]` | Git push |
| `/pull [--rebase]` | Git pull |
| `/merge <branch> [--squash] [--no-ff]` | Git merge |
| `/tag [create\|delete] [name]` | Git tag |
| `/remote [add\|remove] [name] [url]` | Git remote |
| `/blame <file> [startLine] [endLine]` | Git blame |
| `/fetch [--all] [--prune]` | Git fetch |
| `/cherry-pick <hash>...` | Cherry-pick commits |
| `/repoinfo` | Show comprehensive repo information |

### Unique Features

| Command | Description |
|---|---|
| `/quickfix` | AI auto-fixes the last error that occurred |
| `/teach name = command` | Teach Vinsa reusable custom commands |
| `/timeline` | Show session activity timeline with timestamps |
| `/snapshot [name]` | Capture system state; diff two snapshots |
| `/autopilot <goal>` | Goal-driven autonomous AI loop |
| `/explain <command>` | Run a command and get AI explanation |
| `/about` | About Vinsa & its creator — Lagishetti Vignesh |

---

## Unique Features

### ⚡ Interactive Command Cards

When the AI suggests shell commands, Vinsa renders VS Code Copilot-style **interactive cards** with action buttons:

```
┌─ 💻 COMMAND ──────────────────────────────────────┐
│  npm install express                               │
└────────────────────────────────────────────────────┘
   ▸ Run    ✎ Edit    ⤓ Insert    ✕ Close
```

- **Run** — Execute the command immediately in your terminal
- **Edit** — Modify the command before running (pre-filled input)
- **Insert** — Copy the command into the input line
- **Close** — Dismiss the card

Supports `$1`, `$2`, `$*` **placeholders** — Vinsa prompts you for values before execution.

---

### 🎓 Teach Commands

Save reusable custom commands with placeholder support:

```bash
# Teach a command
/teach deploy = git add -A && git commit -m "$*" && git push

# Use it
deploy fixing auth bug
# → Runs: git add -A && git commit -m "fixing auth bug" && git push

# Teach with numbered placeholders
/teach greet = echo "Hello $1, welcome to $2!"

# Use it
greet Alice Wonderland
# → Runs: echo "Hello Alice, welcome to Wonderland!"

# List all taught commands
/teach list

# Remove a command
/teach remove deploy
```

Teach commands persist across sessions (stored in config).

---

### 🤖 Autopilot Mode

Set a goal and let the AI work autonomously in a loop:

```bash
/autopilot set up a Node.js Express server with JWT auth and MongoDB
```

Vinsa will:
1. Break the goal into steps
2. Execute tools autonomously (create files, run commands, install packages)
3. Show progress with step counters and status indicators
4. Continue until the goal is complete or it needs your input

Each step displays:
```
─── ⏵ STEP 1/5 ──────────────
🔄 Working...
```

---

### 🔧 Quickfix

When a command or tool call fails, Vinsa tracks the error. Just type:

```bash
/quickfix
```

The AI analyzes the last error and attempts an automatic fix — no copy-pasting error messages needed.

---

### 📖 Explain

Run any shell command and get an AI-powered explanation of its output:

```bash
/explain netstat -tlnp
/explain docker ps --format "table {{.Names}}\t{{.Status}}"
/explain lsof -i :3000
```

Vinsa runs the command, captures the output, and asks the AI to explain what it means.

---

### 📅 Session Timeline

Track every action in your session with timestamps and elapsed time:

```bash
/timeline
```

Output:
```
─── 📅 SESSION TIMELINE ───
  💬 10:32:05 (+0s)    Query: "create a REST API"
  🤖 10:32:08 (+3s)    Response (247 tokens)
  🔧 10:32:09 (+4s)    Tool: write_file → server.js
  ⚡ 10:32:15 (+10s)   Command: /commit
  ❌ 10:32:20 (+15s)   Error: ENOENT package.json
  💬 10:32:25 (+20s)   Query: "fix this"
```

---

### 📸 System Snapshots

Capture full system state and compare snapshots over time:

```bash
# Capture current state
/snapshot baseline

# ... do some work ...

# Capture another snapshot
/snapshot after-deploy

# Compare them
/snapshot diff baseline after-deploy

# List all snapshots
/snapshot list
```

Snapshots capture: running processes, open ports, disk usage, memory usage, and more. The diff view highlights what changed between captures.

---

## Built-in Tools

Vinsa has **11 built-in tools** the AI can use autonomously:

| Tool | Description |
|---|---|
| `run_shell_command` | Execute any shell command with timeout and safety checks |
| `read_file` | Read file contents (supports line ranges) |
| `write_file` | Write or overwrite files (with undo support) |
| `list_directory` | List directory contents (with depth limiting) |
| `search_files` | Regex search across files (like grep) |
| `get_system_info` | CPU, memory, disk, OS, network info |
| `network_diagnostics` | Ping, DNS, HTTP checks, port scanning |
| `web_fetch` | Fetch URL content (HTML → text, JSON, headers) |
| `process_manager` | List, kill, find processes |
| `code_analysis` | Analyze code structure (functions, classes, imports) |
| `git_operations` | 23 git operations (status, log, branch, diff, etc.) |

---

## MCP Integration

The **Model Context Protocol** lets Vinsa connect to external tool servers.

### Auto-installed Servers (24 tools, zero config)

| Server | Tools | What It Does |
|---|---|---|
| `filesystem` | 14 | Read, write, search, move files and directories |
| `memory` | 9 | Persistent knowledge graph for entities & relations |
| `sequential-thinking` | 1 | Step-by-step reasoning for complex problems |

These install automatically on first launch via `npx`.

### Easy-Add Presets

Add more MCP servers with one command:

```bash
vinsa mcp add playwright    # Browser automation (11 tools)
vinsa mcp add brave-search  # Web search via Brave API
vinsa mcp add github        # GitHub API (repos, issues, PRs)
vinsa mcp add github-npx    # GitHub via npx (no Docker)
vinsa mcp add fetch         # HTTP fetch as MCP tool
vinsa mcp add postgres      # PostgreSQL database access
vinsa mcp add slack         # Slack messaging integration
vinsa mcp add google-maps   # Google Maps / Places API
vinsa mcp add gitlab        # GitLab API integration
vinsa mcp add pdf           # PDF parsing and extraction
```

### Custom MCP Servers

```bash
# Add any MCP server manually
vinsa mcp add my-server node /path/to/server.js

# List all servers
vinsa mcp list

# Remove a server
vinsa mcp remove my-server
```

### In-Shell MCP

```bash
# Check status inside the shell
/mcp
```

---

## Model Pool

Vinsa auto-rotates through **9 models across 3 tiers** for fault tolerance. If one model is rate-limited, Vinsa seamlessly switches to the next.

### Tier 1 — Flagship

| Model | Parameters | Strengths |
|---|---|---|
| `llama-3.3-70b-versatile` | 70B | Best overall — reasoning, code, analysis |
| `llama-4-maverick-17b-128e-instruct` | 17B (128 experts) | Mixture-of-experts, creative & broad |
| `qwq-32b` | 32B | Strong reasoning and math |
| `mistral-saba-24b` | 24B | Fast, multilingual, good at code |

### Tier 2 — Fast

| Model | Parameters | Strengths |
|---|---|---|
| `mixtral-8x7b-32768` | 8×7B | MoE, 32K context, balanced |
| `llama-4-scout-17b-16e-instruct` | 17B (16 experts) | Efficient MoE, good general usage |

### Tier 3 — Ultralight

| Model | Parameters | Strengths |
|---|---|---|
| `gemma2-9b-it` | 9B | Efficient, good for focused tasks |
| `llama-3.1-8b-instant` | 8B | Ultra-fast responses |
| `llama-3.2-3b-preview` | 3B | Smallest, fastest, edge tasks |

```bash
# Check current model in shell
/models

# Set preferred model
vinsa config set-model qwq-32b
```

---

## Git Integration

**23 git operations** built into both the AI tools and slash commands:

| Operation | Slash Command | Description |
|---|---|---|
| Status | `/status` | Working tree status |
| Log | `/log` | Commit history with graph/filter options |
| Branch | `/git branch` | Create, delete, rename, list branches |
| Diff | `/diff` | Staged/unstaged diffs, file diffs, commit diffs |
| Add | `/git add` | Stage files |
| Commit | `/commit` | AI-generated commit message + commit |
| Push | `/push` | Push to remote |
| Pull | `/pull` | Pull with optional rebase |
| Merge | `/merge` | Merge with squash/no-ff options |
| Stash | `/stash` | Save, list, pop, apply, drop, clear |
| Clone | `/git clone` | Clone repositories |
| Init | `/git init` | Initialize new repos |
| Remote | `/remote` | Add, remove, list remotes |
| Tag | `/tag` | Create, delete, list tags |
| Blame | `/blame` | Line-by-line blame with range support |
| Cherry-pick | `/cherry-pick` | Cherry-pick commits |
| Rebase | `/git rebase` | Interactive/onto rebase |
| Reset | `/git reset` | Soft/mixed/hard reset |
| Checkout | `/git checkout` | Checkout branches or files |
| Show | `/git show` | Show commit details |
| Fetch | `/fetch` | Fetch from remotes |
| Conflicts | `/git conflicts` | List, resolve merge conflicts |
| Repo Info | `/repoinfo` | Full repo stats and info |

---

## Multi-Agent Mode

Spawn specialist AI agents for complex tasks:

```bash
/multi Build a full-stack todo app with React frontend and Express API
```

Vinsa creates a **coordinator agent** that breaks the task into subtasks and delegates to **specialist agents** (frontend, backend, database, etc.), then merges the results.

---

## Plugin System

Extend Vinsa with custom plugins:

```bash
~/.vinsa/plugins/
  my-plugin/
    index.js          # Must export: { name, version, tools, init }
```

```javascript
// Example plugin
export default {
  name: 'my-plugin',
  version: '1.0.0',
  tools: [
    {
      name: 'my_tool',
      description: 'Does something cool',
      parameters: { type: 'object', properties: {} },
      execute: async (args) => ({ result: 'done' }),
    }
  ],
  init: () => console.log('Plugin loaded!'),
};
```

```bash
# Check loaded plugins
/plugins
```

---

## HTTP API Server

Run Vinsa as an HTTP API:

```bash
vinsa serve
# → Server listening on http://localhost:3141
```

```bash
# Send a prompt
curl -X POST http://localhost:3141/ask \
  -H "Content-Type: application/json" \
  -d '{"prompt": "list all running node processes"}'
```

---

## Architecture

```
vinsa-cli/
├── bin/vinsa.js          # Entry point shim
├── package.json          # v3.0.0, 14 dependencies
└── src/
    ├── index.js          # Commander.js CLI — 20 commands
    ├── chat.js           # Interactive shell — 48 commands, REPL loop
    ├── agent.js          # Groq SDK wrapper — 9 models, ReAct loop
    ├── tools.js          # 11 built-in tool definitions + executor
    ├── mcp.js            # MCP client — 10 presets, auto-install
    ├── git.js            # 23 git operations
    ├── config.js         # Conf-based persistent config + teach + snapshots
    ├── ui.js             # chalk/ora/marked UI + command cards
    ├── plugins.js        # Plugin loader (~/.vinsa/plugins/)
    └── server.js         # HTTP API server (port 3141)
```

### Data Flow

```
User Input → REPL Loop → Teach Resolution → Agent (Groq API)
                ↓                                  ↓
          Slash Command                      Tool Calls
                ↓                                  ↓
     Timeline Tracking              Built-in (11) + MCP (24)
                ↓                                  ↓
          UI Rendering              Results → Agent → Response
                ↓                                  ↓
        Command Cards ←────────── Response Rendering
```

---

## Dependencies

| Package | Purpose |
|---|---|
| `groq-sdk` | Groq API client (free AI inference) |
| `@modelcontextprotocol/sdk` | MCP server connections |
| `commander` | CLI command parsing |
| `chalk` | Terminal colors and styling |
| `ora` | Spinners and loading indicators |
| `marked` + `marked-terminal` | Markdown rendering in terminal |
| `conf` | Persistent configuration storage |
| `dotenv` | Environment variable loading |
| `dns2` | DNS diagnostics |
| `systeminformation` | System info collection |
| `cli-markdown` | Additional markdown support |
| `readline` | Interactive input handling |

---

## Why Free?

Vinsa uses [Groq](https://groq.com) — the fastest AI inference engine — which provides **free API access** to state-of-the-art open-source models. No subscriptions, no token fees, no limits on features.

- **Groq's free tier** gives generous rate limits across all models
- **Auto-rotation** across 9 models means you rarely hit limits
- **3-tier fallback** ensures you always get a response
- **Open-source models** (Llama, Mixtral, Gemma, Mistral) — no vendor lock-in

---

## Requirements

- **Node.js** >= 18.0.0
- **Groq API key** (free at [console.groq.com](https://console.groq.com))
- **Operating System**: Windows, macOS, or Linux

---

## License

**Proprietary — All Rights Reserved**

Copyright (c) 2025-2026 **Lagishetti Vignesh**. Unauthorized copying, forking, redistribution, or publication of this software is strictly prohibited. See [LICENSE](LICENSE) for full terms.

---

<p align="center">
  <b>⚡ Vinsa CLI v3.0.1</b> — 11 tools · 24 MCP tools · 49 commands · 9 models · 100% free to use<br/>
  <i>The AI CLI that does everything, costs nothing.</i>
</p>
