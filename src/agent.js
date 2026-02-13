/**
 * Vinsa CLI — AI Agent Core (Groq-powered with Auto Model Rotation)
 * 
 * ReAct (Reason + Act) agent loop with ZERO-DOWNTIME model fallback:
 *   - Maintains a pool of free Groq models
 *   - On rate limit (429) → instantly jumps to next available model (no delay)
 *   - Tracks cooldown per model (60s default)
 *   - When all models are exhausted, waits for the first one to recover
 *   - Cycles back to preferred model when its cooldown expires
 * 
 * Uses Groq's OpenAI-compatible API with native tool calling.
 */
import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import { getApiKey, getModel, getMaxRetries, getPlanMode, isUsingDevKey } from './config.js';
import { toolDefinitions, executeTool } from './tools.js';
import { loadPlugins, executePlugin, isPluginTool, getPluginTools } from './plugins.js';
import { printToolCall, printToolResult, printRetry, printError, printInfo, printWarning, colors } from './ui.js';

// ════════════════════════════════════════════════════════════
// FREE MODEL POOL — ordered by quality (best first)
// ════════════════════════════════════════════════════════════
const MODEL_POOL = [
  // Tier 1: Large, best tool-calling & instruction-following
  { id: 'llama-3.3-70b-versatile',    label: 'Llama 3.3 70B',     cooldown: 60 },
  { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick 17B', cooldown: 60 },
  { id: 'qwen-qwq-32b',              label: 'Qwen QwQ 32B',      cooldown: 60 },
  { id: 'mistral-saba-24b',          label: 'Mistral Saba 24B',   cooldown: 60 },
  // Tier 2: Medium MoE — decent but weaker instruction-following
  { id: 'mixtral-8x7b-32768',        label: 'Mixtral 8x7B',      cooldown: 60 },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B', cooldown: 60 },
  // Tier 3: Small — fast but limited tool-calling reliability
  { id: 'gemma2-9b-it',              label: 'Gemma 2 9B',        cooldown: 45 },
  { id: 'llama-3.1-8b-instant',      label: 'Llama 3.1 8B',      cooldown: 45 },
  { id: 'llama-3.2-3b-preview',      label: 'Llama 3.2 3B',      cooldown: 30 },
];

const SYSTEM_PROMPT = `You are **Vinsa**, a powerful, free, open-source AI CLI agent created by **Lagishetti Vignesh**, running **locally** inside the user's terminal on **their own machine**.

## CRITICAL: You Run LOCALLY
You are NOT a remote cloud assistant. You are running directly on the user's computer with full local access. When the user says "my laptop", "my system", "my files", "my computer" — they are talking about the SAME machine you are running on. You CAN and SHOULD access it directly using your tools. NEVER tell the user to "go check" something or give generic instructions — just DO IT yourself using your tools and show the real result.

## Core Principle: Minimal & Precise
**Think before acting. Only use tools when the user's request genuinely requires them.**
- If you can answer from your own knowledge (general knowledge, coding concepts, explanations) — just answer. No tools needed.
- But if the user asks ANYTHING about THEIR system, files, processes, network, or computer — ALWAYS use tools to get the real answer. Never guess or give generic how-to instructions.
- Only call a tool when you NEED real-time data, file access, system info, or to perform an action the user explicitly asked for.
- NEVER call multiple tools when one will do. NEVER call a tool just to "show work" — only when it adds value.
- When you do use a tool, use the EXACT right one for the job. Don't run shell commands when a dedicated tool exists.

## Your Capabilities (only mention when asked)
You have **FULL ACCESS** to the user's entire computer. You can read/write any file, run any command, and access any directory on the system. Your tools include:
- **Shell Commands**: Run ANY command anywhere on the system (PowerShell on Windows, bash on Linux/macOS) — no restrictions
- **File Operations**: Read, write, search ANY file or directory on the entire computer using absolute paths (e.g., C:\\Users\\..., /home/..., /etc/...)
- **Network Diagnostics**: Ping, DNS lookup, port scan, traceroute, WiFi scan
- **System Information**: CPU, RAM, disk, GPU, battery, processes, OS info
- **Web Fetch**: Make HTTP requests to any URL / API
- **Code Analysis**: Analyze any project structure, dependencies, TODOs, stats
- **Process Manager**: List, find, kill any process
- **Git Source Control**: Full Git integration — status, log, branch, add, commit, push, pull, merge, stash, clone, init, remote, tag, diff, blame, cherry-pick, rebase, reset, checkout, show, fetch, conflict resolution, repo info. You ARE a complete Git client.

**Important**: When the user asks about files, folders, or paths anywhere on their computer, use absolute paths. You are NOT restricted to any particular directory. You can navigate the ENTIRE filesystem.

## Conversational Behavior
- **Greetings**: "hi" → "Hi! How are you?". "thanks" → "You're welcome!". Keep it short and human.
- **General questions**: Answer directly from knowledge. No tools.
- **Command/syntax questions** (user asks "command for X", "traceroute", "how to check disk in terminal", etc.): Provide the command in a fenced code block with the shell language. Do NOT execute the command or use tools — the user wants the syntax. Example: \`\`\`powershell\ntracert {host_or_ip}\n\`\`\`
- **Personal system questions** ("my laptop version", "my IP", "my disk space", "what's running", "can you access my laptop"): ALWAYS use tools (get_system_info, run_shell_command, etc.) to fetch the real data and show it. You ARE on their machine — just look it up.
- **Capability questions**: Only when user asks "what can you do" / "help" — give a full organized list.
- **Action requests**: Only then use the appropriate tool(s).
- **Match effort to complexity**: Simple question = simple answer. Complex task = thorough multi-step work.

## Behavior Rules
1. **Don't guess when data is needed**: If the user asks about THEIR files, system, network, laptop, computer, or anything personal/local — ALWAYS use tools to get the actual data. Never give generic instructions like "press Win+R" or "click About This Mac" — you can get that info yourself. If they ask a general knowledge question — just answer.
2. **Be thorough for real tasks**: If a task requires multiple steps, chain tools together.
3. **Be safe**: NEVER run destructive commands (rm -rf /, format, etc.) without explicit user confirmation.
4. **Be concise**: No unnecessary preamble, no restating the question, no filler. Get to the point.
5. **Self-heal**: If a command fails, analyze the error and try a different approach.
6. **Be honest**: If you can't do something, say so clearly.
7. **No over-explaining**: Don't explain what you're about to do unless it's a complex or risky operation. Just do it and show the result.
8. **Tool parameters**: When calling tools, NEVER pass null for any parameter. Simply OMIT optional parameters you don't need — do not include them at all.
9. **Avoid huge listings**: NEVER use recursive listing on root drives (C:\, /, /home) — it returns too much data. For broad requests like "my files in C drive", list only the TOP-LEVEL items (no recursive). Only use recursive on specific subdirectories. If a tool result says it was truncated, summarize what you have and suggest narrowing the query.

## Platform Awareness
- Detect the OS from system info and use platform-appropriate commands
- On Windows: use PowerShell commands
- On Linux/macOS: use bash commands

## Response Format
- Use markdown for formatting
- **Commands**: ALWAYS wrap terminal/shell commands in fenced code blocks with the language tag (\`\`\`bash, \`\`\`powershell, \`\`\`cmd). This enables the CLI to offer interactive Run/Copy actions to the user.
- Use tables for structured data
- Keep responses focused and actionable`;

/**
 * Load VINSA.md context files (like Gemini CLI's GEMINI.md).
 * Searches: cwd → parent dirs → home dir (global)
 * Returns combined context string or empty string.
 */
function loadVinsaContext() {
  const contexts = [];
  const seen = new Set();

  // 1. Search from cwd upward
  let dir = process.cwd();
  const root = path.parse(dir).root;
  while (dir && dir !== root) {
    const filePath = path.join(dir, 'VINSA.md');
    if (!seen.has(filePath) && fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8').trim();
        if (content) {
          contexts.push(`[Context from ${filePath}]\n${content}`);
          seen.add(filePath);
        }
      } catch { /* skip unreadable */ }
    }
    dir = path.dirname(dir);
  }

  // 2. Check global ~/.vinsa/VINSA.md
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home) {
    const globalPath = path.join(home, '.vinsa', 'VINSA.md');
    if (!seen.has(globalPath) && fs.existsSync(globalPath)) {
      try {
        const content = fs.readFileSync(globalPath, 'utf-8').trim();
        if (content) contexts.push(`[Global context from ${globalPath}]\n${content}`);
      } catch { /* skip */ }
    }
  }

  return contexts.length > 0
    ? '\n\n## Project Context (from VINSA.md)\n' + contexts.join('\n\n')
    : '';
}

/**
 * Convert our tool definitions to OpenAI-compatible format (used by Groq)
 */
function toGroqTools(toolDefs) {
  return toolDefs.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

// ════════════════════════════════════════════════════════════
// MODEL ROTATOR — Instant zero-lag model switching
// ════════════════════════════════════════════════════════════
class ModelRotator {
  constructor(preferredModel) {
    this.preferredModel = preferredModel;
    // Build ordered list: preferred model first, then rest of pool
    this.models = this._buildModelList(preferredModel);
    // Track when each model was rate-limited: modelId → timestamp
    this.cooldowns = new Map();
  }

  _buildModelList(preferredModel) {
    const preferred = MODEL_POOL.find(m => m.id === preferredModel);
    const rest = MODEL_POOL.filter(m => m.id !== preferredModel);
    // If preferred is in pool, put it first; otherwise just use pool order
    return preferred ? [preferred, ...rest] : [...MODEL_POOL];
  }

  /**
   * Get the best available model right now (instant, no waiting)
   */
  getAvailableModel() {
    const now = Date.now();

    // First pass: find first model that's NOT on cooldown
    for (const model of this.models) {
      const cooldownUntil = this.cooldowns.get(model.id);
      if (!cooldownUntil || now >= cooldownUntil) {
        // Cooldown expired or never rate-limited — this model is good
        this.cooldowns.delete(model.id);
        return model;
      }
    }

    // All models on cooldown — find the one that recovers soonest
    let soonest = null;
    let soonestTime = Infinity;
    for (const model of this.models) {
      const cooldownUntil = this.cooldowns.get(model.id);
      if (cooldownUntil && cooldownUntil < soonestTime) {
        soonestTime = cooldownUntil;
        soonest = model;
      }
    }
    return { ...soonest, waitMs: Math.max(0, soonestTime - now) };
  }

  /**
   * Mark a model as rate-limited. It enters cooldown.
   */
  markRateLimited(modelId) {
    const model = this.models.find(m => m.id === modelId);
    const cooldownSec = model?.cooldown || 60;
    this.cooldowns.set(modelId, Date.now() + cooldownSec * 1000);
  }

  /**
   * Get the status of all models
   */
  getStatus() {
    const now = Date.now();
    return this.models.map(m => {
      const cooldownUntil = this.cooldowns.get(m.id);
      const onCooldown = cooldownUntil && now < cooldownUntil;
      return {
        id: m.id,
        label: m.label,
        status: onCooldown ? 'cooldown' : 'available',
        recoversIn: onCooldown ? Math.ceil((cooldownUntil - now) / 1000) + 's' : '-',
      };
    });
  }
}

// ════════════════════════════════════════════════════════════
// VINSA AGENT
// ════════════════════════════════════════════════════════════
export class VinsaAgent {
  constructor() {
    this.conversationHistory = [];
    this.client = null;
    this.rotator = null;
    this.mcpManager = null;
    this.mcpTools = [];
    this.pluginToolDefs = [];
    this.groqTools = [];
    this.initialized = false;
    // Token usage tracking
    this.tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0 };
    this.sessionStart = Date.now();
  }

  initialize() {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error(
        'No Groq API key found!\n\n' +
        'Get your FREE key at: https://console.groq.com/keys\n\n' +
        'Then run: vinsa config set-key YOUR_API_KEY\n' +
        'Or set: GROQ_API_KEY=your_key in environment'
      );
    }

    this.client = new Groq({ apiKey });
    this.rotator = new ModelRotator(getModel());
    this.initialized = true;

    // Combine built-in tools + MCP tools + plugin tools, convert to Groq format
    this._rebuildTools();
  }

  /**
   * Rebuild the Groq tools array from all sources
   */
  _rebuildTools() {
    const allToolDefs = [...toolDefinitions, ...this.mcpTools, ...this.pluginToolDefs];
    this.groqTools = toGroqTools(allToolDefs);
  }

  /**
   * Load plugins (async) — call after initialize()
   */
  async initializePlugins({ silent = false } = {}) {
    try {
      this.pluginToolDefs = await loadPlugins({ silent });
      this._rebuildTools();
    } catch (err) {
      if (!silent) printWarning(`Plugin loading failed: ${err.message}`);
    }
  }

  /**
   * Add MCP tools to the agent (called by MCP client)
   */
  addMcpTools(tools, mcpManager) {
    this.mcpTools.push(...tools);
    if (mcpManager) this.mcpManager = mcpManager;
    if (this.client) this._rebuildTools();
  }

  /**
   * The core agent loop with automatic model rotation.
   * On rate limit → instantly jumps to next model (zero lag).
   */
  async run(userMessage, { onToolCall, onToolResult, onRetry, onModelSwitch } = {}) {
    if (!this.client) this.initialize();

    // ─── Smart Auto-Context: detect @file references and inject contents ───
    const enrichedMessage = this._injectFileContext(userMessage);

    // Add user message to conversation history
    this.conversationHistory.push({
      role: 'user',
      content: enrichedMessage,
    });

    const maxRetries = getMaxRetries();
    // We allow more retries since model switches are instant and don't "waste" attempts
    const totalAttempts = Math.max(maxRetries, MODEL_POOL.length + 2);
    let attempt = 0;
    let nonRateLimitFailures = 0;

    while (attempt < totalAttempts) {
      // Pick the best available model
      const modelInfo = this.rotator.getAvailableModel();

      // If all models on cooldown, wait for the soonest one
      if (modelInfo.waitMs && modelInfo.waitMs > 0) {
        const waitSec = Math.ceil(modelInfo.waitMs / 1000);
        const msg = `All models on cooldown. ${modelInfo.label} recovers in ${waitSec}s...`;
        if (onRetry) onRetry(attempt + 1, totalAttempts, msg);
        else printWarning(`  ⏳ ${msg}`);
        await new Promise(resolve => setTimeout(resolve, modelInfo.waitMs));
      }

      const currentModel = modelInfo.id;

      try {
        return await this._agentLoop(currentModel, { onToolCall, onToolResult });
      } catch (err) {
        attempt++;
        const isRateLimit = err.message.includes('429') || err.message.includes('rate_limit');
        const isModelNotFound = err.message.includes('404') || err.message.includes('not found') || err.message.includes('does not exist') || err.message.includes('decommissioned') || err.message.includes('model_not_active');

        if (isRateLimit || isModelNotFound) {
          // Mark this model as rate-limited / unavailable — instant switch, no delay
          this.rotator.markRateLimited(currentModel);
          const next = this.rotator.getAvailableModel();

          if (!next.waitMs || next.waitMs === 0) {
            // Another model is available RIGHT NOW — switch instantly
            const reason = isRateLimit ? 'rate limited' : 'unavailable';
            const msg = `${modelInfo.label} ${reason} → switching to ${next.label}`;
            if (onModelSwitch) onModelSwitch(currentModel, next.id, msg);
            else printInfo(`  ↻ ${msg}`);
            // Don't wait, just loop back and try next model
            continue;
          }
          // All models exhausted — will wait at top of loop
          continue;
        }

        // Non-rate-limit error
        const isContextOverflow = err.message.includes('reduce the length');
        nonRateLimitFailures++;
        if (nonRateLimitFailures > maxRetries) {
          if (err.message.includes('401') || err.message.includes('invalid_api_key')) {
            throw new Error(
              'Invalid Groq API key.\n' +
              '  Get your FREE key at: https://console.groq.com/keys\n' +
              '  Then run: vinsa config set-key YOUR_API_KEY'
            );
          }
          throw err;
        }

        if (onRetry) onRetry(nonRateLimitFailures, maxRetries, err.message);
        else printRetry(nonRateLimitFailures, maxRetries, err.message);

        if (isContextOverflow) {
          // Trim conversation history to prevent repeating the overflow
          // Keep the last user message, drop tool-heavy middle messages
          const lastUser = this.conversationHistory.filter(m => m.role === 'user').pop();
          this.conversationHistory = lastUser
            ? [{ role: 'user', content: lastUser.content + '\n\n[SYSTEM] The previous tool returned too much data. Please use a more targeted approach — e.g., list only top-level items (no recursive), or narrow the search scope.' }]
            : this.conversationHistory.slice(-2);
        } else {
          // Add error context so the AI can self-correct
          this.conversationHistory.push({
            role: 'user',
            content: `[SYSTEM] Previous attempt failed with error: ${err.message}. Please try a different approach.`,
          });
        }
      }
    }

    if (isUsingDevKey()) {
      throw new Error('DEV_KEY_EXHAUSTED: All models exhausted on the built-in key. Please provide your own Groq API key to continue.');
    }
    throw new Error('All models exhausted and max retries reached. Please try again later.');
  }

  async _agentLoop(modelId, { onToolCall, onToolResult }) {
    // Build messages array with system prompt + VINSA.md context
    const vinsaContext = loadVinsaContext();
    const planMode = getPlanMode();
    const planAddendum = planMode
      ? '\n\n## PLAN MODE (ACTIVE)\nBefore taking ANY action or using ANY tool, first output a numbered plan of exactly what you intend to do. Format:\n\n**Plan:**\n1. Step one\n2. Step two\n3. ...\n\nThen ask the user: "Shall I proceed with this plan?" Only use tools AFTER outlining the plan.'
      : '';
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + planAddendum + vinsaContext },
      ...this.conversationHistory,
    ];

    let maxToolCalls = 20;
    let toolCallCount = 0;

    while (toolCallCount < maxToolCalls) {
      let response;
      try {
        // Call Groq with the specific model
        response = await this.client.chat.completions.create({
          model: modelId,
          messages,
          tools: this.groqTools.length > 0 ? this.groqTools : undefined,
          tool_choice: this.groqTools.length > 0 ? 'auto' : undefined,
          temperature: 0.7,
          max_tokens: 8192,
        });
      } catch (apiErr) {
        // ── Recover from tool_use_failed (LLM sent null for optional params) ──
        const failedGen = apiErr?.error?.failed_generation;
        if (apiErr.status === 400 && failedGen) {
          const recovered = VinsaAgent._extractToolCalls(failedGen);
          if (recovered.length > 0) {
            // Build synthetic assistant + tool messages, execute the recovered calls
            const syntheticToolCalls = recovered.map((tc, i) => ({
              id: `recovered_${Date.now()}_${i}`,
              type: 'function',
              function: { name: tc.name, arguments: JSON.stringify(tc.parameters) },
            }));
            messages.push({ role: 'assistant', content: null, tool_calls: syntheticToolCalls });

            for (const tc of syntheticToolCalls) {
              const functionName = tc.function.name;
              let functionArgs = {};
              try { functionArgs = JSON.parse(tc.function.arguments || '{}'); } catch { functionArgs = {}; }
              if (!functionArgs || typeof functionArgs !== 'object') functionArgs = {};
              toolCallCount++;

              if (onToolCall) onToolCall(functionName, functionArgs);
              else printToolCall(functionName, functionArgs);

              let result;
              if (this.mcpManager && this.mcpManager.isMcpTool(functionName)) {
                result = await this.mcpManager.executeTool(functionName, functionArgs);
              } else if (isPluginTool(functionName)) {
                result = await executePlugin(functionName, functionArgs);
              } else {
                result = await executeTool(functionName, functionArgs);
              }

              if (onToolResult) onToolResult(result);
              else printToolResult(result);

              messages.push({ role: 'tool', tool_call_id: tc.id, content: VinsaAgent._truncateResult(JSON.stringify(result)) });
            }
            continue; // continue the agent while-loop for the LLM's next response
          }
        }
        throw apiErr; // re-throw if we can't recover
      }

      // Track token usage
      if (response.usage) {
        this.tokenUsage.promptTokens += response.usage.prompt_tokens || 0;
        this.tokenUsage.completionTokens += response.usage.completion_tokens || 0;
        this.tokenUsage.totalTokens += response.usage.total_tokens || 0;
        this.tokenUsage.requests++;
      }
      const choice = response.choices?.[0];
      if (!choice) break;

      const assistantMessage = choice.message;
      messages.push(assistantMessage);

      const toolCalls = assistantMessage.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        const finalText = assistantMessage.content || '';
        this.conversationHistory.push({ role: 'assistant', content: finalText });
        return finalText;
      }

      // Execute all tool calls
      for (const tc of toolCalls) {
        const functionName = tc.function.name;
        let functionArgs = {};
        try { functionArgs = JSON.parse(tc.function.arguments || '{}'); } catch { functionArgs = {}; }
        // Strip null/undefined values from args (safety net for schema compliance)
        functionArgs = VinsaAgent._stripNulls(functionArgs);
        if (!functionArgs || typeof functionArgs !== 'object') functionArgs = {};
        toolCallCount++;

        if (onToolCall) onToolCall(functionName, functionArgs);
        else printToolCall(functionName, functionArgs);

        // Route to MCP handler, plugin handler, or built-in tool handler
        let result;
        if (this.mcpManager && this.mcpManager.isMcpTool(functionName)) {
          result = await this.mcpManager.executeTool(functionName, functionArgs);
        } else if (isPluginTool(functionName)) {
          result = await executePlugin(functionName, functionArgs);
        } else {
          result = await executeTool(functionName, functionArgs);
        }

        if (onToolResult) onToolResult(result);
        else printToolResult(result);

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: VinsaAgent._truncateResult(JSON.stringify(result)),
        });
      }
    }

    const finalText = 'I reached the maximum number of tool calls for this request. Here is what I found so far. Please ask me to continue if needed.';
    this.conversationHistory.push({ role: 'assistant', content: finalText });
    return finalText;
  }

  /**
   * Extract tool calls from a Groq failed_generation string.
   * Handles both pure JSON arrays and text-mixed responses.
   */
  static _extractToolCalls(failedGeneration) {
    // Try direct JSON parse first (pure JSON array case)
    try {
      const parsed = JSON.parse(failedGeneration);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(tc => tc && tc.name)
          .map(tc => ({ name: tc.name, parameters: VinsaAgent._stripNulls(tc.parameters || {}) }));
      }
    } catch { /* not pure JSON, try regex extraction */ }

    // Try to find an embedded JSON array in mixed text+JSON output
    const match = failedGeneration.match(/\[[\s\S]*?\{[\s\S]*?"name"[\s\S]*?\}[\s\S]*?\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          return parsed
            .filter(tc => tc && tc.name)
            .map(tc => ({ name: tc.name, parameters: VinsaAgent._stripNulls(tc.parameters || {}) }));
        }
      } catch { /* extraction failed */ }
    }

    // Handle <function=tool_name{"param":"value"}></function> format
    // Some models (e.g. Llama 3.3 70B) embed args directly in the tool name
    const fnMatches = [...failedGeneration.matchAll(/<function=(\w+)\s*(\{[\s\S]*?\})\s*>/g)];
    if (fnMatches.length > 0) {
      const results = [];
      for (const fm of fnMatches) {
        try {
          const name = fm[1];
          const params = JSON.parse(fm[2]);
          results.push({ name, parameters: VinsaAgent._stripNulls(params) });
        } catch { /* skip malformed entries */ }
      }
      if (results.length > 0) return results;
    }

    return [];
  }

  /**
   * Strip null/undefined and coerce mistyped values (shallow).
   * Fixes LLMs sending "true" (string) instead of true (boolean), etc.
   */
  static _stripNulls(obj) {
    if (!obj || typeof obj !== 'object') return {};
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, VinsaAgent._coerceValue(v)])
    );
  }

  /**
   * Coerce common LLM mistyped values:
   *   "true"/"false" → boolean, numeric strings → number
   */
  static _coerceValue(v) {
    if (typeof v === 'string') {
      if (v === 'true') return true;
      if (v === 'false') return false;
      // Coerce pure numeric strings ("123", "3.14") but not things like paths
      if (/^-?\d+(\.\d+)?$/.test(v) && v.length < 16) return Number(v);
    }
    return v;
  }

  /**
   * Truncate a tool result string to prevent context overflow.
   * Max ~30KB — large enough to be useful, small enough for any model.
   */
  static _truncateResult(resultStr, maxBytes = 15000) {
    if (resultStr.length <= maxBytes) return resultStr;
    const truncated = resultStr.slice(0, maxBytes);
    return truncated + '\n\n... [TRUNCATED — result was ' + Math.round(resultStr.length / 1024) + 'KB, kept first ' + Math.round(maxBytes / 1024) + 'KB. Summarize what you have and suggest the user narrow the query if needed.]';
  }

  async ask(prompt, { silent = false } = {}) {
    if (!this.client) this.initialize();
    this.conversationHistory = [];
    const callbacks = silent ? {
      onToolCall: () => {},
      onToolResult: () => {},
      onRetry: () => {},
      onModelSwitch: () => {},
    } : {};
    return this.run(prompt, callbacks);
  }

  /**
   * Reinitialize the agent with a new API key (e.g., after dev key exhaustion)
   */
  reinitializeWithKey(apiKey) {
    this.client = new Groq({ apiKey });
    this.rotator = new ModelRotator(getModel());
    this.initialized = true;
    this._rebuildTools();
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  getHistoryLength() {
    return this.conversationHistory.length;
  }

  /**
   * Get token usage stats
   */
  getStats() {
    const elapsed = Date.now() - this.sessionStart;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    return {
      ...this.tokenUsage,
      sessionDuration: `${mins}m ${secs}s`,
      conversationLength: this.conversationHistory.length,
    };
  }

  /**
   * Get conversation history for save/load
   */
  getConversationHistory() {
    return [...this.conversationHistory];
  }

  /**
   * Restore conversation history (for /chat load)
   */
  setConversationHistory(history) {
    this.conversationHistory = [...history];
  }

  /**
   * Compress conversation: replace history with a summary
   */
  async compressHistory() {
    if (!this.client || this.conversationHistory.length < 4) {
      return 'Not enough conversation to compress.';
    }

    const modelInfo = this.rotator.getAvailableModel();
    const response = await this.client.chat.completions.create({
      model: modelInfo.id,
      messages: [
        { role: 'system', content: 'You are a conversation summarizer. Produce a concise summary of the conversation below, preserving key information, decisions made, files modified, and important context. Output ONLY the summary, no preamble.' },
        ...this.conversationHistory,
        { role: 'user', content: 'Summarize the above conversation concisely.' },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    });

    if (response.usage) {
      this.tokenUsage.promptTokens += response.usage.prompt_tokens || 0;
      this.tokenUsage.completionTokens += response.usage.completion_tokens || 0;
      this.tokenUsage.totalTokens += response.usage.total_tokens || 0;
      this.tokenUsage.requests++;
    }

    const summary = response.choices?.[0]?.message?.content || '';
    const oldLength = this.conversationHistory.length;

    // Replace entire history with a single system-context message + summary
    this.conversationHistory = [
      { role: 'user', content: `[CONTEXT] Previous conversation summary:\n${summary}` },
      { role: 'assistant', content: 'Understood. I have the context from our previous conversation. How can I help you next?' },
    ];

    return `Compressed ${oldLength} messages → 2 (summary). Tokens saved for future requests.`;
  }

  /**
   * Get model rotation status (for /models slash command)
   */
  getModelStatus() {
    if (!this.rotator) return [];
    return this.rotator.getStatus();
  }

  // ════════════════════════════════════════════════════════════
  // SMART AUTO-CONTEXT — Detect @file or file path references, inject content
  // ════════════════════════════════════════════════════════════
  _injectFileContext(message) {
    let enriched = message;
    const injected = [];

    // Match @filepath patterns (e.g., @src/index.js, @package.json)
    const atFileRegex = /@([\w.\/\\-]+\.\w+)/g;
    let match;
    while ((match = atFileRegex.exec(message)) !== null) {
      const filePath = match[1];
      try {
        const resolved = path.resolve(filePath);
        if (fs.existsSync(resolved)) {
          const stat = fs.statSync(resolved);
          if (stat.size < 50000) { // Only inject files < 50KB
            const content = fs.readFileSync(resolved, 'utf-8');
            injected.push(`\n\n[Auto-injected content of ${filePath}]\n\`\`\`\n${content}\n\`\`\``);
          }
        }
      } catch { /* skip unreadable files */ }
    }

    if (injected.length > 0) {
      enriched += injected.join('');
    }
    return enriched;
  }

  // ════════════════════════════════════════════════════════════
  // MULTI-AGENT MODE — Planner → Executor → Reviewer pipeline
  // ════════════════════════════════════════════════════════════
  async runMultiAgent(task, { onPhase, onToolCall, onToolResult } = {}) {
    if (!this.client) this.initialize();

    const modelInfo = this.rotator.getAvailableModel();
    const modelId = modelInfo.id;

    // ─── Phase 1: Planner ───
    if (onPhase) onPhase('planning', 'Creating a detailed plan...');
    const planResponse = await this.client.chat.completions.create({
      model: modelId,
      messages: [
        { role: 'system', content: `You are a task planner. Break down the following task into clear, numbered steps. Each step should be a single, concrete action. Output ONLY the numbered plan, nothing else.` },
        { role: 'user', content: task },
      ],
      temperature: 0.4,
      max_tokens: 2048,
    });
    if (planResponse.usage) this._trackUsage(planResponse.usage);
    const plan = planResponse.choices?.[0]?.message?.content || '';

    // ─── Phase 2: Executor ───
    if (onPhase) onPhase('executing', 'Executing the plan...');
    // Save current history, use fresh context for executor
    const savedHistory = [...this.conversationHistory];
    this.conversationHistory = [];

    const executorPrompt = `Execute the following plan step by step. Use your tools to complete each step.\n\n**Plan:**\n${plan}\n\n**Original Task:** ${task}\n\nExecute ALL steps now. Report results for each step.`;

    const executorResult = await this.run(executorPrompt, { onToolCall, onToolResult });

    // ─── Phase 3: Reviewer ───
    if (onPhase) onPhase('reviewing', 'Reviewing the results...');
    const reviewResponse = await this.client.chat.completions.create({
      model: modelId,
      messages: [
        { role: 'system', content: `You are a quality reviewer. Review the work done below and provide:
1. A brief summary of what was accomplished
2. Any issues or mistakes found
3. Suggestions for improvement
4. A quality score (1-10)
Be concise and constructive.` },
        { role: 'user', content: `**Original Task:** ${task}\n\n**Plan:**\n${plan}\n\n**Execution Result:**\n${executorResult}` },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    });
    if (reviewResponse.usage) this._trackUsage(reviewResponse.usage);
    const review = reviewResponse.choices?.[0]?.message?.content || '';

    // Restore original history and add the combined result
    this.conversationHistory = savedHistory;
    const combinedResult = `## Multi-Agent Result\n\n### Plan\n${plan}\n\n### Execution\n${executorResult}\n\n### Review\n${review}`;
    this.conversationHistory.push({ role: 'user', content: task });
    this.conversationHistory.push({ role: 'assistant', content: combinedResult });

    return { plan, executionResult: executorResult, review, combined: combinedResult };
  }

  _trackUsage(usage) {
    this.tokenUsage.promptTokens += usage.prompt_tokens || 0;
    this.tokenUsage.completionTokens += usage.completion_tokens || 0;
    this.tokenUsage.totalTokens += usage.total_tokens || 0;
    this.tokenUsage.requests++;
  }
}

// Singleton agent instance
let agentInstance = null;
export function getAgent() {
  if (!agentInstance) {
    agentInstance = new VinsaAgent();
  }
  return agentInstance;
}

export { MODEL_POOL };
