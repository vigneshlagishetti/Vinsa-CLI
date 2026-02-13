/**
 * Vinsa CLI — Fully Automated Interactive Shell
 * 
 * Features:
 * - First-run setup wizard (auto prompts for API key)
 * - Persistent REPL that NEVER exits unexpectedly
 * - Conversation memory (multi-turn)
 * - Slash commands (/help, /clear, /tools, /models, /mcp, /system, /config,
 *   /save, /load, /list, /compress, /stats, /copy, /theme, /exit)
 * - @file injection (inject file contents into prompt)
 * - !command shell passthrough (run shell commands directly)
 * - VINSA.md context files (project-specific instructions)
 * - OS auto-detection
 * - Graceful error recovery
 * - Arrow key history recall
 * - Tab completion for slash commands
 */
import readline from 'readline';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getAgent, MODEL_POOL } from './agent.js';
import { getMcpManager, autoSetupDefaultServers } from './mcp.js';
import {
  printBanner, printResponse, printDivider, printPrompt, printInfo,
  printError, printSuccess, printWarning, createSpinner, colors,
  printToolCall, printToolResult, printRetry, printCommandCard, printCommandActions,
  printTimeline, printSnapshotDiff, printAutopilotStep, printAutopilotStatus,
  printAbout,
} from './ui.js';
import {
  showConfig, clearHistory, addToHistory, getApiKey, setApiKey, getModel,
  saveSession, loadSession, listSessions, deleteSession,
  saveLastSession, getLastSession, getPlanMode, setPlanMode,
  getAliases, setAlias, removeAlias, resolveAlias,
  getHooks, addHook, removeHook, clearHooks,
  getBranches, saveBranch, getBranch, deleteBranch, getActiveBranch, setActiveBranch,
  getConfirmWrites, setConfirmWrites, getHistory,
  isUsingDevKey,
  getTeachCommands, setTeachCommand, removeTeachCommand, resolveTeachCommand,
  saveSnapshot, getSnapshot, listSnapshots, deleteSnapshot,
} from './config.js';
import { undoLastChange, getFileChangeStack, setInteractiveConfirm, toolDefinitions } from './tools.js';
import { getPluginTools, getPluginsDir, listPluginFiles, loadPlugins } from './plugins.js';
import {
  gitStatus, gitLog, gitBranch as gitBranchOp, gitDiff as gitDiffOp, gitAdd,
  gitCommit as gitCommitOp, gitPush, gitPull, gitMerge, gitStash,
  gitClone, gitInit as gitInitOp, gitRemote, gitTag, gitBlame,
  gitCherryPick, gitRebase, gitReset, gitCheckout, gitShow,
  gitFetch, gitConflicts, gitRepoInfo,
} from './git.js';

// Track last AI response for /copy
let lastResponse = '';

// ─── Slash commands registry ───
const SLASH_COMMANDS = {
  '/help':     'Show all available commands',
  '/clear':    'Clear conversation history',
  '/tools':    'List all available tools',
  '/models':   'Show model rotation status & available models',
  '/mcp':      'Show MCP server status',
  '/system':   'Show system information',
  '/config':   'Show current configuration',
  '/history':  'Show conversation history summary',
  '/stats':    'Show token usage & session statistics',
  '/compact':  'Compress conversation to save context',
  '/save':     'Save current session — /save [name]',
  '/load':     'Load a saved session — /load <name>',
  '/list':     'List all saved sessions',
  '/copy':     'Copy last response to clipboard',
  '/commit':   'AI-powered git commit message + commit',
  '/diff':     'Show git diff (staged or unstaged)',
  '/undo':     'Undo the last file change made by Vinsa',
  '/doctor':   'Run self-diagnostic checks',
  '/plan':     'Toggle plan mode (think before acting)',
  '/export':   'Export conversation — /export [md|html|json]',
  '/alias':    'Manage aliases — /alias name = prompt | list | remove name',
  '/recall':   'Search history — /recall <keyword>',
  '/voice':    'Voice input via Groq Whisper (microphone)',
  '/branch':   'Fork conversation — /branch [name]',
  '/switch':   'Switch branch — /switch <name>',
  '/hooks':    'Manage tool hooks — /hooks [list|add|remove|clear]',
  '/confirm':  'Toggle interactive diff preview for writes',
  '/plugins':  'List loaded plugins',
  '/multi':    'Multi-agent mode — /multi <task>',
  '/git':      'Git source control — /git <command> [args]',
  '/status':   'Git status (shortcut)',
  '/log':      'Git log — /log [count] [--graph] [--all]',
  '/stash':    'Git stash — /stash [save|list|pop|apply|drop|clear]',
  '/push':     'Git push — /push [remote] [branch]',
  '/pull':     'Git pull — /pull [--rebase]',
  '/merge':    'Git merge — /merge <branch> [--squash] [--no-ff]',
  '/tag':      'Git tag — /tag [create|delete] [name]',
  '/remote':   'Git remote — /remote [add|remove] [name] [url]',
  '/blame':    'Git blame — /blame <file> [startLine] [endLine]',
  '/fetch':    'Git fetch — /fetch [--all] [--prune]',
  '/cherry-pick': 'Cherry-pick commits — /cherry-pick <hash>...',
  '/repoinfo': 'Show comprehensive repo information',
  '/about':     'About Vinsa & its creator — Lagishetti Vignesh',
  '/quickfix':  'AI auto-fix for the last error',
  '/teach':     'Teach Vinsa custom commands — /teach name = command',
  '/timeline':  'Show session activity timeline',
  '/snapshot':  'System state capture — /snapshot [name] | /snapshot diff <a> <b>',
  '/autopilot': 'Goal-driven AI loop — /autopilot <goal>',
  '/explain':   'Run & explain — /explain <command>',
  '/exit':     'Exit Vinsa shell',
  '/quit':     'Exit Vinsa shell',
};

const SLASH_NAMES = Object.keys(SLASH_COMMANDS);

// ─── Tab completer for slash commands ───
function completer(line) {
  if (line.startsWith('/')) {
    const hits = SLASH_NAMES.filter(c => c.startsWith(line));
    return [hits.length ? hits : SLASH_NAMES, line];
  }
  return [[], line];
}

// ─── Promisified readline question ───
function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer));
  });
}

/**
 * Like question(), but pre-fills the input with a default value
 * so the user can edit it with arrow keys / backspace.
 */
function questionPrefilled(rl, prompt, prefill) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer));
    rl.write(prefill);
  });
}

// ─── Command Extraction & Interactive Execution ───
// Detects shell commands in LLM responses and renders VS Code-style command cards.

const SHELL_LANGS = /^(?:bash|sh|powershell|ps1|cmd|bat|shell|zsh|terminal|console)$/i;

// Build a Set of known tool names so we can filter them out of command cards
const TOOL_NAMES = new Set(toolDefinitions.map(t => t.name));

// ─── Session Timeline Tracker ───
const sessionTimeline = [];
function trackEvent(type, description, detail = '') {
  sessionTimeline.push({ type, description, detail, timestamp: Date.now() });
}

// ─── Last Error Tracker (for /quickfix) ───
let lastCommandError = null;   // { command, error, stderr, timestamp }

/**
 * Parse a markdown response into command cards.
 * Returns array of { header, command, description } objects,
 * or empty array if no shell commands found.
 */
function parseCommandResponse(text) {
  const codeBlockRegex = /```(\w+)\n([\s\S]*?)```/g;
  const cards = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const lang = match[1];
    const code = match[2].trim();
    if (!code || !SHELL_LANGS.test(lang)) continue;

    // Skip if the command is actually a Vinsa tool name (not a real shell command)
    const firstToken = code.split(/\s+/)[0];
    if (TOOL_NAMES.has(firstToken)) continue;

    // Text before this code block → header
    const before = text.slice(lastIndex, match.index).trim();
    // Text after this code block (until next code block or end)
    const afterStart = match.index + match[0].length;

    // Peek ahead to find next code block or end
    const nextBlockMatch = /```\w+\n/.exec(text.slice(afterStart));
    const afterEnd = nextBlockMatch
      ? afterStart + nextBlockMatch.index
      : text.length;
    const after = text.slice(afterStart, afterEnd).trim();

    // Build a short header from the text before the code block
    let header = before
      .replace(/^#+\s*/gm, '')       // strip markdown headings
      .replace(/\*\*/g, '')          // strip bold markers
      .replace(/\n+/g, ' ')         // collapse newlines
      .trim();
    if (!header) header = 'Command suggestion';
    // Cap header at ~80 chars
    if (header.length > 80) header = header.slice(0, 77) + '...';

    cards.push({ header, command: code, description: after });
    lastIndex = afterEnd;
  }

  return cards;
}

/**
 * Detect placeholders like {host_or_ip} or <filename> in a command
 * and prompt the user to fill each one. Returns the resolved command.
 */
async function resolvePlaceholders(rl, command) {
  // Match {placeholder} and <placeholder> patterns
  const placeholderRegex = /[{<]([^}>]+)[}>]/g;
  const matches = [...command.matchAll(placeholderRegex)];
  if (matches.length === 0) return command;

  let resolved = command;
  const seen = new Set();
  for (const m of matches) {
    const full = m[0];          // e.g. {host_or_ip}
    const name = m[1].trim();   // e.g. host_or_ip
    if (seen.has(full)) continue;
    seen.add(full);

    const label = name.replace(/_/g, ' ');
    const value = await question(rl, colors.cyan(`  Enter ${label}: `));
    if (!value.trim()) {
      printWarning(`Skipped — no value for ${name}`);
      return null; // abort
    }
    // Replace ALL occurrences of this placeholder
    resolved = resolved.split(full).join(value.trim());
  }
  return resolved;
}

/**
 * Render response with command cards and interactive actions.
 * Returns true if commands were found and rendered, false otherwise.
 */
async function renderWithCommandCards(rl, response) {
  const cards = parseCommandResponse(response);
  if (cards.length === 0) return false;

  for (const card of cards) {
    printCommandCard(card.header, card.command, card.description);
    printCommandActions();
    console.log('');

    const answer = await question(rl, colors.dim('  Action › '));
    const choice = answer.trim().toLowerCase();

    if (choice === 'r' || choice === 'run' || choice === '') {
      // Default = Run — resolve placeholders first
      const resolved = await resolvePlaceholders(rl, card.command);
      if (resolved) await executeCommandInteractive(resolved);
    } else if (choice === 'e' || choice === 'edit') {
      // Edit — let user modify the command before running
      const edited = await questionPrefilled(rl, colors.cyan('  Edit command › '), card.command);
      const trimmedEdit = edited.trim();
      if (trimmedEdit) {
        const resolved = await resolvePlaceholders(rl, trimmedEdit);
        if (resolved) await executeCommandInteractive(resolved);
      } else {
        printWarning('Empty command — skipped.');
      }
    } else if (choice === 'i' || choice === 'insert' || choice === 'copy' || choice === 'c') {
      // Insert = Copy to clipboard (resolve placeholders first)
      const resolved = await resolvePlaceholders(rl, card.command);
      if (!resolved) continue;
      try {
        if (process.platform === 'win32') {
          execSync('clip', { input: resolved, encoding: 'utf-8' });
        } else if (process.platform === 'darwin') {
          execSync('pbcopy', { input: resolved, encoding: 'utf-8' });
        } else {
          execSync('xclip -selection clipboard', { input: resolved, encoding: 'utf-8' });
        }
        printSuccess('Copied to clipboard.');
      } catch {
        printWarning('Could not copy to clipboard.');
      }
    }
    // 'close' / anything else = skip
  }
  return true;
}

/**
 * Execute a command in the user's shell and print output.
 */
async function executeCommandInteractive(command) {
  try {
    printInfo('Running...');
    const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: 120000,
      cwd: process.cwd(),
      shell,
      maxBuffer: 1024 * 1024 * 10,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (output.trim()) {
      console.log('');
      console.log(colors.dim(output.trimEnd()));
    }
    printSuccess('Done.');
    trackEvent('command', `Ran: ${command.slice(0, 60)}`, output.trim().slice(0, 100));
  } catch (err) {
    const stderr = err.stderr ? err.stderr.trim() : '';
    const stdout = err.stdout ? err.stdout.trim() : '';
    if (stdout) console.log(colors.dim(stdout));
    printError(stderr || err.message);
    // Track error for /quickfix
    lastCommandError = {
      command,
      error: err.message,
      stderr: stderr || err.message,
      stdout: stdout || '',
      timestamp: Date.now(),
    };
    trackEvent('error', `Failed: ${command.slice(0, 60)}`, stderr.slice(0, 100));
  }
}

// ─── First-run setup: auto-detect missing API key & prompt ───
// With built-in dev key, this is only needed if the dev key is also missing.
async function ensureApiKey(rl) {
  if (getApiKey()) return true;

  // This should rarely trigger since the dev key is embedded,
  // but handles the case if someone removes it.
  console.log('');
  console.log(colors.brand.bold('  🔑 First-Time Setup'));
  printDivider();
  console.log(colors.accent('  Vinsa needs a free Groq API key to work.'));
  console.log('');
  console.log('  1. Go to: ' + colors.bold('https://console.groq.com/keys'));
  console.log('  2. Sign up (free — no credit card)');
  console.log('  3. Create an API key and paste it below');
  console.log('');

  let attempts = 0;
  while (attempts < 3) {
    const key = (await question(rl, colors.accent('  Paste API key: '))).trim();

    if (!key) {
      printWarning('No key entered. Vinsa cannot work without an API key.');
      attempts++;
      continue;
    }

    if (key.startsWith('gsk_') && key.length > 20) {
      setApiKey(key);
      printSuccess('API key saved! You\'re all set.');
      console.log('');
      return true;
    }

    // Accept any non-empty key (might be valid even without gsk_ prefix)
    printWarning('Key doesn\'t look like a Groq key (usually starts with gsk_). Saving anyway...');
    setApiKey(key);
    printSuccess('API key saved.');
    console.log('');
    return true;
  }

  printError('Setup cancelled. Run "vinsa config set-key YOUR_KEY" later.');
  return false;
}

/**
 * Prompt user for their own API key when the built-in dev key is exhausted.
 * Returns true if a valid key was provided and saved.
 */
async function promptUserKeyOnExhaustion(rl) {
  console.log('');
  console.log(colors.brand.bold('  ⚡ Rate Limit Reached'));
  printDivider();
  console.log(colors.accent('  The built-in API key has hit its limit across all models.'));
  console.log(colors.accent('  To continue, please provide your own free Groq API key.'));
  console.log('');
  console.log('  1. Go to: ' + colors.bold('https://console.groq.com/keys'));
  console.log('  2. Sign up (free — no credit card)');
  console.log('  3. Create an API key and paste it below');
  console.log('');

  const key = (await question(rl, colors.accent('  Paste your API key (or press Enter to skip): '))).trim();

  if (!key) {
    printWarning('No key entered. Wait ~60 seconds for the built-in key to recover.');
    return false;
  }

  setApiKey(key);
  printSuccess('Your API key saved! Retrying with your key...');
  console.log('');
  return true;
}

// ════════════════════════════════════════════════════════════
// MAIN ENTRY — startChat()
// ════════════════════════════════════════════════════════════
export async function startChat({ continueSession = false } = {}) {
  // ─── Create readline FIRST (needed for setup wizard too) ───
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    completer,
    historySize: 200,
  });

  // Keep the process alive no matter what
  process.on('uncaughtException', (err) => {
    printError(`Unexpected error: ${err.message}`);
    // Don't exit — stay in the REPL
  });

  // ─── Banner ───
  printBanner();
  printDivider();

  // ─── Auto-setup: ensure API key exists ───
  const hasKey = await ensureApiKey(rl);
  if (!hasKey) {
    rl.close();
    process.exit(1);
  }

  // ─── Initialize agent ───
  const agent = getAgent();
  const mcpManager = getMcpManager();

  try {
    agent.initialize();
  } catch (err) {
    printError(err.message);
    rl.close();
    process.exit(1);
  }

  // ─── Wire interactive confirm for diff preview ───
  setInteractiveConfirm(async (diffText) => {
    console.log(colors.brand.bold('\n  📝 File Write Preview'));
    console.log(diffText);
    const answer = await question(rl, colors.accent('\n  Apply this change? (y/n): '));
    return answer.trim().toLowerCase().startsWith('y');
  });

  // ─── Load plugins ───
  await agent.initializePlugins({ silent: true });

  // ─── Auto-setup MCP servers on first run ───
  await autoSetupDefaultServers();

  // ─── Resume last session if --continue ───
  if (continueSession) {
    const lastSession = getLastSession();
    if (lastSession.length > 0) {
      agent.setConversationHistory(lastSession);
      printSuccess(`Resumed last session (${lastSession.length} messages)`);
    } else {
      printInfo('No previous session to resume. Starting fresh.');
    }
  }

  // ─── Connect MCP servers ───
  let mcpToolCount = 0;
  try {
    const mcpResults = await mcpManager.connectAll();
    const connected = mcpResults.filter(r => r.status === 'connected');
    if (connected.length > 0) {
      const mcpToolDefs = mcpManager.getToolDefinitions();
      if (mcpToolDefs.length > 0) {
        agent.addMcpTools(mcpToolDefs, mcpManager);
        mcpToolCount = mcpToolDefs.length;
      }
    }
  } catch {
    // MCP is optional — failures don't break anything
  }

  // ─── System info line ───
  const platform = `${os.type()} ${os.release()} (${os.arch()})`;
  const modelLabel = MODEL_POOL.find(m => m.id === getModel())?.label || getModel();
  const toolCount = agent.groqTools?.length || 10;
  const mcpCount = mcpToolCount;

  printSuccess('Vinsa is ready');
  console.log(colors.dim(`  OS: ${platform}`));
  console.log(colors.dim(`  Model: ${modelLabel} (+ ${MODEL_POOL.length - 1} fallbacks)`));
  const pluginCount = getPluginTools().length;
  console.log(colors.dim(`  Tools: ${toolCount} built-in${mcpCount ? ` + ${mcpCount} MCP` : ''}${pluginCount ? ` + ${pluginCount} plugins` : ''}`));
  if (getConfirmWrites()) console.log(colors.dim('  Diff preview: ON'));
  printDivider();
  console.log(colors.dim('  Just type your question. Use /help for commands.\n'));

  // ─── Handle Ctrl+C gracefully ───
  let ctrlCCount = 0;
  rl.on('SIGINT', () => {
    ctrlCCount++;
    if (ctrlCCount >= 2) {
      console.log('');
      printInfo('Vinsa signing off. Goodbye! 👋');
      rl.close();
      process.exit(0);
    }
    console.log(colors.dim('\n  (Press Ctrl+C again to quit, or type /exit)\n'));
  });

  // ════════════════════════════════════════════════════
  // MAIN REPL LOOP — runs forever until /exit
  // ════════════════════════════════════════════════════
  let running = true;

  while (running) {
    ctrlCCount = 0; // reset Ctrl+C counter each prompt

    let input;
    try {
      input = await question(rl, printPrompt());
    } catch {
      // stdin closed unexpectedly — exit cleanly
      break;
    }

    const trimmed = (input || '').trim();

    // Empty line — just re-prompt
    if (!trimmed) continue;

    // ─── Slash Commands ───
    if (trimmed.startsWith('/')) {
      const cmd = trimmed.toLowerCase();
      if (cmd === '/exit' || cmd === '/quit') {
        running = false;
        break;
      }
      await handleSlashCommand(trimmed, agent, mcpManager, rl);
      continue;
    }

    // ─── Teach Command Resolution ───
    const teachResolved = resolveTeachCommand(trimmed);
    if (teachResolved) {
      printInfo(`  Teach → ${teachResolved}`);
      trackEvent('teach', `Resolved: ${trimmed.split(' ')[0]}`, teachResolved.slice(0, 80));
      await executeCommandInteractive(teachResolved);
      continue;
    }

    // ─── Alias Resolution ───
    let finalInput = trimmed;
    const aliasResolved = resolveAlias(trimmed);
    if (aliasResolved) {
      finalInput = aliasResolved;
      printInfo(`  Alias → ${finalInput}`);
    }

    // Track user query
    trackEvent('query', trimmed.slice(0, 80));

    // ─── AI Chat ───
    const spinner = createSpinner('Vinsa is thinking...');
    spinner.start();

    try {
      const response = await agent.run(finalInput, {
        onToolCall: (name, args) => {
          spinner.stop();
          printToolCall(name, args);
          trackEvent('tool', `Used ${name}`, JSON.stringify(args).slice(0, 80));
          spinner.start();
          spinner.text = colors.accent(`Running ${name}...`);
        },
        onToolResult: (result) => {
          spinner.stop();
          printToolResult(result);
          spinner.start();
          spinner.text = colors.accent('Vinsa is thinking...');
        },
        onRetry: (attempt, max, reason) => {
          spinner.stop();
          printRetry(attempt, max, reason);
          spinner.start();
        },
        onModelSwitch: (from, to, msg) => {
          spinner.stop();
          printInfo(`  ↻ ${msg}`);
          spinner.start();
          spinner.text = colors.accent('Retrying with new model...');
        },
      });

      spinner.stop();
      process.stdout.write('\u001B[?25h'); // Ensure cursor visible

      // ─── Render: command card or normal response ───
      const hasCards = await renderWithCommandCards(rl, response);
      if (!hasCards) {
        printResponse(response);
      }
      lastResponse = response; // Track for /copy
      trackEvent('response', 'AI responded', (response || '').slice(0, 80));

      // Save to persistent history
      addToHistory({ role: 'user', content: trimmed.slice(0, 200) });
      addToHistory({ role: 'assistant', content: (response || '').slice(0, 200) });

    } catch (err) {
      spinner.stop();
      // Restore cursor visibility (ora can hide it on Windows)
      process.stdout.write('\u001B[?25h');

      if (err.message.includes('DEV_KEY_EXHAUSTED')) {
        // Built-in key exhausted across all models — ask user for their own key
        const gotKey = await promptUserKeyOnExhaustion(rl);
        if (gotKey) {
          // Reinitialize agent with the user's key and auto-retry
          agent.reinitializeWithKey(getApiKey());
          printInfo('Retrying your last question...');
          // Replay the last user message
          const retrySpinner = createSpinner('Vinsa is thinking...');
          retrySpinner.start();
          try {
            // Remove the last user message agent stored (it will be re-added by run())
            const hist = agent.getConversationHistory();
            if (hist.length > 0 && hist[hist.length - 1].role === 'user') {
              hist.pop();
              agent.setConversationHistory(hist);
            }
            const retryResponse = await agent.run(finalInput, {
              onToolCall: (name, args) => { retrySpinner.stop(); printToolCall(name, args); retrySpinner.start(); },
              onToolResult: (result) => { retrySpinner.stop(); printToolResult(result); retrySpinner.start(); },
              onRetry: (attempt, max, reason) => { retrySpinner.stop(); printRetry(attempt, max, reason); retrySpinner.start(); },
              onModelSwitch: (from, to, msg) => { retrySpinner.stop(); printInfo(`  ↻ ${msg}`); retrySpinner.start(); },
            });
            retrySpinner.stop();
            const retryHasCards = await renderWithCommandCards(rl, retryResponse);
            if (!retryHasCards) printResponse(retryResponse);
            lastResponse = retryResponse;

            addToHistory({ role: 'user', content: trimmed.slice(0, 200) });
            addToHistory({ role: 'assistant', content: (retryResponse || '').slice(0, 200) });
          } catch (retryErr) {
            retrySpinner.stop();
            printError(retryErr.message);
          }
        }
      } else if (err.message.includes('API key') || err.message.includes('401') || err.message.includes('invalid_api_key')) {
        printError('API key is invalid or expired.');
        printInfo('Let\'s fix it — paste a new key:');
        const newKey = (await question(rl, colors.accent('  New API key: '))).trim();
        if (newKey) {
          setApiKey(newKey);
          agent.reinitializeWithKey(newKey);
          printSuccess('Key updated! Try your question again.');
        }
      } else if (err.message.includes('All models exhausted')) {
        printWarning('All AI models are temporarily rate limited.');
        printInfo('Wait ~60 seconds and try again. Your session is preserved.');
      } else {
        printError(err.message);
      }
    }

    console.log('');
  }

  // ─── Clean exit ───
  console.log('');
  // Auto-save session for --continue
  const history = agent.getConversationHistory();
  if (history.length > 0) {
    saveLastSession(history);
  }
  printInfo('Vinsa signing off. Goodbye! 👋');
  rl.close();
  await mcpManager.disconnectAll();
  process.exit(0);
}

// ════════════════════════════════════════════════════════════
// SLASH COMMAND HANDLER
// ════════════════════════════════════════════════════════════
async function handleSlashCommand(cmd, agent, mcpManager, rl) {
  const parts = cmd.split(' ');
  const command = parts[0];
  const arg = parts.slice(1).join(' ').trim();

  switch (command.toLowerCase()) {
    case '/help':
      console.log('');
      console.log(colors.brand.bold('  Vinsa Commands'));
      printDivider();
      for (const [cmd, desc] of Object.entries(SLASH_COMMANDS)) {
        console.log(`  ${colors.accent(cmd.padEnd(14))} ${desc}`);
      }
      console.log('');
      console.log(colors.dim('  Or just type any question in plain English!'));
      printDivider();
      break;

    case '/clear':
      agent.clearHistory();
      printSuccess('Conversation cleared — fresh start!');
      break;

    case '/tools': {
      console.log('');
      console.log(colors.brand.bold('  Built-in Tools'));
      printDivider();
      const { toolDefinitions } = await import('./tools.js');
      for (const tool of toolDefinitions) {
        console.log(`  ${colors.tool(tool.name.padEnd(25))} ${colors.dim(tool.description.slice(0, 70))}`);
      }
      const mcpTools = mcpManager.getToolDefinitions();
      if (mcpTools.length > 0) {
        console.log('');
        console.log(colors.brand.bold('  MCP Tools'));
        printDivider();
        for (const tool of mcpTools) {
          console.log(`  ${colors.tool(tool.name.padEnd(30))} ${colors.dim((tool.description || '').slice(0, 60))}`);
        }
      }
      printDivider();
      break;
    }

    case '/models': {
      const models = agent.getModelStatus();
      console.log('');
      console.log(colors.brand.bold('  Model Rotation Pool'));
      printDivider();
      if (models.length === 0) {
        console.log(colors.dim('  Agent not initialized yet.'));
      } else {
        for (const m of models) {
          const icon = m.status === 'available' ? colors.success('●') : colors.error('○');
          const recovers = m.status === 'cooldown' ? colors.dim(` (recovers in ${m.recoversIn})`) : '';
          console.log(`  ${icon} ${colors.accent(m.label.padEnd(24))} ${m.status}${recovers}`);
        }
      }
      console.log('');
      console.log(colors.dim('  Auto-switches on rate limit — zero downtime.'));
      printDivider();
      break;
    }

    case '/mcp': {
      const status = mcpManager.getStatus();
      const { MCP_PRESETS } = await import('./mcp.js');
      console.log('');
      console.log(colors.brand.bold('  Connected MCP Servers'));
      printDivider();
      const entries = Object.entries(status);
      if (entries.length === 0) {
        console.log(colors.dim('  No MCP servers connected.'));
      } else {
        for (const [name, info] of entries) {
          console.log(`  ${colors.success('●')} ${colors.accent(name.padEnd(24))} ${info.toolCount} tools`);
        }
      }

      // Show available presets not yet installed
      const installed = Object.keys(status);
      const available = Object.entries(MCP_PRESETS).filter(([key]) => !installed.includes(key));
      if (available.length > 0) {
        console.log('');
        console.log(colors.brand.bold('  Available Presets'));
        printDivider();
        for (const [key, preset] of available) {
          const keyInfo = preset.needsKey ? colors.dim(` [needs ${preset.keyName}]`) : colors.success(' [free]');
          console.log(`  ${colors.dim('○')} ${colors.accent(key.padEnd(24))} ${preset.description}${keyInfo}`);
        }
        console.log('');
        console.log(colors.dim('  Add: vinsa mcp add <name>  |  e.g. vinsa mcp add playwright'));
      }
      printDivider();
      break;
    }

    case '/system': {
      const spinner = createSpinner('Gathering system info...');
      spinner.start();
      try {
        const { executeTool } = await import('./tools.js');
        const info = await executeTool('get_system_info', { category: 'overview' });
        spinner.stop();
        if (info.success) {
          console.log('');
          console.log(colors.brand.bold('  System Information'));
          printDivider();
          for (const [key, value] of Object.entries(info.data)) {
            console.log(`  ${colors.accent(key.padEnd(15))} ${value}`);
          }
          printDivider();
        }
      } catch (err) {
        spinner.stop();
        printError(err.message);
      }
      break;
    }

    case '/config': {
      const cfg = showConfig();
      console.log('');
      console.log(colors.brand.bold('  Configuration'));
      printDivider();
      for (const [key, value] of Object.entries(cfg)) {
        const display = Array.isArray(value) ? value.join(', ') || '(none)' : value;
        console.log(`  ${colors.accent(key.padEnd(15))} ${display}`);
      }
      printDivider();
      break;
    }

    case '/history': {
      const len = agent.getHistoryLength();
      console.log(colors.dim(`  Conversation: ${len} messages in current session`));
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW: /stats — Token usage & session statistics
    // ═══════════════════════════════════════════════
    case '/stats': {
      const stats = agent.getStats();
      console.log('');
      console.log(colors.brand.bold('  Session Statistics'));
      printDivider();
      console.log(`  ${colors.accent('Duration'.padEnd(20))} ${stats.sessionDuration}`);
      console.log(`  ${colors.accent('Messages'.padEnd(20))} ${stats.conversationLength}`);
      console.log(`  ${colors.accent('API Requests'.padEnd(20))} ${stats.requests}`);
      console.log(`  ${colors.accent('Prompt Tokens'.padEnd(20))} ${stats.promptTokens.toLocaleString()}`);
      console.log(`  ${colors.accent('Completion Tokens'.padEnd(20))} ${stats.completionTokens.toLocaleString()}`);
      console.log(`  ${colors.accent('Total Tokens'.padEnd(20))} ${stats.totalTokens.toLocaleString()}`);
      const changesCount = getFileChangeStack().length;
      console.log(`  ${colors.accent('File Changes'.padEnd(20))} ${changesCount} (undoable)`);
      printDivider();
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW: /compact — Compress conversation
    // ═══════════════════════════════════════════════
    case '/compact': {
      const spinner = createSpinner('Compressing conversation...');
      spinner.start();
      try {
        const result = await agent.compressHistory();
        spinner.stop();
        printSuccess(result);
      } catch (err) {
        spinner.stop();
        printError(err.message);
      }
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW: /save [name] — Save current session
    // ═══════════════════════════════════════════════
    case '/save': {
      const sessionName = arg || `session-${Date.now()}`;
      const history = agent.getConversationHistory();
      if (history.length === 0) {
        printWarning('Nothing to save — conversation is empty.');
        break;
      }
      saveSession(sessionName, history);
      printSuccess(`Session saved as "${sessionName}" (${history.length} messages)`);
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW: /load <name> — Load a saved session
    // ═══════════════════════════════════════════════
    case '/load': {
      if (!arg) {
        printWarning('Usage: /load <session-name>');
        printInfo('Use /list to see saved sessions.');
        break;
      }
      const session = loadSession(arg);
      if (!session) {
        printError(`Session "${arg}" not found.`);
        printInfo('Use /list to see saved sessions.');
        break;
      }
      agent.setConversationHistory(session.history);
      printSuccess(`Loaded session "${arg}" (${session.messageCount} messages, saved ${new Date(session.savedAt).toLocaleString()})`);
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW: /list — List saved sessions
    // ═══════════════════════════════════════════════
    case '/list': {
      const sessions = listSessions();
      const names = Object.keys(sessions);
      console.log('');
      console.log(colors.brand.bold('  Saved Sessions'));
      printDivider();
      if (names.length === 0) {
        console.log(colors.dim('  No saved sessions. Use /save [name] to save one.'));
      } else {
        for (const name of names) {
          const s = sessions[name];
          const date = new Date(s.savedAt).toLocaleString();
          console.log(`  ${colors.accent(name.padEnd(25))} ${s.messageCount} msgs  ${colors.dim(date)}`);
        }
      }
      printDivider();
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW: /copy — Copy last response to clipboard
    // ═══════════════════════════════════════════════
    case '/copy': {
      if (!lastResponse) {
        printWarning('No response to copy yet.');
        break;
      }
      try {
        if (process.platform === 'win32') {
          execSync('clip', { input: lastResponse, encoding: 'utf-8' });
        } else if (process.platform === 'darwin') {
          execSync('pbcopy', { input: lastResponse, encoding: 'utf-8' });
        } else {
          execSync('xclip -selection clipboard', { input: lastResponse, encoding: 'utf-8' });
        }
        printSuccess('Last response copied to clipboard!');
      } catch {
        printWarning('Could not copy to clipboard. Response length: ' + lastResponse.length + ' chars.');
      }
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW: /commit — AI-powered git commit
    // ═══════════════════════════════════════════════
    case '/commit': {
      const spinner = createSpinner('Analyzing changes...');
      spinner.start();
      try {
        // Check if we're in a git repo
        let diff;
        try {
          diff = execSync('git diff --staged', { encoding: 'utf-8', timeout: 10000 }).trim();
          if (!diff) {
            diff = execSync('git diff', { encoding: 'utf-8', timeout: 10000 }).trim();
            if (!diff) {
              spinner.stop();
              printWarning('No changes detected. Stage files with `git add` first.');
              break;
            }
            spinner.stop();
            printInfo('No staged changes found. Showing unstaged diff:');
            spinner.start();
          }
        } catch {
          spinner.stop();
          printError('Not a git repository or git is not installed.');
          break;
        }

        // Ask AI to generate commit message
        const truncatedDiff = diff.length > 4000 ? diff.slice(0, 4000) + '\n... (diff truncated)' : diff;
        const commitPrompt = `Generate a concise, conventional commit message for these changes. Use the format: type(scope): description\n\nTypes: feat, fix, docs, style, refactor, perf, test, chore\n\nDiff:\n\`\`\`\n${truncatedDiff}\n\`\`\`\n\nRespond with ONLY the commit message, nothing else. One line, max 72 characters.`;

        const response = await agent.run(commitPrompt, {});
        spinner.stop();

        const commitMsg = response.trim().replace(/^["']|["']$/g, '').split('\n')[0];
        console.log('');
        console.log(colors.brand.bold('  Suggested Commit Message'));
        printDivider();
        console.log(`  ${colors.accent(commitMsg)}`);
        printDivider();

        // Stage all changes if nothing was staged
        const staged = execSync('git diff --staged --name-only', { encoding: 'utf-8' }).trim();
        if (!staged) {
          execSync('git add -A', { encoding: 'utf-8' });
          printInfo('All changes staged with `git add -A`');
        }

        // Commit
        try {
          execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' });
          printSuccess(`Committed: ${commitMsg}`);
        } catch (err) {
          printError(`Commit failed: ${err.message}`);
        }
      } catch (err) {
        spinner.stop();
        printError(err.message);
      }
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW: /diff — Show git diff
    // ═══════════════════════════════════════════════
    case '/diff': {
      try {
        let diff = execSync('git diff --staged', { encoding: 'utf-8', timeout: 10000 }).trim();
        let label = 'Staged Changes';
        if (!diff) {
          diff = execSync('git diff', { encoding: 'utf-8', timeout: 10000 }).trim();
          label = 'Unstaged Changes';
        }
        if (!diff) {
          printInfo('No changes detected in this git repository.');
          break;
        }
        console.log('');
        console.log(colors.brand.bold(`  ${label}`));
        printDivider();
        // Colorize diff output
        const lines = diff.split('\n');
        for (const line of lines.slice(0, 80)) {
          if (line.startsWith('+') && !line.startsWith('+++')) {
            console.log(colors.success(`  ${line}`));
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            console.log(colors.error(`  ${line}`));
          } else if (line.startsWith('@@')) {
            console.log(colors.accent(`  ${line}`));
          } else {
            console.log(colors.dim(`  ${line}`));
          }
        }
        if (lines.length > 80) {
          console.log(colors.dim(`  ... ${lines.length - 80} more lines`));
        }
        printDivider();
      } catch {
        printError('Not a git repository or git is not installed.');
      }
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW: /undo — Undo last file change
    // ═══════════════════════════════════════════════
    case '/undo': {
      const result = undoLastChange();
      if (result.success) {
        printSuccess(result.message);
      } else {
        printWarning(result.error);
      }
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW: /doctor — Self-diagnostics
    // ═══════════════════════════════════════════════
    case '/doctor': {
      console.log('');
      console.log(colors.brand.bold('  Vinsa Doctor — Self-Diagnostic'));
      printDivider();
      let issues = 0;

      // 1. API Key
      const apiKey = getApiKey();
      if (apiKey) {
        console.log(`  ${colors.success('✔')} API key configured (${apiKey.slice(0, 8)}...)`);
      } else {
        console.log(`  ${colors.error('✖')} API key NOT SET`);
        issues++;
      }

      // 2. Node.js version
      const nodeVer = process.version;
      const major = parseInt(nodeVer.slice(1));
      if (major >= 18) {
        console.log(`  ${colors.success('✔')} Node.js ${nodeVer}`);
      } else {
        console.log(`  ${colors.error('✖')} Node.js ${nodeVer} — requires v18+`);
        issues++;
      }

      // 3. Git
      try {
        const gitVer = execSync('git --version', { encoding: 'utf-8' }).trim();
        console.log(`  ${colors.success('✔')} ${gitVer}`);
      } catch {
        console.log(`  ${colors.warning('⚠')} Git not found (optional, needed for /commit /diff)`);
      }

      // 4. MCP servers
      const mcpStatus = mcpManager.getStatus();
      const mcpEntries = Object.entries(mcpStatus);
      if (mcpEntries.length > 0) {
        console.log(`  ${colors.success('✔')} ${mcpEntries.length} MCP server(s) connected`);
      } else {
        console.log(`  ${colors.warning('⚠')} No MCP servers connected`);
      }

      // 5. Model availability
      const models = agent.getModelStatus();
      const available = models.filter(m => m.status === 'available');
      if (available.length > 0) {
        console.log(`  ${colors.success('✔')} ${available.length}/${models.length} models available`);
      } else {
        console.log(`  ${colors.error('✖')} All models on cooldown!`);
        issues++;
      }

      // 6. Disk space check
      try {
        const si = await import('systeminformation');
        const disks = await si.default.fsSize();
        const mainDisk = disks[0];
        if (mainDisk) {
          const freeGB = (mainDisk.available / (1024 * 1024 * 1024)).toFixed(1);
          if (parseFloat(freeGB) < 1) {
            console.log(`  ${colors.error('✖')} Low disk space: ${freeGB} GB free`);
            issues++;
          } else {
            console.log(`  ${colors.success('✔')} Disk space: ${freeGB} GB free`);
          }
        }
      } catch { /* skip */ }

      // 7. Network connectivity
      try {
        const response = await fetch('https://api.groq.com', { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        console.log(`  ${colors.success('✔')} Groq API reachable`);
      } catch {
        console.log(`  ${colors.error('✖')} Cannot reach Groq API`);
        issues++;
      }

      // 8. Plan mode
      const planStatus = getPlanMode();
      console.log(`  ${colors.accent('ℹ')} Plan mode: ${planStatus ? 'ON' : 'off'}`);

      printDivider();
      if (issues === 0) {
        printSuccess('All checks passed! Vinsa is healthy.');
      } else {
        printWarning(`${issues} issue(s) detected.`);
      }
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW: /plan — Toggle plan mode
    // ═══════════════════════════════════════════════
    case '/plan': {
      const current = getPlanMode();
      setPlanMode(!current);
      if (!current) {
        printSuccess('Plan mode ON — Vinsa will think through a plan before acting.');
        printInfo('The AI will outline its approach before making changes.');
      } else {
        printSuccess('Plan mode OFF — Vinsa will act directly.');
      }
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW v3: /export [format] — Export conversation
    // ═══════════════════════════════════════════════
    case '/export': {
      const history = agent.getConversationHistory();
      if (history.length === 0) {
        printWarning('Nothing to export — conversation is empty.');
        break;
      }
      const format = (arg || 'md').toLowerCase();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      let filename, content;

      if (format === 'json') {
        filename = `vinsa-export-${timestamp}.json`;
        content = JSON.stringify(history, null, 2);
      } else if (format === 'html') {
        filename = `vinsa-export-${timestamp}.html`;
        const body = history.map(m => {
          const cls = m.role === 'user' ? 'user' : 'assistant';
          const label = m.role === 'user' ? '🧑 You' : '🤖 Vinsa';
          return `<div class="${cls}"><strong>${label}</strong><p>${(m.content || '').replace(/\n/g, '<br>')}</p></div>`;
        }).join('\n');
        content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Vinsa Export</title><style>body{font-family:system-ui;max-width:800px;margin:2rem auto;padding:1rem}.user{background:#f0f0f0;padding:1rem;border-radius:8px;margin:0.5rem 0}.assistant{background:#eef;padding:1rem;border-radius:8px;margin:0.5rem 0}</style></head><body><h1>Vinsa Conversation Export</h1>${body}</body></html>`;
      } else {
        // Default: markdown
        filename = `vinsa-export-${timestamp}.md`;
        content = `# Vinsa Conversation Export\n_${new Date().toLocaleString()}_\n\n` +
          history.map(m => {
            const label = m.role === 'user' ? '## 🧑 You' : '## 🤖 Vinsa';
            return `${label}\n\n${m.content || '(empty)'}\n`;
          }).join('\n---\n\n');
      }

      try {
        fs.writeFileSync(filename, content, 'utf-8');
        printSuccess(`Exported ${history.length} messages → ${filename}`);
      } catch (err) {
        printError(`Export failed: ${err.message}`);
      }
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW v3: /alias — Custom command aliases
    // ═══════════════════════════════════════════════
    case '/alias': {
      if (!arg || arg === 'list') {
        // List all aliases
        const aliases = getAliases();
        const names = Object.keys(aliases);
        console.log('');
        console.log(colors.brand.bold('  Custom Aliases'));
        printDivider();
        if (names.length === 0) {
          console.log(colors.dim('  No aliases defined.'));
          console.log(colors.dim('  Create: /alias name = prompt template'));
          console.log(colors.dim('  Use $* for all args, $1 $2 for positional.'));
        } else {
          for (const name of names) {
            console.log(`  ${colors.accent(name.padEnd(15))} → ${aliases[name]}`);
          }
        }
        printDivider();
      } else if (arg.startsWith('remove ')) {
        const name = arg.slice(7).trim();
        removeAlias(name);
        printSuccess(`Alias "${name}" removed.`);
      } else if (arg.includes('=')) {
        const eqIdx = arg.indexOf('=');
        const name = arg.slice(0, eqIdx).trim();
        const template = arg.slice(eqIdx + 1).trim();
        if (!name || !template) {
          printWarning('Usage: /alias name = prompt template with $* or $1 $2');
          break;
        }
        setAlias(name, template);
        printSuccess(`Alias "${name}" → "${template}"`);
      } else {
        printInfo('Usage: /alias name = template | /alias list | /alias remove name');
      }
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW v3: /recall <keyword> — Search past history
    // ═══════════════════════════════════════════════
    case '/recall': {
      if (!arg) {
        printWarning('Usage: /recall <keyword>');
        break;
      }
      const history = getHistory();
      const keyword = arg.toLowerCase();
      const matches = history.filter(h =>
        (h.content || '').toLowerCase().includes(keyword)
      );
      console.log('');
      console.log(colors.brand.bold(`  History Search: "${arg}"`));
      printDivider();
      if (matches.length === 0) {
        console.log(colors.dim('  No matches found.'));
      } else {
        for (const m of matches.slice(-20)) {
          const icon = m.role === 'user' ? '🧑' : '🤖';
          const date = m.timestamp ? new Date(m.timestamp).toLocaleString() : '';
          const snippet = (m.content || '').slice(0, 100).replace(/\n/g, ' ');
          console.log(`  ${icon} ${colors.dim(date)} ${snippet}`);
        }
        console.log(colors.dim(`  ${matches.length} match(es) found`));
      }
      printDivider();
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW v3: /voice — Voice input via Groq Whisper
    // ═══════════════════════════════════════════════
    case '/voice': {
      printInfo('Voice mode: Recording is platform-specific.');
      printInfo('Recording 5 seconds of audio...');
      try {
        const tmpFile = path.join(os.tmpdir(), `vinsa-voice-${Date.now()}.wav`);
        // Platform-specific recording
        if (process.platform === 'win32') {
          // Use PowerShell to record microphone
          const psScript = `
            Add-Type -AssemblyName System.Speech
            $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine
            $rec.SetInputToDefaultAudioDevice()
            $rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
            $result = $rec.Recognize((New-Object TimeSpan(0,0,8)))
            if ($result) { $result.Text } else { "ERROR:No speech detected" }
          `;
          const result = execSync(`powershell -Command "${psScript.replace(/\n/g, '; ')}"`, { encoding: 'utf-8', timeout: 15000 }).trim();
          if (result.startsWith('ERROR:')) {
            printWarning(result.slice(6));
          } else {
            printSuccess(`Transcribed: "${result}"`);
            printInfo('Sending to Vinsa...');
            // Feed to agent
            const spinner = createSpinner('Vinsa is thinking...');
            spinner.start();
            const response = await agent.run(result, {
              onToolCall: (name, args) => { spinner.stop(); printToolCall(name, args); spinner.start(); },
              onToolResult: (r) => { spinner.stop(); printToolResult(r); spinner.start(); },
            });
            spinner.stop();
            const voiceHasCards1 = await renderWithCommandCards(rl, response);
            if (!voiceHasCards1) printResponse(response);
            lastResponse = response;
          }
        } else {
          // Linux/macOS: try sox (rec command)
          try {
            execSync(`rec ${tmpFile} trim 0 5`, { timeout: 10000, stdio: 'pipe' });
            // Use Groq's Whisper API for transcription
            const groqSdk = await import('groq-sdk');
            const groq = new groqSdk.default({ apiKey: getApiKey() });
            const transcription = await groq.audio.transcriptions.create({
              file: fs.createReadStream(tmpFile),
              model: 'whisper-large-v3',
            });
            const text = transcription.text;
            printSuccess(`Transcribed: "${text}"`);
            // Feed to agent  
            const spinner = createSpinner('Vinsa is thinking...');
            spinner.start();
            const response = await agent.run(text, {
              onToolCall: (name, args) => { spinner.stop(); printToolCall(name, args); spinner.start(); },
              onToolResult: (r) => { spinner.stop(); printToolResult(r); spinner.start(); },
            });
            spinner.stop();
            const voiceHasCards2 = await renderWithCommandCards(rl, response);
            if (!voiceHasCards2) printResponse(response);
            lastResponse = response;
          } catch (recErr) {
            printWarning('sox (rec) not installed. Install: sudo apt install sox');
            printInfo('Alternative: Type your message or use `vinsa ask "prompt"`');
          } finally {
            try { fs.unlinkSync(tmpFile); } catch {}
          }
        }
      } catch (err) {
        printError(`Voice input failed: ${err.message}`);
        printInfo('Make sure your microphone is available.');
      }
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW v3: /branch [name] — Fork conversation
    // ═══════════════════════════════════════════════
    case '/branch': {
      if (!arg) {
        // List branches
        const branches = getBranches();
        const names = Object.keys(branches);
        const active = getActiveBranch();
        console.log('');
        console.log(colors.brand.bold('  Conversation Branches'));
        printDivider();
        console.log(`  ${colors.success('●')} ${colors.accent('main'.padEnd(20))} (current conversation)`);
        for (const name of names) {
          const b = branches[name];
          const isActive = name === active ? colors.success(' ← active') : '';
          console.log(`  ${colors.dim('○')} ${colors.accent(name.padEnd(20))} ${b.messageCount} msgs${isActive}`);
        }
        printDivider();
        printInfo('Fork: /branch <name>  |  Switch: /switch <name>');
        break;
      }
      // Fork current conversation into a new branch
      const history = agent.getConversationHistory();
      saveBranch(arg, history);
      printSuccess(`Branch "${arg}" created (${history.length} messages forked)`);
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW v3: /switch <name> — Switch conversation branch
    // ═══════════════════════════════════════════════
    case '/switch': {
      if (!arg) {
        printWarning('Usage: /switch <branch-name>');
        printInfo('Use /branch to see available branches.');
        break;
      }
      if (arg === 'main') {
        // Save current branch first
        const currentBranch = getActiveBranch();
        if (currentBranch !== 'main') {
          saveBranch(currentBranch, agent.getConversationHistory());
        }
        // Switch to main (clear history)
        agent.clearHistory();
        setActiveBranch('main');
        printSuccess('Switched to main branch (fresh conversation)');
        break;
      }
      const branch = getBranch(arg);
      if (!branch) {
        printError(`Branch "${arg}" not found.`);
        break;
      }
      // Save current branch
      const currentBranch = getActiveBranch();
      if (currentBranch !== 'main') {
        saveBranch(currentBranch, agent.getConversationHistory());
      } else {
        // Save main as a snapshot
        saveBranch('_main_backup', agent.getConversationHistory());
      }
      // Load the target branch
      agent.setConversationHistory(branch.history);
      setActiveBranch(arg);
      printSuccess(`Switched to branch "${arg}" (${branch.messageCount} messages)`);
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW v3: /hooks — Manage tool hooks
    // ═══════════════════════════════════════════════
    case '/hooks': {
      const subCmd = (parts[1] || 'list').toLowerCase();
      if (subCmd === 'list') {
        const hooks = getHooks();
        console.log('');
        console.log(colors.brand.bold('  Tool Hooks'));
        printDivider();
        console.log(colors.accent('  Pre-Tool Hooks:'));
        if (hooks.preToolUse.length === 0) {
          console.log(colors.dim('    (none)'));
        } else {
          hooks.preToolUse.forEach((h, i) => {
            console.log(`    [${i}] ${colors.accent(h.action)} on /${h.pattern}/ → ${h.message || ''}`);
          });
        }
        console.log(colors.accent('  Post-Tool Hooks:'));
        if (hooks.postToolUse.length === 0) {
          console.log(colors.dim('    (none)'));
        } else {
          hooks.postToolUse.forEach((h, i) => {
            console.log(`    [${i}] ${colors.accent(h.action)} on /${h.pattern}/`);
          });
        }
        printDivider();
        printInfo('Add: /hooks add pre|post <action> <pattern> [message]');
        printInfo('Actions: block, warn, log');
        printInfo('Remove: /hooks remove pre|post <index>');
      } else if (subCmd === 'add') {
        const type = parts[2] === 'post' ? 'postToolUse' : 'preToolUse';
        const action = parts[3] || 'log';
        const pattern = parts[4] || '.*';
        const message = parts.slice(5).join(' ') || '';
        addHook(type, { action, pattern, message });
        printSuccess(`Hook added: ${action} on /${pattern}/ (${type})`);
      } else if (subCmd === 'remove') {
        const type = parts[2] === 'post' ? 'postToolUse' : 'preToolUse';
        const index = parseInt(parts[3]);
        if (isNaN(index)) {
          printWarning('Usage: /hooks remove pre|post <index>');
        } else if (removeHook(type, index)) {
          printSuccess(`Hook removed at index ${index}`);
        } else {
          printError('Invalid hook index.');
        }
      } else if (subCmd === 'clear') {
        clearHooks();
        printSuccess('All hooks cleared.');
      } else {
        printInfo('Usage: /hooks [list|add|remove|clear]');
      }
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW v3: /confirm — Toggle interactive diff preview
    // ═══════════════════════════════════════════════
    case '/confirm': {
      const current = getConfirmWrites();
      setConfirmWrites(!current);
      if (!current) {
        printSuccess('Diff preview ON — Vinsa will show changes before writing files.');
      } else {
        printSuccess('Diff preview OFF — Vinsa will write files directly.');
      }
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW v3: /plugins — List loaded plugins
    // ═══════════════════════════════════════════════
    case '/plugins': {
      const plugins = getPluginTools();
      const files = listPluginFiles();
      console.log('');
      console.log(colors.brand.bold('  Plugins'));
      printDivider();
      console.log(colors.dim(`  Directory: ${getPluginsDir()}`));
      console.log('');
      if (plugins.length === 0) {
        console.log(colors.dim('  No plugins loaded.'));
        console.log(colors.dim('  Drop .js files in the plugins directory to add custom tools.'));
      } else {
        for (const p of plugins) {
          console.log(`  ${colors.success('●')} ${colors.tool(p.name.padEnd(25))} ${colors.dim(p.description.slice(0, 60))}`);
        }
      }
      if (files.length > plugins.length) {
        console.log(colors.dim(`\n  ${files.length - plugins.length} file(s) failed to load.`));
      }
      printDivider();
      printInfo('Reload: plugins are loaded on startup.');
      break;
    }

    // ═══════════════════════════════════════════════
    // NEW v3: /multi <task> — Multi-agent mode
    // ═══════════════════════════════════════════════
    case '/multi': {
      if (!arg) {
        printWarning('Usage: /multi <task description>');
        printInfo('Runs a 3-phase pipeline: Planner → Executor → Reviewer');
        break;
      }
      const spinner = createSpinner('Multi-agent: Planning...');
      spinner.start();
      try {
        const result = await agent.runMultiAgent(arg, {
          onPhase: (phase, msg) => {
            spinner.text = colors.accent(`Multi-agent: ${msg}`);
          },
          onToolCall: (name, args) => {
            spinner.stop();
            printToolCall(name, args);
            spinner.start();
            spinner.text = colors.accent('Multi-agent: Executing...');
          },
          onToolResult: (r) => {
            spinner.stop();
            printToolResult(r);
            spinner.start();
          },
        });
        spinner.stop();
        const multiHasCards = await renderWithCommandCards(rl, result.combined);
        if (!multiHasCards) printResponse(result.combined);
        lastResponse = result.combined;
      } catch (err) {
        spinner.stop();
        printError(`Multi-agent failed: ${err.message}`);
      }
      break;
    }

    // ═══════════════════════════════════════════════
    // GIT SOURCE CONTROL — /git, /status, /log, /stash, /push, /pull, /merge, /tag, /remote, /blame, /fetch, /cherry-pick, /repoinfo
    // ═══════════════════════════════════════════════

    case '/status': {
      const result = gitStatus();
      if (!result.success) { printError(result.error); break; }
      console.log('');
      console.log(colors.brand.bold('  Git Status'));
      printDivider();
      console.log(`  Branch: ${colors.accent(result.branch)}${result.tracking ? colors.dim(` → ${result.tracking}`) : ''}`);
      if (result.ahead || result.behind) {
        console.log(`  ${result.ahead ? colors.success(`↑${result.ahead} ahead`) : ''} ${result.behind ? colors.error(`↓${result.behind} behind`) : ''}`);
      }
      if (result.lastCommit) console.log(`  Last: ${colors.dim(result.lastCommit)}`);
      console.log('');
      if (result.staged.length > 0) {
        console.log(colors.success('  Staged:'));
        result.staged.forEach(f => console.log(colors.success(`    ✔ ${f.status.padEnd(10)} ${f.file}`)));
      }
      if (result.unstaged.length > 0) {
        console.log(colors.error('  Unstaged:'));
        result.unstaged.forEach(f => console.log(colors.error(`    ✖ ${f.status.padEnd(10)} ${f.file}`)));
      }
      if (result.untracked.length > 0) {
        console.log(colors.dim('  Untracked:'));
        result.untracked.forEach(f => console.log(colors.dim(`    ? ${f}`)));
      }
      if (result.conflicts.length > 0) {
        console.log(colors.error.bold('  Conflicts:'));
        result.conflicts.forEach(f => console.log(colors.error(`    ⚡ ${f.file}`)));
      }
      if (result.clean) console.log(colors.success('  ✔ Working tree clean'));
      printDivider();
      break;
    }

    case '/log': {
      const logArgs = {};
      if (arg) {
        const logParts = arg.split(/\s+/);
        for (const p of logParts) {
          if (p === '--graph') logArgs.graph = true;
          else if (p === '--all') logArgs.all = true;
          else if (p === '--oneline') logArgs.oneline = true;
          else if (/^\d+$/.test(p)) logArgs.count = parseInt(p);
          else if (p.startsWith('--author=')) logArgs.author = p.slice(9);
          else if (p.startsWith('--since=')) logArgs.since = p.slice(8);
        }
      }
      const result = gitLog(logArgs);
      if (!result.success) { printError(result.error); break; }
      console.log('');
      console.log(colors.brand.bold('  Git Log'));
      printDivider();
      if (result.log) {
        // Graph/oneline mode
        for (const line of result.log.split('\n').slice(0, 50)) {
          console.log(`  ${line}`);
        }
      } else if (result.commits) {
        for (const c of result.commits) {
          console.log(`  ${colors.accent(c.shortHash)} ${c.message} ${colors.dim(`— ${c.author}, ${c.date}`)}`);
        }
      }
      printDivider();
      break;
    }

    case '/stash': {
      const stashParts = arg ? arg.split(/\s+/) : ['list'];
      const stashAction = stashParts[0];
      const stashMsg = stashParts.slice(1).join(' ');
      const stashArgs = { action: stashAction };
      if (stashMsg && (stashAction === 'save' || stashAction === 'push')) stashArgs.message = stashMsg;
      if (/^\d+$/.test(stashParts[1])) stashArgs.index = parseInt(stashParts[1]);
      const result = gitStash(stashArgs);
      if (!result.success) { printError(result.error); break; }
      if (result.stashes) {
        console.log('');
        console.log(colors.brand.bold('  Git Stash'));
        printDivider();
        if (result.stashes.length === 0) {
          console.log(colors.dim('  No stashes.'));
        } else {
          result.stashes.forEach(s => console.log(`  ${colors.accent(s.ref)} ${s.description}`));
        }
        printDivider();
      } else if (result.diff) {
        console.log('');
        printDivider();
        console.log(result.diff.slice(0, 3000));
        printDivider();
      } else {
        printSuccess(result.message);
      }
      break;
    }

    case '/push': {
      const pushParts = arg ? arg.split(/\s+/) : [];
      const pushRemote = pushParts[0] || 'origin';
      const pushBranch = pushParts[1];
      const pushForce = pushParts.includes('--force') || pushParts.includes('-f');
      const pushUpstream = pushParts.includes('-u') || pushParts.includes('--set-upstream');
      const spinner = createSpinner('Pushing...');
      spinner.start();
      const result = gitPush({ remote: pushRemote, branch: pushBranch, force: pushForce, setUpstream: pushUpstream });
      spinner.stop();
      if (result.success) printSuccess(result.message);
      else printError(result.error);
      break;
    }

    case '/pull': {
      const pullParts = arg ? arg.split(/\s+/) : [];
      const pullRebase = pullParts.includes('--rebase');
      const pullRemote = pullParts.find(p => !p.startsWith('-')) || 'origin';
      const spinner = createSpinner('Pulling...');
      spinner.start();
      const result = gitPull({ remote: pullRemote, rebase: pullRebase });
      spinner.stop();
      if (result.success) printSuccess(result.message);
      else printError(result.error);
      break;
    }

    case '/merge': {
      if (!arg) { printWarning('Usage: /merge <branch> [--squash] [--no-ff] [--abort]'); break; }
      const mergeParts = arg.split(/\s+/);
      const mergeAbort = mergeParts.includes('--abort');
      const mergeSquash = mergeParts.includes('--squash');
      const mergeNoFf = mergeParts.includes('--no-ff');
      const mergeBranch = mergeParts.find(p => !p.startsWith('-'));
      const result = gitMerge({ branch: mergeBranch, squash: mergeSquash, noFf: mergeNoFf, abort: mergeAbort });
      if (result.success) printSuccess(result.message);
      else printError(result.error);
      break;
    }

    case '/tag': {
      const tagParts = arg ? arg.split(/\s+/) : [];
      if (tagParts.length === 0 || tagParts[0] === 'list') {
        const result = gitTag({ action: 'list' });
        if (!result.success) { printError(result.error); break; }
        console.log('');
        console.log(colors.brand.bold('  Git Tags'));
        printDivider();
        if (result.tags.length === 0) {
          console.log(colors.dim('  No tags.'));
        } else {
          result.tags.forEach(t => console.log(`  ${colors.accent(t.name)} ${colors.dim(t.message)}`));
        }
        printDivider();
      } else if (tagParts[0] === 'create') {
        const tagName = tagParts[1];
        const tagMsg = tagParts.slice(2).join(' ');
        if (!tagName) { printWarning('Usage: /tag create <name> [message]'); break; }
        const result = gitTag({ action: 'create', name: tagName, message: tagMsg || undefined });
        if (result.success) printSuccess(result.message);
        else printError(result.error);
      } else if (tagParts[0] === 'delete') {
        const tagName = tagParts[1];
        if (!tagName) { printWarning('Usage: /tag delete <name>'); break; }
        const result = gitTag({ action: 'delete', name: tagName });
        if (result.success) printSuccess(result.message);
        else printError(result.error);
      } else {
        // Treat as create: /tag v1.0.0 message
        const result = gitTag({ action: 'create', name: tagParts[0], message: tagParts.slice(1).join(' ') || undefined });
        if (result.success) printSuccess(result.message);
        else printError(result.error);
      }
      break;
    }

    case '/remote': {
      const remoteParts = arg ? arg.split(/\s+/) : ['list'];
      const remoteAction = remoteParts[0];
      if (remoteAction === 'list' || !remoteAction) {
        const result = gitRemote({ action: 'list' });
        if (!result.success) { printError(result.error); break; }
        console.log('');
        console.log(colors.brand.bold('  Git Remotes'));
        printDivider();
        if (result.remotes.length === 0) {
          console.log(colors.dim('  No remotes.'));
        } else {
          result.remotes.forEach(r => console.log(`  ${colors.accent(r.name.padEnd(15))} ${r.fetchUrl}`));
        }
        printDivider();
      } else if (remoteAction === 'add') {
        const result = gitRemote({ action: 'add', name: remoteParts[1], url: remoteParts[2] });
        if (result.success) printSuccess(result.message);
        else printError(result.error);
      } else if (remoteAction === 'remove') {
        const result = gitRemote({ action: 'remove', name: remoteParts[1] });
        if (result.success) printSuccess(result.message);
        else printError(result.error);
      } else {
        printWarning('Usage: /remote [list|add <name> <url>|remove <name>]');
      }
      break;
    }

    case '/blame': {
      if (!arg) { printWarning('Usage: /blame <file> [startLine] [endLine]'); break; }
      const blameParts = arg.split(/\s+/);
      const blameFile = blameParts[0];
      const blameSL = blameParts[1] ? parseInt(blameParts[1]) : undefined;
      const blameEL = blameParts[2] ? parseInt(blameParts[2]) : undefined;
      const result = gitBlame({ file: blameFile, startLine: blameSL, endLine: blameEL });
      if (!result.success) { printError(result.error); break; }
      console.log('');
      console.log(colors.brand.bold(`  Git Blame: ${blameFile}`));
      printDivider();
      const blameLines = result.blame.split('\n').slice(0, 50);
      for (const line of blameLines) {
        console.log(`  ${colors.dim(line)}`);
      }
      if (result.blame.split('\n').length > 50) {
        console.log(colors.dim(`  ... ${result.blame.split('\n').length - 50} more lines`));
      }
      printDivider();
      break;
    }

    case '/fetch': {
      const fetchParts = arg ? arg.split(/\s+/) : [];
      const fetchAll = fetchParts.includes('--all');
      const fetchPrune = fetchParts.includes('--prune');
      const spinner = createSpinner('Fetching...');
      spinner.start();
      const result = gitFetch({ all: fetchAll, prune: fetchPrune });
      spinner.stop();
      if (result.success) printSuccess(result.message);
      else printError(result.error);
      break;
    }

    case '/cherry-pick': {
      if (!arg) { printWarning('Usage: /cherry-pick <hash> [hash2] ... [--abort]'); break; }
      const cpParts = arg.split(/\s+/);
      if (cpParts.includes('--abort')) {
        const result = gitCherryPick({ abort: true });
        if (result.success) printSuccess(result.message);
        else printError(result.error);
      } else {
        const result = gitCherryPick({ commits: cpParts });
        if (result.success) printSuccess(result.message);
        else printError(result.error);
      }
      break;
    }

    case '/repoinfo': {
      const result = gitRepoInfo();
      if (!result.success) { printError(result.error); break; }
      console.log('');
      console.log(colors.brand.bold('  Repository Info'));
      printDivider();
      console.log(`  Root:         ${colors.accent(result.root)}`);
      console.log(`  Branch:       ${colors.accent(result.branch)}`);
      if (result.remoteUrl) console.log(`  Remote:       ${colors.dim(result.remoteUrl)}`);
      console.log(`  Commits:      ${result.commitCount}`);
      console.log(`  Branches:     ${result.branchCount}`);
      console.log(`  Tags:         ${result.tagCount}${result.lastTag ? ` (latest: ${colors.accent(result.lastTag)})` : ''}`);
      if (result.contributors.length > 0) {
        console.log('');
        console.log(colors.accent('  Contributors:'));
        result.contributors.slice(0, 10).forEach(c => {
          console.log(`    ${colors.dim(String(c.commits).padStart(5))} ${c.name} ${colors.dim(`<${c.email}>`)}`);
        });
      }
      printDivider();
      break;
    }

    case '/about': {
      printAbout();
      break;
    }

    case '/git': {
      // Universal /git command dispatcher
      if (!arg) {
        console.log('');
        console.log(colors.brand.bold('  Git Source Control'));
        printDivider();
        console.log(colors.accent('  Shortcuts:'));
        console.log('    /status              Git status');
        console.log('    /log [n]             Commit history');
        console.log('    /diff                Show changes');
        console.log('    /commit              AI-powered commit');
        console.log('    /push [remote] [br]  Push to remote');
        console.log('    /pull [--rebase]     Pull from remote');
        console.log('    /merge <branch>      Merge branch');
        console.log('    /stash [cmd]         Stash operations');
        console.log('    /tag [cmd]           Tag management');
        console.log('    /remote [cmd]        Remote management');
        console.log('    /blame <file>        File blame');
        console.log('    /fetch [--all]       Fetch from remote');
        console.log('    /cherry-pick <hash>  Cherry-pick commit');
        console.log('    /repoinfo            Repository overview');
        console.log('');
        console.log(colors.accent('  Full commands via /git:'));
        console.log('    /git status');
        console.log('    /git add <file|--all>');
        console.log('    /git checkout <branch|file>');
        console.log('    /git branch [create|delete|rename] <name>');
        console.log('    /git reset [--soft|--hard] [target]');
        console.log('    /git show [commit]');
        console.log('    /git clone <url> [dir]');
        console.log('    /git init [dir]');
        console.log('    /git rebase <branch> [--abort|--continue]');
        console.log('    /git conflicts [list|accept-ours|accept-theirs] [file]');
        printDivider();
        break;
      }
      const gitParts = arg.split(/\s+/);
      const gitCmd = gitParts[0];
      const gitArg = gitParts.slice(1).join(' ');

      // Dispatch to sub-commands
      switch (gitCmd) {
        case 'status': {
          // Reuse /status handler
          await handleSlashCommand('/status', '', rl, agent);
          break;
        }
        case 'log': {
          await handleSlashCommand('/log', gitArg, rl, agent);
          break;
        }
        case 'diff': {
          await handleSlashCommand('/diff', gitArg, rl, agent);
          break;
        }
        case 'commit': {
          await handleSlashCommand('/commit', gitArg, rl, agent);
          break;
        }
        case 'push': {
          await handleSlashCommand('/push', gitArg, rl, agent);
          break;
        }
        case 'pull': {
          await handleSlashCommand('/pull', gitArg, rl, agent);
          break;
        }
        case 'merge': {
          await handleSlashCommand('/merge', gitArg, rl, agent);
          break;
        }
        case 'stash': {
          await handleSlashCommand('/stash', gitArg, rl, agent);
          break;
        }
        case 'tag': {
          await handleSlashCommand('/tag', gitArg, rl, agent);
          break;
        }
        case 'remote': {
          await handleSlashCommand('/remote', gitArg, rl, agent);
          break;
        }
        case 'blame': {
          await handleSlashCommand('/blame', gitArg, rl, agent);
          break;
        }
        case 'fetch': {
          await handleSlashCommand('/fetch', gitArg, rl, agent);
          break;
        }
        case 'cherry-pick': {
          await handleSlashCommand('/cherry-pick', gitArg, rl, agent);
          break;
        }
        case 'add': {
          if (!gitArg && !gitParts.includes('--all') && !gitParts.includes('-A')) {
            printWarning('Usage: /git add <file> [file2] ... | /git add --all');
            break;
          }
          const addAll = gitParts.includes('--all') || gitParts.includes('-A');
          const addFiles = gitParts.slice(1).filter(p => !p.startsWith('-'));
          const result = gitAdd({ files: addFiles.length > 0 ? addFiles : undefined, all: addAll });
          if (result.success) printSuccess(result.message);
          else printError(result.error);
          break;
        }
        case 'checkout': {
          if (!gitArg) { printWarning('Usage: /git checkout <branch|file>'); break; }
          const coCreateBranch = gitParts.includes('-b');
          const coTarget = gitParts.slice(1).find(p => !p.startsWith('-'));
          const result = gitCheckout({ target: coTarget, createBranch: coCreateBranch });
          if (result.success) printSuccess(result.message);
          else printError(result.error);
          break;
        }
        case 'branch': {
          const brParts = gitParts.slice(1);
          if (brParts.length === 0) {
            const result = gitBranchOp({ action: 'list', remote: true });
            if (!result.success) { printError(result.error); break; }
            console.log('');
            console.log(colors.brand.bold('  Git Branches'));
            printDivider();
            for (const b of result.branches) {
              const isCurrent = b.name === result.current;
              const prefix = isCurrent ? colors.success('* ') : '  ';
              console.log(`${prefix}${isCurrent ? colors.accent(b.name) : b.name} ${colors.dim(b.hash)}${b.upstream ? colors.dim(` → ${b.upstream} ${b.track || ''}`) : ''}`);
            }
            if (result.remoteBranches.length > 0) {
              console.log(colors.dim('\n  Remote branches:'));
              result.remoteBranches.forEach(b => console.log(`  ${colors.dim(b.name)} ${colors.dim(b.hash)}`));
            }
            printDivider();
          } else if (brParts[0] === 'create') {
            const result = gitBranchOp({ action: 'create', name: brParts[1] });
            if (result.success) printSuccess(result.message);
            else printError(result.error);
          } else if (brParts[0] === 'delete') {
            const result = gitBranchOp({ action: 'delete', name: brParts[1] });
            if (result.success) printSuccess(result.message);
            else printError(result.error);
          } else if (brParts[0] === 'rename') {
            const result = gitBranchOp({ action: 'rename', name: brParts[1], newName: brParts[2] });
            if (result.success) printSuccess(result.message);
            else printError(result.error);
          } else {
            // Treat as checkout: /git branch feature-x → switch to it
            const result = gitBranchOp({ action: 'checkout', name: brParts[0] });
            if (result.success) printSuccess(result.message);
            else printError(result.error);
          }
          break;
        }
        case 'reset': {
          const resetParts = gitParts.slice(1);
          let mode = 'mixed';
          let target;
          const resetFiles = [];
          for (const p of resetParts) {
            if (p === '--soft') mode = 'soft';
            else if (p === '--hard') mode = 'hard';
            else if (p === '--mixed') mode = 'mixed';
            else target = target || p;
          }
          const result = gitReset({ mode, target, files: resetFiles.length > 0 ? resetFiles : undefined });
          if (result.success) printSuccess(result.message);
          else printError(result.error);
          break;
        }
        case 'show': {
          const showCommit = gitParts[1] || 'HEAD';
          const showStat = gitParts.includes('--stat');
          const result = gitShow({ commit: showCommit, stat: showStat });
          if (!result.success) { printError(result.error); break; }
          console.log('');
          printDivider();
          const showLines = result.output.split('\n').slice(0, 60);
          for (const line of showLines) {
            if (line.startsWith('+') && !line.startsWith('+++')) console.log(colors.success(`  ${line}`));
            else if (line.startsWith('-') && !line.startsWith('---')) console.log(colors.error(`  ${line}`));
            else if (line.startsWith('@@')) console.log(colors.accent(`  ${line}`));
            else console.log(colors.dim(`  ${line}`));
          }
          if (result.output.split('\n').length > 60) console.log(colors.dim(`  ... more lines`));
          printDivider();
          break;
        }
        case 'clone': {
          if (!gitParts[1]) { printWarning('Usage: /git clone <url> [directory]'); break; }
          const spinner = createSpinner('Cloning...');
          spinner.start();
          const result = gitClone({ url: gitParts[1], directory: gitParts[2] });
          spinner.stop();
          if (result.success) printSuccess(result.message);
          else printError(result.error);
          break;
        }
        case 'init': {
          const result = gitInitOp({ directory: gitParts[1], bare: gitParts.includes('--bare') });
          if (result.success) printSuccess(result.message);
          else printError(result.error);
          break;
        }
        case 'rebase': {
          if (gitParts.includes('--abort')) {
            const result = gitRebase({ abort: true });
            if (result.success) printSuccess(result.message);
            else printError(result.error);
          } else if (gitParts.includes('--continue')) {
            const result = gitRebase({ continue: true });
            if (result.success) printSuccess(result.message);
            else printError(result.error);
          } else {
            const rebaseBranch = gitParts[1];
            if (!rebaseBranch) { printWarning('Usage: /git rebase <branch> [--abort|--continue]'); break; }
            const result = gitRebase({ branch: rebaseBranch });
            if (result.success) printSuccess(result.message);
            else printError(result.error);
          }
          break;
        }
        case 'conflicts': {
          const cfAction = gitParts[1] || 'list';
          const cfFile = gitParts[2];
          const result = gitConflicts({ action: cfAction, file: cfFile });
          if (!result.success) { printError(result.error); break; }
          if (result.conflicts && Array.isArray(result.conflicts)) {
            console.log('');
            console.log(colors.brand.bold('  Merge Conflicts'));
            printDivider();
            if (result.conflicts.length === 0) {
              console.log(colors.success('  No conflicts!'));
            } else {
              result.conflicts.forEach(f => console.log(colors.error(`  ⚡ ${typeof f === 'string' ? f : f.file}`)));
            }
            printDivider();
          } else {
            printSuccess(result.message);
          }
          break;
        }
        default:
          printWarning(`Unknown git command: ${gitCmd}. Type /git for help.`);
      }
      break;
    }

    // ─── /quickfix ─── Auto-fix the last command error ───
    case '/quickfix': {
      if (!lastCommandError) {
        printWarning('No recent command error to fix. Run a command first.');
        break;
      }
      const elapsed = Date.now() - lastCommandError.timestamp;
      if (elapsed > 30 * 60 * 1000) {
        printWarning('Last error is older than 30 minutes. It may be stale.');
      }
      console.log('');
      console.log(colors.brand.bold('  🩹 Quick Fix'));
      printDivider();
      console.log(colors.dim(`  Failed command: ${lastCommandError.command}`));
      console.log(colors.error(`  Error: ${lastCommandError.stderr.slice(0, 200)}`));
      printDivider();

      const qfPrompt = `The user ran this command and it failed. Provide a corrected command that fixes the error.

Command: ${lastCommandError.command}
Error output: ${lastCommandError.stderr}
Stdout: ${lastCommandError.stdout.slice(0, 500)}
OS: ${process.platform}
CWD: ${process.cwd()}

Respond with ONLY the corrected command in a code block. Add a brief one-line explanation before the code block.`;

      const spinner = createSpinner('Analyzing error...');
      spinner.start();
      try {
        const fixResponse = await agent.run(qfPrompt);
        spinner.stop();
        trackEvent('quickfix', `Fix for: ${lastCommandError.command.slice(0, 50)}`);
        await renderWithCommandCards(rl, fixResponse);
      } catch (e) {
        spinner.stop();
        printError('Could not generate fix: ' + e.message);
      }
      break;
    }

    // ─── /teach ─── Custom command aliases ───
    case '/teach': {
      if (!arg) {
        // Show usage
        console.log('');
        console.log(colors.brand.bold('  📚 Teach Commands'));
        printDivider();
        console.log(colors.accent('  Usage:'));
        console.log('    /teach <name> = <command>    Teach a new shortcut');
        console.log('    /teach list                  List all taught commands');
        console.log('    /teach remove <name>         Remove a taught command');
        console.log('');
        console.log(colors.dim('  Placeholders: $* (all args), $1 $2 (positional)'));
        console.log(colors.dim('  Example: /teach deploy = npm run build && scp -r dist/ $1:/app'));
        printDivider();
        break;
      }

      if (arg === 'list') {
        const cmds = getTeachCommands();
        const keys = Object.keys(cmds);
        console.log('');
        console.log(colors.brand.bold('  📚 Taught Commands'));
        printDivider();
        if (keys.length === 0) {
          console.log(colors.dim('  No commands taught yet. Use: /teach <name> = <command>'));
        } else {
          for (const k of keys) {
            console.log(`  ${colors.accent(k)} ${colors.dim('→')} ${cmds[k]}`);
          }
        }
        printDivider();
        break;
      }

      if (arg.startsWith('remove ')) {
        const name = arg.slice(7).trim();
        if (!name) { printWarning('Usage: /teach remove <name>'); break; }
        const cmds = getTeachCommands();
        if (!cmds[name]) {
          printWarning(`No taught command named "${name}".`);
        } else {
          removeTeachCommand(name);
          printSuccess(`Removed taught command: ${name}`);
          trackEvent('teach', `Removed: ${name}`);
        }
        break;
      }

      // Parse "name = command"
      const eqIndex = arg.indexOf('=');
      if (eqIndex === -1) {
        printWarning('Usage: /teach <name> = <command>');
        break;
      }
      const teachName = arg.slice(0, eqIndex).trim();
      const teachCmd = arg.slice(eqIndex + 1).trim();
      if (!teachName || !teachCmd) {
        printWarning('Both name and command are required. Example: /teach deploy = npm run build');
        break;
      }
      setTeachCommand(teachName, teachCmd);
      printSuccess(`Taught: ${colors.accent(teachName)} → ${teachCmd}`);
      trackEvent('teach', `Taught: ${teachName} = ${teachCmd}`);
      break;
    }

    // ─── /timeline ─── Session activity timeline ───
    case '/timeline': {
      if (sessionTimeline.length === 0) {
        printWarning('No events recorded yet in this session.');
        break;
      }
      printTimeline(sessionTimeline);
      break;
    }

    // ─── /snapshot ─── System state snapshots ───
    case '/snapshot': {
      const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';

      const captureSnapshot = () => {
        const data = { timestamp: Date.now(), cwd: process.cwd() };
        try {
          if (process.platform === 'win32') {
            data.processesRaw = execSync('Get-Process | Select-Object -First 50 Name, Id, CPU, WorkingSet | ConvertTo-Json', { encoding: 'utf-8', shell, timeout: 10000 }).trim();
            data.portsRaw = execSync('Get-NetTCPConnection -State Listen | Select-Object -First 30 LocalPort, OwningProcess | ConvertTo-Json', { encoding: 'utf-8', shell, timeout: 10000 }).trim();
            data.diskRaw = execSync('Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{N="UsedGB";E={[math]::Round($_.Used/1GB,2)}}, @{N="FreeGB";E={[math]::Round($_.Free/1GB,2)}} | ConvertTo-Json', { encoding: 'utf-8', shell, timeout: 10000 }).trim();
            data.memoryRaw = execSync('Get-CimInstance Win32_OperatingSystem | Select-Object @{N="TotalGB";E={[math]::Round($_.TotalVisibleMemorySize/1MB,2)}}, @{N="FreeGB";E={[math]::Round($_.FreePhysicalMemory/1MB,2)}} | ConvertTo-Json', { encoding: 'utf-8', shell, timeout: 10000 }).trim();
          } else {
            data.processesRaw = execSync('ps aux --sort=-%mem | head -50', { encoding: 'utf-8', shell, timeout: 10000 }).trim();
            data.portsRaw = execSync('ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null', { encoding: 'utf-8', shell, timeout: 10000 }).trim();
            data.diskRaw = execSync('df -h', { encoding: 'utf-8', shell, timeout: 10000 }).trim();
            data.memoryRaw = execSync('free -h 2>/dev/null || vm_stat 2>/dev/null', { encoding: 'utf-8', shell, timeout: 10000 }).trim();
          }
        } catch (e) {
          data.error = e.message;
        }
        // Parse structured summary for diff support
        try {
          const procs = JSON.parse(data.processesRaw || '[]');
          const procsArr = Array.isArray(procs) ? procs : [procs];
          data.processCount = procsArr.length;
          data.topProcesses = procsArr.map(p => p.Name || p.name || '').filter(Boolean).slice(0, 20);
        } catch { data.processCount = 0; data.topProcesses = []; }
        try {
          const ports = JSON.parse(data.portsRaw || '[]');
          const portsArr = Array.isArray(ports) ? ports : [ports];
          data.ports = portsArr.map(p => p.LocalPort || p.localPort || 0).filter(Boolean);
        } catch { data.ports = []; }
        try {
          const disks = JSON.parse(data.diskRaw || '[]');
          const disksArr = Array.isArray(disks) ? disks : [disks];
          data.diskFreeGB = disksArr.reduce((sum, d) => sum + (d.FreeGB || 0), 0);
        } catch { data.diskFreeGB = 0; }
        try {
          const mem = JSON.parse(data.memoryRaw || '{}');
          data.memTotalGB = mem.TotalGB || 0;
          data.memFreeGB = mem.FreeGB || 0;
          data.memUsedGB = parseFloat((data.memTotalGB - data.memFreeGB).toFixed(2));
        } catch { data.memUsedGB = 0; }
        return data;
      };

      if (!arg || (!arg.startsWith('list') && !arg.startsWith('diff ') && !arg.startsWith('delete '))) {
        // Take snapshot
        const snapName = arg || `snap-${Date.now()}`;
        const spinner = createSpinner('Capturing system state...');
        spinner.start();
        const snapData = captureSnapshot();
        spinner.stop();
        saveSnapshot(snapName, snapData);
        printSuccess(`Snapshot saved: ${colors.accent(snapName)}`);
        console.log(colors.dim(`  Timestamp: ${new Date(snapData.timestamp).toLocaleString()}`));
        console.log(colors.dim(`  CWD: ${snapData.cwd}`));
        if (snapData.error) printWarning(`Partial capture: ${snapData.error}`);
        trackEvent('snapshot', `Captured: ${snapName}`);
        break;
      }

      if (arg === 'list') {
        const snaps = listSnapshots();
        console.log('');
        console.log(colors.brand.bold('  📸 Saved Snapshots'));
        printDivider();
        if (snaps.length === 0) {
          console.log(colors.dim('  No snapshots saved. Use: /snapshot [name]'));
        } else {
          for (const s of snaps) {
            const snap = getSnapshot(s);
            const ts = snap && snap.timestamp ? new Date(snap.timestamp).toLocaleString() : 'unknown';
            const procs = snap && snap.processCount != null ? ` | ${snap.processCount} procs` : '';
            console.log(`  ${colors.accent(s)} ${colors.dim(`— ${ts}${procs}`)}`);
          }
        }
        printDivider();
        break;
      }

      if (arg.startsWith('delete ')) {
        const dName = arg.slice(7).trim();
        if (!dName) { printWarning('Usage: /snapshot delete <name>'); break; }
        if (!getSnapshot(dName)) {
          printWarning(`No snapshot named "${dName}".`);
        } else {
          deleteSnapshot(dName);
          printSuccess(`Deleted snapshot: ${dName}`);
        }
        break;
      }

      if (arg.startsWith('diff ')) {
        const diffParts = arg.slice(5).trim().split(/\s+/);
        if (diffParts.length < 2) {
          printWarning('Usage: /snapshot diff <name1> <name2>');
          break;
        }
        const [name1, name2] = diffParts;
        const snap1 = getSnapshot(name1);
        const snap2 = getSnapshot(name2);
        if (!snap1) { printWarning(`Snapshot "${name1}" not found.`); break; }
        if (!snap2) { printWarning(`Snapshot "${name2}" not found.`); break; }
        printSnapshotDiff(snap1, snap2);
        trackEvent('snapshot', `Diff: ${name1} vs ${name2}`);
        break;
      }
      break;
    }

    // ─── /autopilot ─── Goal-driven AI loop ───
    case '/autopilot': {
      if (!arg) {
        printWarning('Usage: /autopilot <goal>');
        console.log(colors.dim('  Example: /autopilot set up a Node.js project with TypeScript and ESLint'));
        break;
      }

      console.log('');
      console.log(colors.brand.bold('  🚀 Autopilot Mode'));
      printDivider();
      console.log(colors.accent(`  Goal: ${arg}`));
      printDivider();

      const planPrompt = `You are an autopilot assistant. The user wants to achieve this goal:
"${arg}"

Break this into a numbered list of concrete, executable steps. Each step should be a single shell command or a brief action.
Format EXACTLY like this (no other text):
1. <description> :: <command>
2. <description> :: <command>

If a step doesn't need a command (e.g., "verify output"), use "MANUAL" as the command.
Keep it to 10 steps maximum. Be specific and practical for ${process.platform === 'win32' ? 'Windows PowerShell' : 'Linux/macOS bash'}.`;

      const planSpinner = createSpinner('Planning steps...');
      planSpinner.start();
      let planResponse;
      try {
        planResponse = await agent.run(planPrompt);
        planSpinner.stop();
      } catch (e) {
        planSpinner.stop();
        printError('Failed to plan: ' + e.message);
        break;
      }

      // Parse steps: "N. description :: command"
      const stepLines = planResponse.split('\n').filter(l => /^\d+\.\s/.test(l.trim()));
      if (stepLines.length === 0) {
        printWarning('Could not parse steps. Showing raw plan:');
        console.log(planResponse);
        break;
      }

      const steps = stepLines.map(line => {
        const match = line.match(/^\d+\.\s*(.+?)\s*::\s*(.+)$/);
        if (match) return { description: match[1].trim(), command: match[2].trim() };
        return { description: line.replace(/^\d+\.\s*/, '').trim(), command: 'MANUAL' };
      });

      console.log('');
      console.log(colors.accent(`  📋 Plan (${steps.length} steps):`));
      steps.forEach((s, i) => {
        console.log(`  ${colors.dim(`${i + 1}.`)} ${s.description}`);
        if (s.command !== 'MANUAL') console.log(`     ${colors.dim('$')} ${colors.cyan(s.command)}`);
      });
      console.log('');

      trackEvent('autopilot', `Started: ${arg.slice(0, 60)}`, `${steps.length} steps`);

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        printAutopilotStep(i + 1, steps.length, step.description);

        if (step.command === 'MANUAL') {
          console.log(colors.dim('  (Manual step — review and continue)'));
          const cont = await new Promise(resolve => {
            rl.question(colors.accent('  Continue? (y/n/skip) '), resolve);
          });
          if (cont.toLowerCase() === 'n') {
            printAutopilotStatus('stopped');
            trackEvent('autopilot', 'User stopped at step ' + (i + 1));
            break;
          }
          if (cont.toLowerCase() === 'skip') continue;
          continue;
        }

        console.log(colors.dim(`  $ ${step.command}`));
        const action = await new Promise(resolve => {
          rl.question(colors.accent('  Run? (y/n/skip/edit) '), resolve);
        });

        if (action.toLowerCase() === 'n') {
          printAutopilotStatus('stopped');
          trackEvent('autopilot', 'User stopped at step ' + (i + 1));
          break;
        }
        if (action.toLowerCase() === 'skip') {
          console.log(colors.dim('  Skipped.'));
          continue;
        }

        let cmdToRun = step.command;
        if (action.toLowerCase() === 'edit') {
          cmdToRun = await questionPrefilled(rl, colors.accent('  Command: '), step.command);
          if (!cmdToRun.trim()) { console.log(colors.dim('  Skipped.')); continue; }
        }

        await executeCommandInteractive(cmdToRun);
      }

      printAutopilotStatus('completed');
      trackEvent('autopilot', `Completed: ${arg.slice(0, 60)}`);
      break;
    }

    // ─── /explain ─── Run command & get plain-English explanation ───
    case '/explain': {
      if (!arg) {
        printWarning('Usage: /explain <command>');
        console.log(colors.dim('  Example: /explain netstat -tlnp'));
        console.log(colors.dim('  Example: /explain git log --oneline -10'));
        break;
      }

      console.log('');
      console.log(colors.brand.bold('  🔍 Explain'));
      printDivider();
      console.log(colors.dim(`  Running: ${arg}`));

      let cmdOutput = '';
      let cmdError = '';
      try {
        const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
        cmdOutput = execSync(arg, {
          encoding: 'utf-8',
          timeout: 30000,
          cwd: process.cwd(),
          shell,
          maxBuffer: 1024 * 1024 * 5,
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      } catch (e) {
        cmdOutput = e.stdout ? e.stdout.trim() : '';
        cmdError = e.stderr ? e.stderr.trim() : e.message;
      }

      if (cmdOutput) {
        const preview = cmdOutput.split('\n').slice(0, 10).join('\n');
        console.log(colors.dim(preview));
        if (cmdOutput.split('\n').length > 10) console.log(colors.dim(`  ... (${cmdOutput.split('\n').length} lines total)`));
      }
      if (cmdError) {
        console.log(colors.error(cmdError.split('\n').slice(0, 5).join('\n')));
      }
      printDivider();

      const explainPrompt = `Explain this command and its output in plain English. Be concise and helpful.

Command: ${arg}
Output:
${cmdOutput.slice(0, 3000)}
${cmdError ? `\nErrors:\n${cmdError.slice(0, 1000)}` : ''}

Explain:
1. What the command does
2. Key findings from the output
3. Any issues or warnings spotted`;

      const spinner = createSpinner('Analyzing...');
      spinner.start();
      try {
        const explanation = await agent.run(explainPrompt);
        spinner.stop();
        console.log('');
        await renderWithCommandCards(rl, explanation);
        trackEvent('explain', `Explained: ${arg.slice(0, 50)}`);
      } catch (e) {
        spinner.stop();
        printError('Could not explain: ' + e.message);
      }
      break;
    }

    default:
      printWarning(`Unknown command: ${command}. Type /help for available commands.`);
  }
}
