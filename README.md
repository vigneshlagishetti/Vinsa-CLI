# ⚡ Vinsa CLI

**The AI-Powered Agentic CLI that surpasses everything.**

Vinsa is a free, open-source CLI agent powered by **Groq**, **MCP (Model Context Protocol)**, plugins, and a self-healing agentic architecture. It doesn't just chat — it **acts**. It runs commands, diagnoses your system, analyzes codebases, reviews code diffs, scaffolds projects, and connects to any MCP server.

```
  ██╗   ██╗██╗███╗   ██╗███████╗ █████╗
  ██║   ██║██║████╗  ██║██╔════╝██╔══██╗
  ██║   ██║██║██╔██╗ ██║███████╗███████║
  ╚██╗ ██╔╝██║██║╚██╗██║╚════██║██╔══██║
   ╚████╔╝ ██║██║ ╚████║███████║██║  ██║
    ╚═══╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝
```

---

## 🚀 What Makes Vinsa Different

| Feature | Other CLIs | **Vinsa** |
|---------|-----------|-----------|
| AI Model | GPT / basic | **Groq free model pool (auto-rotates on rate limits)** |
| Speed | Slow (seconds) | **Blazing fast (Groq = fastest inference on Earth)** |
| Architecture | Prompt → Response | **ReAct Agent Loop (Think → Act → Observe → Retry)** |
| Tools | None or limited | **11 built-in tools + full Git + MCP + plugins** |
| Extensibility | Plugins only | **MCP Protocol + drop-in JS plugins** |
| Reliability | Fails on 429s | **Zero-lag model fallback with cooldowns** |
| API Access | Not available | **Local HTTP API server (vinsa serve)** |
| Cost | $20/month+ | **100% FREE** |

---

## 📦 Installation

```bash
# Install globally
npm install -g vinsa-cli

# Or use without installing
npx vinsa-cli chat
```

### Setup (30 seconds)

1. Get your **FREE** Groq API key at: https://console.groq.com/keys
2. Save it:
```bash
vinsa config set-key YOUR_GROQ_API_KEY
```
3. Done! Start chatting:
```bash
vinsa chat
```

---

## 🎮 Commands

### Interactive Chat (Default)
```bash
vinsa              # Start interactive chat
vinsa chat         # Same thing
```

### One-Shot Questions
```bash
vinsa ask "What's the fastest way to find large files on Windows?"
vinsa ask "Write a Python script to monitor CPU usage"
vinsa ask "Explain this error: ECONNREFUSED 127.0.0.1:5432"

# JSON or markdown output
vinsa ask "List running processes" --json
vinsa ask "Summarize this README" --output-format markdown
```

### Run & Explain
```bash
vinsa run "check my disk space"
vinsa run "find all Node.js processes"
vinsa run "list open ports on this machine"
```

### System Diagnostics
```bash
vinsa debug              # General diagnostics
vinsa debug --network    # Network-focused
vinsa debug --system     # System-focused
vinsa debug --full       # Everything
```

### Codebase Analysis
```bash
vinsa scan .             # Analyze current project
vinsa scan ./my-app      # Analyze specific directory
vinsa scan . --deep      # Deep analysis (TODOs, deps, stats)
```

### Tool Inventory
```bash
vinsa tools
```

### AI Code Review
```bash
vinsa review             # Review staged or unstaged git diff
vinsa review --staged    # Review staged only
vinsa review --file src/index.js
```

### Project Scaffolding
```bash
vinsa init node-api --name my-service
vinsa init react-app --name my-frontend
```

### Watch Mode
```bash
vinsa watch . --on-change "Summarize what changed and suggest fixes"
```

### HTTP API Server
```bash
vinsa serve --port 3141
```

### Git Source Control
```bash
vinsa git status
vinsa git log --oneline -n 10
vinsa git diff --staged
vinsa git commit --ai
```

### Configuration
```bash
vinsa config set-key YOUR_GROQ_API_KEY               # Set Groq API key
vinsa config set-model mixtral-8x7b-32768             # Change model
vinsa config show                                     # Show current config
vinsa config path                                     # Show config file location
vinsa config reset                                    # Reset to defaults
```

---

## 🧠 Available Models (All FREE on Groq)

Vinsa auto-rotates across the free model pool if one hits rate limits, then returns to your preferred model when it recovers.

| Model | Best For |
|-------|----------|
| `llama-3.3-70b-versatile` | **Default** — best quality, strong tool use |
| `meta-llama/llama-4-maverick-17b-128e-instruct` | Fast, modern general model |
| `meta-llama/llama-4-scout-17b-16e-instruct` | Balanced speed and quality |
| `qwen-qwq-32b` | Reasoning-heavy tasks |
| `mistral-saba-24b` | Strong general performance |
| `mixtral-8x7b-32768` | Long context (32K tokens) |
| `llama-3.1-8b-instant` | Ultra-fast responses |
| `gemma2-9b-it` | Lightweight, quick queries |
| `llama-3.2-3b-preview` | Small and speedy |

Switch anytime: `vinsa config set-model llama-3.1-8b-instant`

---

## 🔌 MCP (Model Context Protocol)

Vinsa supports MCP — the 2025/2026 industry standard for connecting AI to external systems.

Auto-installed on first run (no keys required):
- Filesystem
- Memory
- Sequential Thinking

### Add MCP Servers
```bash
# Web fetching
vinsa mcp add fetch --preset fetch

# Filesystem access (sandboxed to specific paths)
vinsa mcp add files --preset filesystem --paths "/home/user/projects,/tmp"

# GitHub (requires personal access token)
vinsa mcp add github --preset github --token ghp_xxxxx

# PostgreSQL database
vinsa mcp add mydb --preset postgres --url "postgresql://user:pass@localhost/db"

# Custom MCP server
vinsa mcp add custom --command "node" --args "my-mcp-server.js"

# List servers
vinsa mcp list

# Remove a server
vinsa mcp remove fetch
```

MCP servers connect automatically when you start `vinsa chat`. All their tools become available to the AI agent.

---

## 🛠️ Built-in Tools

Vinsa's agent can use these tools autonomously:

| Tool | Description |
|------|-------------|
| `run_shell_command` | Execute any shell command (PowerShell/bash) |
| `read_file` | Read file contents |
| `write_file` | Write/create files |
| `list_directory` | Browse directories |
| `search_files` | Find files by name or content |
| `get_system_info` | CPU, RAM, disk, GPU, battery, OS info |
| `network_diagnostics` | Ping, DNS, traceroute, port scan, WiFi |
| `web_fetch` | Make HTTP requests to any URL |
| `process_manager` | List/find/kill processes |
| `code_analysis` | Analyze project structure, deps, TODOs |
| `git_operations` | Full Git client: status, diff, commit, push, merge, etc. |

---

## 💬 Chat Slash Commands

Inside interactive chat mode:

Core
| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/clear` | Clear conversation history |
| `/tools` | List all available tools |
| `/models` | Show model pool status |
| `/mcp` | Show MCP server status |
| `/system` | Show system information |
| `/config` | Show configuration |
| `/history` | History summary |
| `/stats` | Token usage & session stats |
| `/compact` | Compress conversation for context savings |
| `/save` | Save session — `/save name` |
| `/load` | Load session — `/load name` |
| `/list` | List saved sessions |
| `/copy` | Copy last response to clipboard |
| `/undo` | Undo last file change by Vinsa |
| `/doctor` | Self-diagnostics |
| `/plan` | Toggle plan mode |
| `/export` | Export conversation — `/export md|html|json` |
| `/exit` | Exit Vinsa |

Advanced
| Command | Description |
|---------|-------------|
| `/alias` | Custom command aliases |
| `/recall` | Search history by keyword |
| `/voice` | Voice input (Windows built-in; Linux/macOS needs `sox`) |
| `/branch` | Fork conversation branch |
| `/switch` | Switch branch |
| `/hooks` | Tool hooks (pre/post) |
| `/confirm` | Interactive diff preview for writes |
| `/plugins` | List loaded plugins |
| `/multi` | Multi-agent pipeline (Planner → Executor → Reviewer) |

Git
| Command | Description |
|---------|-------------|
| `/status` | Git status |
| `/log` | Commit history |
| `/diff` | Show changes |
| `/commit` | AI-powered commit message + commit |
| `/stash` | Stash operations |
| `/push` | Push to remote |
| `/pull` | Pull from remote |
| `/merge` | Merge branch |
| `/tag` | Tag management |
| `/remote` | Remote management |
| `/blame` | File blame |
| `/fetch` | Fetch from remote |
| `/cherry-pick` | Cherry-pick commits |
| `/repoinfo` | Repo overview |
| `/git` | Full git command router |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│              USER TERMINAL              │
├─────────────────────────────────────────┤
│           Commander.js CLI              │
│     (chat, ask, run, debug, scan)       │
├─────────────────────────────────────────┤
│          VINSA AI AGENT                 │
│   ┌─────────────────────────────────┐   │
│   │ ReAct Loop (self-healing)       │   │
│   │ 1. Think (Llama 3.3 70B @ Groq)│   │
│   │ 2. Act (call tools)            │   │
│   │ 3. Observe (check results)     │   │
│   │ 4. Retry if needed             │   │
│   └─────────────────────────────────┘   │
├─────────────────────────────────────────┤
│              TOOL LAYER                 │
│  ┌──────────┐  ┌────────────────────┐   │
│  │ Built-in │  │   MCP Servers      │   │
│  │ 10 Tools │  │ (filesystem, web,  │   │
│  │          │  │  github, postgres) │   │
│  └──────────┘  └────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## 🆓 Why It's Free

Vinsa uses **Groq** which provides the fastest AI inference on Earth, with a generous free tier:
- **6,000 requests/day** (no credit card needed)
- **30 requests/minute**
- Powered by Groq's custom LPU hardware — responses in milliseconds
- Get your key at https://console.groq.com/keys

No subscriptions. No hidden costs. No limits that matter for CLI usage.

---

## 📄 License

MIT — Use it, fork it, improve it. Free forever.
