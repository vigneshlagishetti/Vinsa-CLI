# ⚡ Vinsa CLI

**The AI-Powered Agentic CLI that surpasses everything.**

Vinsa is a free, open-source CLI agent powered by **Groq** (Llama 3.3 70B), **MCP (Model Context Protocol)**, and a self-healing agentic architecture. It doesn't just chat — it **acts**. It runs commands, diagnoses your system, analyzes codebases, and connects to any MCP server.

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
| AI Model | GPT / basic | **Llama 3.3 70B via Groq (FREE — 6,000 req/day)** |
| Speed | Slow (seconds) | **Blazing fast (Groq = fastest inference on Earth)** |
| Architecture | Prompt → Response | **ReAct Agent Loop (Think → Act → Observe → Retry)** |
| Tools | None or limited | **10+ built-in tools (shell, files, network, system, web)** |
| Extensibility | Plugins | **MCP Protocol — universal standard, plug into anything** |
| Self-Healing | Crashes on error | **Auto-retries with different strategies** |
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

| Model | Best For |
|-------|----------|
| `llama-3.3-70b-versatile` | **Default** — Best quality, great tool use |
| `llama-3.1-70b-versatile` | Alternative 70B model |
| `llama-3.1-8b-instant` | Ultra-fast, simpler tasks |
| `mixtral-8x7b-32768` | Long context (32K tokens) |
| `gemma2-9b-it` | Lightweight, good for quick queries |

Switch anytime: `vinsa config set-model llama-3.1-8b-instant`

---

## 🔌 MCP (Model Context Protocol)

Vinsa supports MCP — the 2025/2026 industry standard for connecting AI to external systems.

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

---

## 💬 Chat Slash Commands

Inside interactive chat mode:

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/clear` | Clear conversation history |
| `/tools` | List all available tools |
| `/mcp` | Show MCP server status |
| `/system` | Show system information |
| `/config` | Show configuration |
| `/exit` | Exit Vinsa |

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
