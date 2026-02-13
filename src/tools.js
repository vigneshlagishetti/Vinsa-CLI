/**
 * Vinsa CLI — Built-in Tools
 * These are the "hands" of the agent. Each tool is a function the AI can call.
 * Tools cover: shell, filesystem, network, system info, web fetch, code analysis.
 */
import { execSync, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import dns from 'dns';
import { promisify } from 'util';
import si from 'systeminformation';
import { getHooks, getConfirmWrites } from './config.js';
import { gitOperations } from './git.js';

const dnsResolve = promisify(dns.resolve);
const dnsReverse = promisify(dns.reverse);

// ════════════════════════════════════════════════════════════
// HOOKS SYSTEM — PreToolUse / PostToolUse
// ════════════════════════════════════════════════════════════
let interactiveConfirmFn = null; // Set by chat.js when in interactive mode

export function setInteractiveConfirm(fn) {
  interactiveConfirmFn = fn;
}

/**
 * Run pre-tool-use hooks. Returns { allow: true/false, reason? }
 */
function runPreHooks(toolName, args) {
  const hooks = getHooks();
  for (const hook of (hooks.preToolUse || [])) {
    // Hook format: { pattern: "regex", action: "block"|"warn"|"log", message: "..." }
    try {
      if (hook.pattern && new RegExp(hook.pattern, 'i').test(toolName)) {
        if (hook.action === 'block') {
          return { allow: false, reason: hook.message || `Blocked by hook: ${hook.pattern}` };
        }
        if (hook.action === 'warn') {
          console.log(`  ⚠ Hook warning (${toolName}): ${hook.message || hook.pattern}`);
        }
        if (hook.action === 'log') {
          console.log(`  📝 Hook log: ${toolName}(${JSON.stringify(args).slice(0, 100)})`);
        }
      }
    } catch { /* skip broken hooks */ }
  }
  return { allow: true };
}

/**
 * Run post-tool-use hooks
 */
function runPostHooks(toolName, args, result) {
  const hooks = getHooks();
  for (const hook of (hooks.postToolUse || [])) {
    try {
      if (hook.pattern && new RegExp(hook.pattern, 'i').test(toolName)) {
        if (hook.action === 'log') {
          const status = result.success ? '✔' : '✖';
          console.log(`  📝 [${status}] ${toolName} completed`);
        }
      }
    } catch { /* skip broken hooks */ }
  }
}

// ════════════════════════════════════════════════════════════
// FILE CHANGE TRACKER — Powers /undo
// ════════════════════════════════════════════════════════════
const fileChangeStack = [];
const MAX_UNDO_HISTORY = 50;

export function getFileChangeStack() {
  return fileChangeStack;
}

export function undoLastChange() {
  if (fileChangeStack.length === 0) return { success: false, error: 'No changes to undo.' };
  const last = fileChangeStack.pop();
  try {
    if (last.previousContent === null) {
      // File didn't exist before — delete it
      if (fs.existsSync(last.filePath)) {
        fs.unlinkSync(last.filePath);
        return { success: true, action: 'deleted', filePath: last.filePath, message: `Removed ${last.filePath} (file was newly created)` };
      }
      return { success: true, action: 'already-gone', filePath: last.filePath, message: 'File was already removed.' };
    } else {
      // Restore previous content
      fs.writeFileSync(last.filePath, last.previousContent, 'utf-8');
      return { success: true, action: 'restored', filePath: last.filePath, message: `Restored ${last.filePath} to previous state` };
    }
  } catch (err) {
    return { success: false, error: `Undo failed: ${err.message}` };
  }
}

// ════════════════════════════════════════════════════════════
// TOOL DEFINITIONS (OpenAI-compatible Function Calling Schema — used by Groq)
// ════════════════════════════════════════════════════════════

export const toolDefinitions = [
  {
    name: 'run_shell_command',
    description: 'Execute any shell command anywhere on the user\'s computer and return the output. Use for running scripts, installing packages, checking system status, git commands, docker commands, navigating any directory, etc. Has full access to the entire system. On Windows uses PowerShell, on Linux/macOS uses bash.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        cwd: { type: 'string', description: 'Working directory — use absolute path to run commands anywhere on the computer (optional, defaults to current directory)' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 120000)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of any file anywhere on the computer. Supports text files of any kind (code, config, logs, markdown, etc). Use absolute paths to access any location.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute or relative path to any file on the computer' },
        encoding: { type: 'string', description: 'File encoding (default: utf-8)' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to any file anywhere on the computer. Creates the file if it doesn\'t exist. Creates parent directories automatically. Use absolute paths for files outside the current directory.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute or relative path to any file on the computer' },
        content: { type: 'string', description: 'The content to write' },
        append: { type: 'boolean', description: 'If true, append instead of overwrite (default: false)' },
      },
      required: ['filePath', 'content'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and folders in any directory on the computer with details (size, type, modified date). Use absolute paths to browse anywhere (e.g., C:\\, /home, /etc). Results capped at 500 items by default — use a specific subdirectory for large directories.',
    parameters: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: 'Absolute or relative path to any directory on the computer (default: current directory)' },
        recursive: { type: 'boolean', description: 'List recursively (default: false, up to 3 levels deep). AVOID on root drives like C:\\ or /' },
        maxItems: { type: 'number', description: 'Maximum items to return (default: 500). Use smaller values for large directories.' },
      },
      required: [],
    },
  },
  {
    name: 'search_files',
    description: 'Search for files by name pattern or search inside files for text. To find files by topic (e.g. "find my resume"), use pattern like "*resume*" or "*resume*.pdf" to match the word in filenames. Use absolute paths to search any directory.',
    parameters: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Absolute or relative path to any directory on the computer (default: current directory)' },
        pattern: { type: 'string', description: 'Filename glob pattern — supports * wildcards. Examples: "*.js" (all JS files), "*resume*" (files with "resume" in name), "*resume*.pdf" (PDF resumes)' },
        contentSearch: { type: 'string', description: 'Search inside files for this text/regex' },
        maxResults: { type: 'number', description: 'Maximum results to return (default: 100)' },
      },
      required: [],
    },
  },
  {
    name: 'get_system_info',
    description: 'Get detailed system information: OS, CPU, RAM, disk, network interfaces, processes, battery, etc.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'What info to get: "overview" (default), "cpu", "memory", "disk", "network", "os", "processes", "battery", "gpu", "all"',
        },
      },
      required: [],
    },
  },
  {
    name: 'network_diagnostics',
    description: 'Run network diagnostics: ping a host, DNS lookup, check ports, trace route, get public IP, scan WiFi networks, view active connections.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '"ping", "dns_lookup", "reverse_dns", "check_port", "public_ip", "interfaces", "connections", "traceroute", "wifi"',
        },
        target: { type: 'string', description: 'Hostname, IP address, or domain to test' },
        port: { type: 'number', description: 'Port number (for check_port action)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'web_fetch',
    description: 'Fetch content from a URL. Returns the raw text/HTML content. Useful for checking APIs, downloading data, or reading web pages.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch' },
        method: { type: 'string', description: 'HTTP method (default: GET)' },
        headers: { type: 'object', description: 'Request headers as key-value pairs' },
        body: { type: 'string', description: 'Request body (for POST/PUT)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'process_manager',
    description: 'Manage any system process: list all running processes, find by name, kill any process by PID, show top CPU/memory consumers.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '"list", "find", "kill", "top"' },
        name: { type: 'string', description: 'Process name to find (for "find" action)' },
        pid: { type: 'number', description: 'Process ID to kill (for "kill" action)' },
        limit: { type: 'number', description: 'Max processes to return (default: 15)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'code_analysis',
    description: 'Analyze any project/codebase anywhere on the computer: detect language, count lines, list dependencies, find TODOs, check structure. Use absolute paths.',
    parameters: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Absolute or relative path to any project directory on the computer' },
        action: { type: 'string', description: '"structure", "dependencies", "todos", "stats", "overview"' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'git_operations',
    description: 'Full Git source control — manage repositories like a complete Git client. Supports: status, log, branch, diff, add, commit, push, pull, merge, stash, clone, init, remote, tag, blame, cherry-pick, rebase, reset, checkout, show, fetch, conflicts, repoInfo. Use this instead of shell commands for Git operations.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Git operation: "status", "log", "branch", "diff", "add", "commit", "push", "pull", "merge", "stash", "clone", "init", "remote", "tag", "blame", "cherryPick", "rebase", "reset", "checkout", "show", "fetch", "conflicts", "repoInfo"',
        },
        // Common
        cwd: { type: 'string', description: 'Working directory (default: current directory)' },
        // Log options
        count: { type: 'number', description: 'Number of log entries (default: 20)' },
        oneline: { type: 'boolean', description: 'One-line log format' },
        graph: { type: 'boolean', description: 'Show ASCII graph in log' },
        author: { type: 'string', description: 'Filter log by author' },
        since: { type: 'string', description: 'Log since date (e.g. "2024-01-01", "2 weeks ago")' },
        until: { type: 'string', description: 'Log until date' },
        all: { type: 'boolean', description: 'Show all branches in log / fetch all remotes' },
        // Branch options
        subAction: { type: 'string', description: 'Sub-action for branch/stash/remote/tag/conflicts: e.g. "list", "create", "delete", "checkout", "create-checkout", "rename", "save", "pop", "apply", "drop", "clear", "show", "add", "remove", "set-url", "accept-ours", "accept-theirs", "force-delete"' },
        name: { type: 'string', description: 'Branch/tag/remote name' },
        newName: { type: 'string', description: 'New name for branch rename' },
        remote: { type: 'string', description: 'Remote name (default: "origin")' },
        // Diff options
        staged: { type: 'boolean', description: 'Show staged diff' },
        stat: { type: 'boolean', description: 'Show diff/show stats only' },
        nameOnly: { type: 'boolean', description: 'Show only changed file names' },
        commit1: { type: 'string', description: 'First commit for diff comparison' },
        commit2: { type: 'string', description: 'Second commit for diff comparison' },
        // Add/commit/reset options
        files: { type: 'array', items: { type: 'string' }, description: 'List of files for add/reset/checkout' },
        message: { type: 'string', description: 'Commit/tag/stash message' },
        amend: { type: 'boolean', description: 'Amend last commit' },
        allowEmpty: { type: 'boolean', description: 'Allow empty commit' },
        // Push/pull options
        branch: { type: 'string', description: 'Branch name' },
        force: { type: 'boolean', description: 'Force push' },
        setUpstream: { type: 'boolean', description: 'Set upstream on push' },
        rebase: { type: 'boolean', description: 'Pull with rebase' },
        // Merge options
        noFf: { type: 'boolean', description: 'No fast-forward merge' },
        squash: { type: 'boolean', description: 'Squash merge' },
        abort: { type: 'boolean', description: 'Abort merge/rebase/cherry-pick' },
        // Stash options
        index: { type: 'number', description: 'Stash index' },
        // Clone options
        url: { type: 'string', description: 'Repository URL for clone' },
        directory: { type: 'string', description: 'Target directory for clone/init' },
        depth: { type: 'number', description: 'Shallow clone depth' },
        bare: { type: 'boolean', description: 'Initialize bare repository' },
        // Blame options
        file: { type: 'string', description: 'File path for blame/diff/conflicts' },
        startLine: { type: 'number', description: 'Start line for blame' },
        endLine: { type: 'number', description: 'End line for blame' },
        // Cherry-pick
        commits: { type: 'array', items: { type: 'string' }, description: 'Commit hashes for cherry-pick' },
        noCommit: { type: 'boolean', description: 'Cherry-pick without committing' },
        // Rebase
        interactive: { type: 'boolean', description: 'Interactive rebase' },
        continue: { type: 'boolean', description: 'Continue rebase' },
        onto: { type: 'string', description: 'Rebase onto target' },
        // Reset
        mode: { type: 'string', description: 'Reset mode: "soft", "mixed", "hard"' },
        target: { type: 'string', description: 'Reset target / checkout target' },
        // Show
        commit: { type: 'string', description: 'Commit hash for show' },
        // Fetch
        prune: { type: 'boolean', description: 'Prune on fetch' },
        // Checkout
        createBranch: { type: 'boolean', description: 'Create branch on checkout' },
        // Conflict resolution
        resolution: { type: 'string', description: 'Conflict resolution strategy' },
      },
      required: ['action'],
    },
  },
];

// ════════════════════════════════════════════════════════════
// TOOL IMPLEMENTATIONS
// ════════════════════════════════════════════════════════════

function safeExec(command, options = {}) {
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      timeout: options.timeout || 30000,
      cwd: options.cwd || process.cwd(),
      shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
      maxBuffer: 1024 * 1024 * 50, // 50MB
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch (err) {
    if (err.stdout) return `Command completed with warnings:\n${err.stdout.trim()}`;
    throw new Error(`Command failed: ${err.message}`);
  }
}

async function runShellCommand({ command, cwd, timeout }) {
  try {
    const result = safeExec(command, { cwd, timeout: timeout || 120000 });
    return { success: true, output: result || '(no output)' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function readFile({ filePath, encoding = 'utf-8' }) {
  try {
    const resolved = path.resolve(filePath);
    const stat = fs.statSync(resolved);
    if (stat.size > 50 * 1024 * 1024) {
      return { success: false, error: `File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Use shell command to read parts.` };
    }
    const content = fs.readFileSync(resolved, encoding);
    return { success: true, content, size: stat.size, path: resolved };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function writeFile({ filePath, content, append = false }) {
  try {
    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Track change for /undo
    let previousContent = null;
    try {
      if (fs.existsSync(resolved)) {
        previousContent = fs.readFileSync(resolved, 'utf-8');
      }
    } catch { /* file didn't exist or unreadable */ }

    // ─── Interactive Diff Preview ───
    if (getConfirmWrites() && interactiveConfirmFn && !append) {
      const diffPreview = generateDiffPreview(previousContent, content, resolved);
      const confirmed = await interactiveConfirmFn(diffPreview);
      if (!confirmed) {
        return { success: false, error: 'Write cancelled by user (diff preview rejected).' };
      }
    }

    fileChangeStack.push({
      filePath: resolved,
      previousContent,
      timestamp: Date.now(),
      action: append ? 'append' : (previousContent === null ? 'create' : 'overwrite'),
    });
    if (fileChangeStack.length > MAX_UNDO_HISTORY) fileChangeStack.shift();

    if (append) {
      fs.appendFileSync(resolved, content, 'utf-8');
    } else {
      fs.writeFileSync(resolved, content, 'utf-8');
    }
    return { success: true, path: resolved, bytes: Buffer.byteLength(content) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Generate a colored diff preview string for interactive confirmation
 */
function generateDiffPreview(oldContent, newContent, filePath) {
  const fileName = path.basename(filePath);
  const lines = [];
  lines.push(`\n  📄 File: ${filePath}`);

  if (oldContent === null) {
    // New file
    lines.push('  Action: CREATE new file');
    const newLines = newContent.split('\n').slice(0, 20);
    for (const line of newLines) {
      lines.push(`  + ${line}`);
    }
    if (newContent.split('\n').length > 20) {
      lines.push(`  ... (${newContent.split('\n').length - 20} more lines)`);
    }
  } else {
    // Modified file — show simple line diff
    lines.push('  Action: MODIFY existing file');
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    let changes = 0;
    const maxShow = 30;

    for (let i = 0; i < Math.max(oldLines.length, newLines.length) && changes < maxShow; i++) {
      if (oldLines[i] !== newLines[i]) {
        if (oldLines[i] !== undefined) lines.push(`  - [L${i + 1}] ${oldLines[i]}`);
        if (newLines[i] !== undefined) lines.push(`  + [L${i + 1}] ${newLines[i]}`);
        changes++;
      }
    }
    const totalChanges = oldLines.reduce((c, line, i) => c + (line !== newLines[i] ? 1 : 0), 0);
    if (totalChanges > maxShow) {
      lines.push(`  ... (${totalChanges - maxShow} more changes)`);
    }
    lines.push(`  Summary: ${oldLines.length} → ${newLines.length} lines`);
  }

  return lines.join('\n');
}

async function listDirectory({ dirPath = '.', recursive = false, maxItems = 500 }) {
  try {
    const resolved = path.resolve(dirPath);
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items = [];
    let truncated = false;
    for (const entry of entries) {
      if (items.length >= maxItems) { truncated = true; break; }
      const fullPath = path.join(resolved, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        items.push({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isDirectory() ? '-' : formatSize(stat.size),
          modified: stat.mtime.toISOString().split('T')[0],
        });
        if (recursive && entry.isDirectory()) {
          try {
            const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
            for (const sub of subEntries) {
              if (items.length >= maxItems) { truncated = true; break; }
              const subFullPath = path.join(fullPath, sub.name);
              try {
                const subStat = fs.statSync(subFullPath);
                items.push({
                  name: `  ${entry.name}/${sub.name}`,
                  type: sub.isDirectory() ? 'directory' : 'file',
                  size: sub.isDirectory() ? '-' : formatSize(subStat.size),
                  modified: subStat.mtime.toISOString().split('T')[0],
                });
                // Go one more level deep in recursive mode
                if (sub.isDirectory()) {
                  try {
                    const deepEntries = fs.readdirSync(subFullPath, { withFileTypes: true });
                    for (const deep of deepEntries) {
                      if (items.length >= maxItems) { truncated = true; break; }
                      items.push({
                        name: `    ${entry.name}/${sub.name}/${deep.name}`,
                        type: deep.isDirectory() ? 'directory' : 'file',
                        size: '-',
                        modified: '',
                      });
                    }
                  } catch { /* skip */ }
                }
              } catch { /* skip */ }
            }
          } catch { /* skip inaccessible subdirs */ }
        }
      } catch { /* skip inaccessible files */ }
    }
    const result = { success: true, path: resolved, items, total: entries.length };
    if (truncated) {
      result.truncated = true;
      result.warning = `Results capped at ${maxItems} items (total in directory: ${entries.length}). Use a more specific path or search_files to find specific files.`;
    }
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function searchFiles({ directory = '.', pattern, contentSearch, maxResults = 100 }) {
  try {
    const resolved = path.resolve(directory);
    const results = [];

    function walk(dir, depth = 0) {
      if (depth > 15 || results.length >= maxResults) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= maxResults) break;
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath, depth + 1);
          } else {
            const matchesPattern = !pattern || matchGlob(entry.name, pattern);
            if (matchesPattern) {
              if (contentSearch) {
                try {
                  const content = fs.readFileSync(fullPath, 'utf-8');
                  const lines = content.split('\n');
                  const matches = [];
                  for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes(contentSearch)) {
                      matches.push({ line: i + 1, text: lines[i].trim().slice(0, 100) });
                    }
                  }
                  if (matches.length > 0) {
                    results.push({ file: path.relative(resolved, fullPath), matches: matches.slice(0, 5) });
                  }
                } catch { /* skip binary files */ }
              } else {
                results.push({ file: path.relative(resolved, fullPath) });
              }
            }
          }
        }
      } catch { /* skip inaccessible dirs */ }
    }

    walk(resolved);
    return { success: true, results, total: results.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function matchGlob(name, pattern) {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
  return regex.test(name);
}

async function getSystemInfo({ category = 'overview' }) {
  try {
    switch (category) {
      case 'cpu': {
        const cpu = await si.cpu();
        const load = await si.currentLoad();
        return { success: true, data: { ...cpu, currentLoad: load.currentLoad.toFixed(1) + '%' } };
      }
      case 'memory': {
        const mem = await si.mem();
        return {
          success: true, data: {
            total: formatSize(mem.total), used: formatSize(mem.used),
            free: formatSize(mem.free), usagePercent: ((mem.used / mem.total) * 100).toFixed(1) + '%',
            swapTotal: formatSize(mem.swaptotal), swapUsed: formatSize(mem.swapused),
          },
        };
      }
      case 'disk': {
        const disks = await si.fsSize();
        return {
          success: true, data: disks.map(d => ({
            mount: d.mount, type: d.type, size: formatSize(d.size),
            used: formatSize(d.used), available: formatSize(d.available),
            usagePercent: d.use.toFixed(1) + '%',
          })),
        };
      }
      case 'network': {
        const interfaces = await si.networkInterfaces();
        return {
          success: true, data: interfaces.filter(i => !i.internal).map(i => ({
            name: i.iface, ip4: i.ip4, ip6: i.ip6, mac: i.mac,
            speed: i.speed ? i.speed + ' Mbps' : 'Unknown', type: i.type,
          })),
        };
      }
      case 'os': {
        const osInfo = await si.osInfo();
        return { success: true, data: osInfo };
      }
      case 'processes': {
        const procs = await si.processes();
        return {
          success: true, data: {
            total: procs.all, running: procs.running, sleeping: procs.sleeping,
            topCPU: procs.list.sort((a, b) => b.cpu - a.cpu).slice(0, 10).map(p => ({
              name: p.name, pid: p.pid, cpu: p.cpu.toFixed(1) + '%', mem: p.mem.toFixed(1) + '%',
            })),
          },
        };
      }
      case 'battery': {
        const battery = await si.battery();
        return { success: true, data: battery };
      }
      case 'gpu': {
        const gpu = await si.graphics();
        return { success: true, data: gpu.controllers };
      }
      case 'all': {
        const [cpuD, memD, diskD, osD] = await Promise.all([
          si.cpu(), si.mem(), si.fsSize(), si.osInfo(),
        ]);
        return {
          success: true, data: {
            os: `${osD.distro} ${osD.release} (${osD.arch})`,
            cpu: `${cpuD.manufacturer} ${cpuD.brand} (${cpuD.cores} cores)`,
            memory: `${formatSize(memD.used)} / ${formatSize(memD.total)}`,
            disk: diskD.map(d => `${d.mount}: ${formatSize(d.used)}/${formatSize(d.size)} (${d.use.toFixed(0)}%)`),
          },
        };
      }
      default: { // overview
        const [cpuD, memD, osD, loadD] = await Promise.all([
          si.cpu(), si.mem(), si.osInfo(), si.currentLoad(),
        ]);
        return {
          success: true, data: {
            hostname: os.hostname(),
            os: `${osD.distro} ${osD.release}`,
            arch: osD.arch,
            cpu: `${cpuD.manufacturer} ${cpuD.brand} (${cpuD.cores} cores)`,
            cpuLoad: loadD.currentLoad.toFixed(1) + '%',
            memory: `${formatSize(memD.used)} / ${formatSize(memD.total)} (${((memD.used / memD.total) * 100).toFixed(0)}%)`,
            uptime: formatUptime(os.uptime()),
            nodeVersion: process.version,
          },
        };
      }
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function networkDiagnostics({ action, target, port }) {
  try {
    switch (action) {
      case 'ping': {
        if (!target) return { success: false, error: 'Target hostname/IP required' };
        const cmd = process.platform === 'win32' ? `ping -n 4 ${target}` : `ping -c 4 ${target}`;
        const output = safeExec(cmd, { timeout: 15000 });
        return { success: true, output };
      }
      case 'dns_lookup': {
        if (!target) return { success: false, error: 'Domain name required' };
        const results = {};
        try { results.A = await dnsResolve(target, 'A'); } catch { results.A = []; }
        try { results.AAAA = await dnsResolve(target, 'AAAA'); } catch { results.AAAA = []; }
        try { results.MX = await dnsResolve(target, 'MX'); } catch { results.MX = []; }
        try { results.NS = await dnsResolve(target, 'NS'); } catch { results.NS = []; }
        try { results.TXT = await dnsResolve(target, 'TXT'); } catch { results.TXT = []; }
        try { results.CNAME = await dnsResolve(target, 'CNAME'); } catch { results.CNAME = []; }
        return { success: true, domain: target, records: results };
      }
      case 'reverse_dns': {
        if (!target) return { success: false, error: 'IP address required' };
        const hostnames = await dnsReverse(target);
        return { success: true, ip: target, hostnames };
      }
      case 'check_port': {
        if (!target || !port) return { success: false, error: 'Target and port required' };
        return new Promise((resolve) => {
          const net = require('net');
          const socket = new net.Socket();
          socket.setTimeout(5000);
          socket.on('connect', () => { socket.destroy(); resolve({ success: true, open: true, host: target, port }); });
          socket.on('timeout', () => { socket.destroy(); resolve({ success: true, open: false, host: target, port, reason: 'timeout' }); });
          socket.on('error', (e) => { resolve({ success: true, open: false, host: target, port, reason: e.message }); });
          socket.connect(port, target);
        });
      }
      case 'public_ip': {
        const output = safeExec(process.platform === 'win32'
          ? 'Invoke-RestMethod -Uri "https://api.ipify.org?format=json"'
          : 'curl -s https://api.ipify.org?format=json', { timeout: 10000 });
        return { success: true, output };
      }
      case 'interfaces': {
        const interfaces = await si.networkInterfaces();
        return {
          success: true, interfaces: interfaces.filter(i => !i.internal).map(i => ({
            name: i.iface, ip4: i.ip4, ip6: i.ip6, mac: i.mac, type: i.type,
            speed: i.speed ? `${i.speed} Mbps` : 'N/A',
          })),
        };
      }
      case 'connections': {
        const connections = await si.networkConnections();
        return {
          success: true, connections: connections.slice(0, 30).map(c => ({
            protocol: c.protocol, localAddress: c.localAddress, localPort: c.localPort,
            peerAddress: c.peerAddress, peerPort: c.peerPort, state: c.state, process: c.process,
          })),
        };
      }
      case 'traceroute': {
        if (!target) return { success: false, error: 'Target hostname/IP required' };
        const cmd = process.platform === 'win32' ? `tracert -d -h 15 ${target}` : `traceroute -n -m 15 ${target}`;
        const output = safeExec(cmd, { timeout: 60000 });
        return { success: true, output };
      }
      case 'wifi': {
        const wifi = await si.wifiNetworks();
        return { success: true, networks: wifi.map(w => ({ ssid: w.ssid, signal: w.signalLevel, security: w.security, channel: w.channel })) };
      }
      default:
        return { success: false, error: `Unknown action: ${action}. Use: ping, dns_lookup, reverse_dns, check_port, public_ip, interfaces, connections, traceroute, wifi` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function webFetch({ url, method = 'GET', headers = {}, body }) {
  try {
    const options = { method, headers: { 'User-Agent': 'Vinsa-CLI/1.0', ...headers } };
    if (body) options.body = body;
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || '';
    let responseBody;
    if (contentType.includes('json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
      // Truncate large HTML responses
      if (responseBody.length > 10000) {
        responseBody = responseBody.slice(0, 10000) + '\n... (truncated)';
      }
    }
    return {
      success: true, status: response.status, statusText: response.statusText,
      contentType, body: responseBody,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function processManager({ action, name, pid, limit = 15 }) {
  try {
    switch (action) {
      case 'list': {
        const procs = await si.processes();
        return {
          success: true,
          total: procs.all,
          processes: procs.list.sort((a, b) => b.cpu - a.cpu).slice(0, limit).map(p => ({
            name: p.name, pid: p.pid, cpu: p.cpu.toFixed(1) + '%',
            mem: p.mem.toFixed(1) + '%', command: (p.command || '').slice(0, 80),
          })),
        };
      }
      case 'find': {
        if (!name) return { success: false, error: 'Process name required' };
        const procs = await si.processes();
        const found = procs.list.filter(p => p.name.toLowerCase().includes(name.toLowerCase()));
        return { success: true, found: found.length, processes: found.slice(0, limit).map(p => ({ name: p.name, pid: p.pid, cpu: p.cpu.toFixed(1) + '%', mem: p.mem.toFixed(1) + '%' })) };
      }
      case 'kill': {
        if (!pid) return { success: false, error: 'PID required' };
        process.kill(pid);
        return { success: true, message: `Process ${pid} killed` };
      }
      case 'top': {
        const procs = await si.processes();
        const topCPU = procs.list.sort((a, b) => b.cpu - a.cpu).slice(0, 5);
        const topMem = procs.list.sort((a, b) => b.mem - a.mem).slice(0, 5);
        return { success: true, topByCPU: topCPU.map(p => ({ name: p.name, cpu: p.cpu.toFixed(1) + '%' })), topByMemory: topMem.map(p => ({ name: p.name, mem: p.mem.toFixed(1) + '%' })) };
      }
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function codeAnalysis({ projectPath, action = 'overview' }) {
  try {
    const resolved = path.resolve(projectPath);
    if (!fs.existsSync(resolved)) return { success: false, error: 'Path not found' };

    switch (action) {
      case 'structure': {
        const result = [];
        function walk(dir, prefix = '', depth = 0) {
          if (depth > 3) return;
          const entries = fs.readdirSync(dir, { withFileTypes: true })
            .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__pycache__');
          entries.forEach((entry, i) => {
            const isLast = i === entries.length - 1;
            result.push(`${prefix}${isLast ? '└── ' : '├── '}${entry.name}${entry.isDirectory() ? '/' : ''}`);
            if (entry.isDirectory()) {
              walk(path.join(dir, entry.name), prefix + (isLast ? '    ' : '│   '), depth + 1);
            }
          });
        }
        walk(resolved);
        return { success: true, structure: result.join('\n') };
      }
      case 'dependencies': {
        const deps = {};
        const pkgPath = path.join(resolved, 'package.json');
        const reqPath = path.join(resolved, 'requirements.txt');
        const goModPath = path.join(resolved, 'go.mod');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          deps.npm = { dependencies: pkg.dependencies || {}, devDependencies: pkg.devDependencies || {} };
        }
        if (fs.existsSync(reqPath)) deps.python = fs.readFileSync(reqPath, 'utf-8').split('\n').filter(Boolean);
        if (fs.existsSync(goModPath)) deps.go = fs.readFileSync(goModPath, 'utf-8');
        return { success: true, deps };
      }
      case 'todos': {
        const todos = [];
        function walk(dir, depth = 0) {
          if (depth > 4 || todos.length > 50) return;
          const entries = fs.readdirSync(dir, { withFileTypes: true })
            .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules');
          for (const entry of entries) {
            const fp = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(fp, depth + 1); continue; }
            try {
              const content = fs.readFileSync(fp, 'utf-8');
              content.split('\n').forEach((line, i) => {
                if (/\b(TODO|FIXME|HACK|XXX|BUG)\b/i.test(line)) {
                  todos.push({ file: path.relative(resolved, fp), line: i + 1, text: line.trim().slice(0, 100) });
                }
              });
            } catch { /* skip binary */ }
          }
        }
        walk(resolved);
        return { success: true, todos };
      }
      case 'stats': {
        const stats = {};
        function walk(dir, depth = 0) {
          if (depth > 5) return;
          const entries = fs.readdirSync(dir, { withFileTypes: true })
            .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__pycache__');
          for (const entry of entries) {
            const fp = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(fp, depth + 1); continue; }
            const ext = path.extname(entry.name).toLowerCase() || 'no-ext';
            if (!stats[ext]) stats[ext] = { files: 0, lines: 0 };
            stats[ext].files++;
            try {
              const content = fs.readFileSync(fp, 'utf-8');
              stats[ext].lines += content.split('\n').length;
            } catch { /* skip binary */ }
          }
        }
        walk(resolved);
        return { success: true, stats };
      }
      default: { // overview
        const structure = await codeAnalysis({ projectPath, action: 'structure' });
        const deps = await codeAnalysis({ projectPath, action: 'dependencies' });
        const stats = await codeAnalysis({ projectPath, action: 'stats' });
        return { success: true, overview: { structure: structure.success ? structure.structure : null, deps: deps.success ? deps.deps : null, stats: stats.success ? stats.stats : null } };
      }
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ═══ Helpers ═══
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

// ═══ Git Operations Dispatcher ═══
async function gitOps(args) {
  const { action, ...rest } = args;
  if (!action) return { success: false, error: 'Git action required.' };

  // Map common params
  const params = { ...rest };
  // Map subAction to the "action" parameter expected by sub-functions
  if (rest.subAction) params.action = rest.subAction;
  // Map remote string to correct param name for push/pull
  if (typeof rest.remote === 'string' && rest.remote !== 'true' && rest.remote !== 'false') {
    // keep as-is for push/pull, convert for branch.list
  }
  if (typeof rest.remote === 'boolean' && action === 'branch') {
    params.remote = rest.remote;
  }

  const handler = gitOperations[action];
  if (!handler) {
    return { success: false, error: `Unknown git action: ${action}. Available: ${Object.keys(gitOperations).join(', ')}` };
  }

  try {
    return handler(params);
  } catch (err) {
    return { success: false, error: `Git ${action} failed: ${err.message}` };
  }
}

// ═══ Tool Executor (Maps name → function) ═══
const toolHandlers = {
  run_shell_command: runShellCommand,
  read_file: readFile,
  write_file: writeFile,
  list_directory: listDirectory,
  search_files: searchFiles,
  get_system_info: getSystemInfo,
  network_diagnostics: networkDiagnostics,
  web_fetch: webFetch,
  process_manager: processManager,
  code_analysis: codeAnalysis,
  git_operations: gitOps,
};

export async function executeTool(name, args) {
  args = args || {};
  // Run pre-hooks
  const preResult = runPreHooks(name, args);
  if (!preResult.allow) {
    return { success: false, error: preResult.reason };
  }

  const handler = toolHandlers[name];
  if (!handler) return { success: false, error: `Unknown tool: ${name}` };
  try {
    const result = await handler(args);
    // Run post-hooks
    runPostHooks(name, args, result);
    return result;
  } catch (err) {
    return { success: false, error: `Tool '${name}' failed: ${err.message}` };
  }
}
