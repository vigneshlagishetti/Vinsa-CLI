/**
 * Vinsa CLI — Main Entry Point (src/index.js)
 * 
 * Usage:
 *   vinsa                       — Launch interactive AI shell (just type questions!)
 *   vinsa chat                  — Same as above
 *   vinsa ask <prompt>          — One-shot question (non-interactive)
 *   vinsa run <command>         — Ask AI to run & explain a system command
 *   vinsa debug                 — AI diagnoses system/network issues
 *   vinsa scan <path>           — AI analyzes a codebase
 *   vinsa config                — Manage configuration
 *   vinsa mcp                   — Manage MCP servers
 *   vinsa tools                 — List all available tools
 */
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import {
  printBanner, printResponse, printDivider, createSpinner,
  printError, printSuccess, printInfo, printWarning, colors,
  printToolCall, printToolResult, printRetry,
} from './ui.js';
import { getAgent } from './agent.js';
import { getMcpManager, MCP_PRESETS } from './mcp.js';
import {
  setApiKey, getApiKey, setModel, getModel, showConfig,
  addMcpServer, removeMcpServer, getMcpServers, getConfigPath,
  clearHistory, resetConfig, getLastSession,
} from './config.js';
import { startChat } from './chat.js';
import { executeTool, toolDefinitions } from './tools.js';

const program = new Command();

program
  .name('vinsa')
  .description(chalk.hex('#7C3AED').bold('Vinsa') + ' — AI-Powered Agentic CLI | Free & Open Source')
  .version('3.0.0', '-v, --version')
  .option('--no-color', 'Disable colored output')
  .option('--verbose', 'Show detailed tool execution logs');

// ═══════════════════════════════════════════════════
// CHAT — Interactive mode
// ═══════════════════════════════════════════════════
program
  .command('chat')
  .description('Start interactive chat with Vinsa')
  .option('--continue', 'Resume the last session')
  .action(async (options) => {
    await startChat({ continueSession: options.continue });
  });

// ═══════════════════════════════════════════════════
// ASK — One-shot question (non-interactive)
// ═══════════════════════════════════════════════════
program
  .command('ask')
  .description('Ask a one-shot question without entering the shell')
  .argument('<prompt...>', 'Your question or prompt')
  .option('--json', 'Output response as JSON (for piping/scripting)')
  .option('--output-format <format>', 'Output format: text, json, markdown (default: text)')
  .action(async (promptParts, options) => {
    const format = options.json ? 'json' : (options.outputFormat || 'text');
    await askOnce(promptParts.join(' '), format);
  });

// ═══════════════════════════════════════════════════
// RUN — Execute and explain a command
// ═══════════════════════════════════════════════════
program
  .command('run')
  .description('Ask Vinsa to run & explain a system task')
  .argument('<task...>', 'Describe what you want to do')
  .action(async (taskParts) => {
    const task = taskParts.join(' ');
    const spinner = createSpinner();

    try {
      const agent = getAgent();
      agent.initialize();
      spinner.start();

      const prompt = `The user wants you to: "${task}"\n\nPlease:\n1. Determine the appropriate shell command(s) to accomplish this\n2. Run the command using the run_shell_command tool\n3. Explain what the command does and show the output\n4. If it fails, try an alternative approach`;

      const response = await agent.ask(prompt);
      spinner.stop();
      printResponse(response);
    } catch (err) {
      spinner.stop();
      printError(err.message);
      process.exit(1);
    }
  });

// ═══════════════════════════════════════════════════
// DEBUG — AI System/Network Diagnostics
// ═══════════════════════════════════════════════════
program
  .command('debug')
  .description('Vinsa diagnoses system or network issues')
  .option('--network', 'Focus on network diagnostics')
  .option('--system', 'Focus on system diagnostics')
  .option('--full', 'Run comprehensive diagnostics')
  .action(async (options) => {
    const spinner = createSpinner('Running diagnostics...');

    try {
      const agent = getAgent();
      agent.initialize();
      spinner.start();

      let focus = 'general';
      if (options.network) focus = 'network';
      if (options.system) focus = 'system';
      if (options.full) focus = 'full';

      const prompts = {
        network: `Run comprehensive network diagnostics on this machine:
1) Get all network interfaces
2) Ping google.com and 8.8.8.8
3) Check DNS resolution for a few popular domains
4) Get the public IP address
5) Show active network connections
Report all findings clearly with any issues detected.`,

        system: `Run comprehensive system diagnostics:
1) Get full system information (OS, CPU, RAM, disk)
2) Check CPU and memory usage
3) List top processes by CPU and memory
4) Check disk space
5) Check for any concerning findings
Report all findings clearly with any issues detected.`,

        full: `Run a FULL system and network diagnostic audit:
1) Get system info (OS, CPU, RAM, disk, GPU)
2) Check CPU, memory, disk usage
3) List top processes
4) Get network interfaces
5) Ping google.com
6) Check DNS resolution
7) Get public IP
8) Show active network connections
Report all findings in a clear, structured format. Highlight any issues or warnings.`,

        general: `The user wants you to diagnose their system. Start with:
1) System overview (OS, CPU, RAM usage)
2) Network connectivity check (ping google.com)
3) DNS resolution check
Report findings and suggest fixes for any issues.`,
      };

      const response = await agent.ask(prompts[focus]);
      spinner.stop();
      printResponse(response);
    } catch (err) {
      spinner.stop();
      printError(err.message);
      process.exit(1);
    }
  });

// ═══════════════════════════════════════════════════
// SCAN — Analyze a codebase
// ═══════════════════════════════════════════════════
program
  .command('scan')
  .description('AI-powered codebase analysis')
  .argument('[path]', 'Path to project directory', '.')
  .option('--deep', 'Deep analysis including TODOs, dependencies, and stats')
  .action(async (scanPath, options) => {
    const spinner = createSpinner('Scanning codebase...');

    try {
      const agent = getAgent();
      agent.initialize();
      spinner.start();

      const depth = options.deep ? 'deep' : 'standard';
      const prompt = `Analyze the codebase at "${scanPath}":
1) Use code_analysis tool to get the project ${depth === 'deep' ? 'overview (structure, dependencies, TODOs, stats)' : 'structure'}
2) Read the README or main entry point if one exists
3) Provide a summary: what the project does, technologies used, structure overview
${depth === 'deep' ? '4) List all TODOs/FIXMEs found\n5) Analyze dependencies for anything outdated or notable\n6) Provide code quality observations' : ''}
Format the output as a clean, well-organized report.`;

      const response = await agent.ask(prompt);
      spinner.stop();
      printResponse(response);
    } catch (err) {
      spinner.stop();
      printError(err.message);
      process.exit(1);
    }
  });

// ═══════════════════════════════════════════════════
// CONFIG — Configuration management
// ═══════════════════════════════════════════════════
const configCmd = program
  .command('config')
  .description('Manage Vinsa configuration');

configCmd
  .command('set-key')
  .description('Set your Groq API key (stored locally, never uploaded)')
  .argument('<key>', 'Your Groq API key')
  .action((key) => {
    setApiKey(key);
    printSuccess('API key saved securely');
    printInfo(`Config location: ${getConfigPath()}`);
  });

configCmd
  .command('set-model')
  .description('Set the AI model to use')
  .argument('<model>', 'Model name (e.g., llama-3.3-70b-versatile, mixtral-8x7b-32768, llama-3.1-8b-instant)')
  .action((model) => {
    setModel(model);
    printSuccess(`Model set to: ${model}`);
  });

configCmd
  .command('show')
  .description('Show current configuration')
  .action(() => {
    const cfg = showConfig();
    console.log('');
    console.log(colors.brand.bold('  Vinsa Configuration'));
    printDivider();
    for (const [key, value] of Object.entries(cfg)) {
      const display = Array.isArray(value) ? value.join(', ') || '(none)' : value;
      console.log(`  ${colors.accent(key.padEnd(15))} ${display}`);
    }
    printDivider();
  });

configCmd
  .command('reset')
  .description('Reset all configuration to defaults')
  .action(() => {
    resetConfig();
    printSuccess('Configuration reset to defaults');
  });

configCmd
  .command('path')
  .description('Show config file location')
  .action(() => {
    console.log(getConfigPath());
  });

// ═══════════════════════════════════════════════════
// MCP — MCP Server management
// ═══════════════════════════════════════════════════
const mcpCmd = program
  .command('mcp')
  .description('Manage MCP (Model Context Protocol) servers');

mcpCmd
  .command('add')
  .description('Add an MCP server (use a preset name or custom config)')
  .argument('<name>', 'Preset name (e.g., playwright, brave-search) OR custom server name')
  .option('--key <value>', 'API key or token (for presets that need one)')
  .option('--paths <paths>', 'Comma-separated paths (for filesystem preset)')
  .option('--command <cmd>', 'Custom command (for stdio transport)')
  .option('--args <args>', 'Comma-separated arguments for --command')
  .option('--url <url>', 'SSE endpoint URL (for sse transport)')
  .action((name, options) => {
    let config;
    const preset = MCP_PRESETS[name];

    if (preset) {
      // ── Preset-based setup ──
      if (preset.needsKey && !options.key) {
        printError(`"${name}" requires --key <${preset.keyName}>`);
        if (preset.keyUrl) {
          printInfo(`Get your key at: ${preset.keyUrl}`);
        }
        printInfo(`Usage: vinsa mcp add ${name} --key YOUR_${preset.keyName}`);
        return;
      }

      if (preset.config) {
        // Static config preset (memory, sequential-thinking, playwright, fetch, pdf)
        config = preset.config;
      } else if (preset.getConfig) {
        // Dynamic config — pass key/paths etc.
        if (name === 'filesystem') {
          const paths = options.paths ? options.paths.split(',') : [process.env.HOME || process.env.USERPROFILE || '.'];
          config = preset.getConfig(paths);
        } else if (name === 'slack') {
          // Slack needs bot token + optional team ID
          config = preset.getConfig(options.key);
        } else {
          config = preset.getConfig(options.key);
        }
      }

      addMcpServer(name, config);
      printSuccess(`MCP server '${preset.label}' added`);
      if (preset.needsKey) {
        printInfo(`${preset.keyName} configured`);
      }
    } else if (options.command) {
      // ── Custom stdio server ──
      config = {
        transport: 'stdio',
        command: options.command,
        args: options.args ? options.args.split(',') : [],
      };
      addMcpServer(name, config);
      printSuccess(`Custom MCP server '${name}' added`);
    } else if (options.url) {
      // ── Custom SSE server ──
      config = { transport: 'sse', url: options.url };
      addMcpServer(name, config);
      printSuccess(`Custom MCP server '${name}' (SSE) added`);
    } else {
      // ── Unknown name, show help ──
      const presetNames = Object.keys(MCP_PRESETS).filter(k => MCP_PRESETS[k].category === 'preset');
      printError(`Unknown preset "${name}".`);
      console.log('');
      console.log(colors.accent('  Available presets:'));
      for (const pName of presetNames) {
        const p = MCP_PRESETS[pName];
        const tag = p.needsKey ? colors.dim(`[needs ${p.keyName}]`) : chalk.green('[free]');
        console.log(`    ${colors.tool(pName.padEnd(22))} ${p.description}  ${tag}`);
      }
      console.log('');
      console.log(colors.dim('  Or add a custom server:'));
      console.log(colors.dim('    vinsa mcp add myserver --command "npx" --args "-y,some-mcp-pkg"'));
      console.log(colors.dim('    vinsa mcp add myserver --url "http://localhost:3001/sse"'));
      return;
    }

    printInfo('It will connect automatically on next chat start');
  });

mcpCmd
  .command('remove')
  .description('Remove an MCP server')
  .argument('<name>', 'Server name')
  .action((name) => {
    removeMcpServer(name);
    printSuccess(`MCP server '${name}' removed`);
  });

mcpCmd
  .command('list')
  .description('List configured MCP servers and available presets')
  .action(() => {
    const servers = getMcpServers();
    const entries = Object.entries(servers);

    // ── Configured servers ──
    console.log('');
    console.log(colors.brand.bold('  Configured MCP Servers'));
    printDivider();
    if (entries.length === 0) {
      console.log(colors.dim('  No MCP servers configured yet.'));
      console.log(colors.dim('  Run `vinsa` once to auto-install defaults, or add manually below.'));
    } else {
      for (const [name, cfg] of entries) {
        const preset = MCP_PRESETS[name];
        const label = preset ? preset.label : name;
        console.log(`  ${chalk.green('●')} ${colors.accent(label.padEnd(22))} ${colors.dim(cfg.transport)} → ${colors.dim(cfg.command || cfg.url)}`);
      }
    }
    printDivider();

    // ── Available presets ──
    const availablePresets = Object.entries(MCP_PRESETS).filter(
      ([key]) => key !== 'filesystem' && key !== 'memory' && key !== 'sequential-thinking' && !servers[key]
    );

    if (availablePresets.length > 0) {
      console.log('');
      console.log(colors.brand.bold('  Available Presets (add with: vinsa mcp add <name>)'));
      printDivider();
      for (const [pName, p] of availablePresets) {
        const tag = p.needsKey ? colors.dim(`[needs --key ${p.keyName}]`) : chalk.green('[free]');
        console.log(`  ${colors.tool(pName.padEnd(22))} ${p.description}  ${tag}`);
      }
      printDivider();
    }
  });

// ═══════════════════════════════════════════════════
// TOOLS — List all available tools
// ═══════════════════════════════════════════════════
program
  .command('tools')
  .description('List all available tools Vinsa can use')
  .action(() => {
    console.log('');
    console.log(colors.brand.bold('  Vinsa Built-in Tools'));
    printDivider();
    for (const tool of toolDefinitions) {
      console.log(`  ${colors.tool(tool.name.padEnd(25))} ${tool.description.slice(0, 80)}`);
    }
    console.log('');
    console.log(colors.dim('  + Any tools from connected MCP servers'));
    printDivider();
  });

// ═══════════════════════════════════════════════════
// REVIEW — AI-powered code review on git diff
// ═══════════════════════════════════════════════════
program
  .command('review')
  .description('AI-powered code review on staged/unstaged changes')
  .option('--staged', 'Review only staged changes')
  .option('--file <path>', 'Review a specific file')
  .action(async (options) => {
    const spinner = createSpinner('Analyzing code...');
    try {
      let diff;
      if (options.file) {
        const filePath = path.resolve(options.file);
        if (!fs.existsSync(filePath)) {
          printError(`File not found: ${filePath}`);
          process.exit(1);
        }
        diff = fs.readFileSync(filePath, 'utf-8');
      } else {
        const { execSync } = await import('child_process');
        try {
          diff = options.staged
            ? execSync('git diff --staged', { encoding: 'utf-8' }).trim()
            : execSync('git diff --staged', { encoding: 'utf-8' }).trim() ||
              execSync('git diff', { encoding: 'utf-8' }).trim();
        } catch {
          printError('Not a git repository or git is not installed.');
          process.exit(1);
        }
        if (!diff) {
          printWarning('No changes detected. Stage files with `git add` first.');
          process.exit(0);
        }
      }

      const truncated = diff.length > 8000 ? diff.slice(0, 8000) + '\n... (truncated)' : diff;
      const agent = getAgent();
      agent.initialize();
      spinner.start();

      const prompt = `Please perform a thorough code review of the following changes. For each issue found, provide:

1. **Severity** (critical/warning/suggestion)
2. **Location** (file and line if visible)
3. **Issue** (what's wrong)
4. **Fix** (how to fix it)

Also provide:
- Overall quality assessment (1-10)
- Summary of what the changes do
- Any security concerns
- Performance considerations

\`\`\`diff
${truncated}
\`\`\`

Be specific and actionable. Focus on bugs, security, and performance first.`;

      const response = await agent.ask(prompt);
      spinner.stop();
      printResponse(response);
    } catch (err) {
      spinner.stop();
      printError(err.message);
      process.exit(1);
    }
  });

// ═══════════════════════════════════════════════════
// INIT — AI-powered project scaffolding
// ═══════════════════════════════════════════════════
program
  .command('init')
  .description('AI-powered project scaffolding')
  .argument('[type]', 'Project type (e.g., node-api, react-app, python-cli, express, fastapi)')
  .option('--name <name>', 'Project name')
  .action(async (type, options) => {
    const projectType = type || 'node-app';
    const projectName = options.name || `my-${projectType}`;
    const spinner = createSpinner(`Scaffolding ${projectType} project...`);

    try {
      const agent = getAgent();
      agent.initialize();
      spinner.start();

      const prompt = `Create a ${projectType} project called "${projectName}" in the current directory.

Requirements:
1. Create the project directory "${projectName}/"
2. Generate ALL essential files (package.json/requirements.txt, entry point, config, README, .gitignore)
3. Use modern best practices and latest stable versions
4. Include a working "hello world" example
5. Add helpful comments
6. Initialize git if available

Use the write_file and run_shell_command tools to create everything.
After creating files, show the project structure and how to get started.`;

      const response = await agent.ask(prompt);
      spinner.stop();
      printResponse(response);
    } catch (err) {
      spinner.stop();
      printError(err.message);
      process.exit(1);
    }
  });

// ═══════════════════════════════════════════════════
// WATCH — File watcher that triggers AI on change
// ═══════════════════════════════════════════════════
program
  .command('watch')
  .description('Watch files and trigger AI on changes')
  .argument('<glob>', 'File or directory to watch')
  .option('--on-change <instruction>', 'What to do when files change', 'Analyze the changes and suggest improvements')
  .option('--debounce <ms>', 'Debounce delay in ms', '2000')
  .action(async (glob, options) => {
    const watchPath = path.resolve(glob);
    if (!fs.existsSync(watchPath)) {
      printError(`Path not found: ${watchPath}`);
      process.exit(1);
    }

    const agent = getAgent();
    agent.initialize();

    printSuccess(`Watching: ${watchPath}`);
    printInfo(`On change: ${options.onChange}`);
    printInfo('Press Ctrl+C to stop.\n');

    let debounceTimer = null;
    const debounceMs = parseInt(options.debounce) || 2000;

    const watcher = fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      // Skip node_modules, .git, etc.
      if (filename.includes('node_modules') || filename.includes('.git')) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const filePath = path.join(watchPath, filename);
        console.log(colors.accent(`\n  📝 Changed: ${filename} (${eventType})`));

        const spinner = createSpinner('Analyzing change...');
        spinner.start();
        try {
          let fileContent = '';
          try {
            if (fs.existsSync(filePath) && fs.statSync(filePath).size < 50000) {
              fileContent = fs.readFileSync(filePath, 'utf-8');
            }
          } catch { /* skip */ }

          const prompt = `File "${filename}" was just ${eventType === 'rename' ? 'created/deleted' : 'modified'}.${fileContent ? `\n\nCurrent content:\n\`\`\`\n${fileContent.slice(0, 4000)}\n\`\`\`` : ''}\n\n${options.onChange}`;

          const response = await agent.ask(prompt, { silent: false });
          spinner.stop();
          printResponse(response);
        } catch (err) {
          spinner.stop();
          printError(err.message);
        }
      }, debounceMs);
    });

    // Keep process alive
    process.on('SIGINT', () => {
      watcher.close();
      printInfo('\nWatch mode stopped.');
      process.exit(0);
    });

    // Keep event loop running
    await new Promise(() => {});
  });

// ═══════════════════════════════════════════════════
// SERVE — HTTP API server
// ═══════════════════════════════════════════════════
program
  .command('serve')
  .description('Start Vinsa as an HTTP API server')
  .option('--port <port>', 'Port number', '3141')
  .action(async (options) => {
    try {
      const { startServer } = await import('./server.js');
      startServer({ port: parseInt(options.port) || 3141 });
    } catch (err) {
      printError(`Server failed: ${err.message}`);
      process.exit(1);
    }
  });

// ═══════════════════════════════════════════════════
// GIT — Full Git source control
// ═══════════════════════════════════════════════════
const gitCmd = program
  .command('git')
  .description('Git source control — manage repos directly through Vinsa');

gitCmd
  .command('status')
  .description('Show working tree status')
  .action(async () => {
    const { gitStatus } = await import('./git.js');
    const result = gitStatus();
    if (!result.success) { printError(result.error); return; }
    console.log(colors.brand.bold('\n  Git Status'));
    printDivider();
    console.log(`  Branch: ${colors.accent(result.branch)}${result.tracking ? colors.dim(` → ${result.tracking}`) : ''}`);
    if (result.ahead || result.behind) console.log(`  ${result.ahead ? colors.success(`↑${result.ahead}`) : ''} ${result.behind ? colors.error(`↓${result.behind}`) : ''}`);
    if (result.lastCommit) console.log(`  Last: ${colors.dim(result.lastCommit)}`);
    if (result.staged.length) { console.log(colors.success('\n  Staged:')); result.staged.forEach(f => console.log(colors.success(`    ✔ ${f.status.padEnd(10)} ${f.file}`))); }
    if (result.unstaged.length) { console.log(colors.error('\n  Unstaged:')); result.unstaged.forEach(f => console.log(colors.error(`    ✖ ${f.status.padEnd(10)} ${f.file}`))); }
    if (result.untracked.length) { console.log(colors.dim('\n  Untracked:')); result.untracked.forEach(f => console.log(colors.dim(`    ? ${f}`))); }
    if (result.conflicts.length) { console.log(colors.error.bold('\n  Conflicts:')); result.conflicts.forEach(f => console.log(colors.error(`    ⚡ ${f.file}`))); }
    if (result.clean) console.log(colors.success('\n  ✔ Working tree clean'));
    printDivider();
  });

gitCmd
  .command('log')
  .description('Show commit log')
  .option('-n, --count <n>', 'Number of commits', '20')
  .option('--graph', 'Show ASCII graph')
  .option('--oneline', 'One-line format')
  .option('--all', 'All branches')
  .option('--author <name>', 'Filter by author')
  .option('--since <date>', 'Commits since date')
  .action(async (options) => {
    const { gitLog } = await import('./git.js');
    const result = gitLog({ count: parseInt(options.count), graph: options.graph, oneline: options.oneline, all: options.all, author: options.author, since: options.since });
    if (!result.success) { printError(result.error); return; }
    console.log(colors.brand.bold('\n  Git Log'));
    printDivider();
    if (result.log) { result.log.split('\n').slice(0, 50).forEach(l => console.log(`  ${l}`)); }
    else if (result.commits) { result.commits.forEach(c => console.log(`  ${colors.accent(c.shortHash)} ${c.message} ${colors.dim(`— ${c.author}, ${c.date}`)}`)); }
    printDivider();
  });

gitCmd
  .command('add')
  .description('Stage files — vinsa git add <files...> | vinsa git add --all')
  .argument('[files...]', 'Files to stage')
  .option('-A, --all', 'Stage all changes')
  .action(async (files, options) => {
    const { gitAdd } = await import('./git.js');
    const result = gitAdd({ files: files.length ? files : undefined, all: options.all || files.length === 0 });
    if (result.success) printSuccess(result.message);
    else printError(result.error);
  });

gitCmd
  .command('commit')
  .description('Commit staged changes')
  .option('-m, --message <msg>', 'Commit message')
  .option('-a, --all', 'Auto-stage tracked files')
  .option('--amend', 'Amend last commit')
  .option('--ai', 'Generate AI commit message (default if no -m)')
  .action(async (options) => {
    if (options.message) {
      const { gitCommit } = await import('./git.js');
      const result = gitCommit({ message: options.message, all: options.all, amend: options.amend });
      if (result.success) printSuccess(`Committed: ${result.commitHash} — ${options.message}`);
      else printError(result.error);
    } else {
      // AI commit message
      const spinner = createSpinner('Generating AI commit message...');
      spinner.start();
      try {
        const { execSync } = await import('child_process');
        let diff = execSync('git diff --staged', { encoding: 'utf-8', timeout: 10000 }).trim();
        if (!diff) {
          diff = execSync('git diff', { encoding: 'utf-8', timeout: 10000 }).trim();
          if (!diff) { spinner.stop(); printWarning('No changes. Stage files first.'); return; }
          execSync('git add -A', { encoding: 'utf-8' });
        }
        const truncDiff = diff.length > 4000 ? diff.slice(0, 4000) + '\n...(truncated)' : diff;
        const agent = getAgent();
        agent.initialize();
        const msg = await agent.run(`Generate a concise conventional commit message for:\n\`\`\`\n${truncDiff}\n\`\`\`\nRespond with ONLY the commit message. One line, max 72 chars. Format: type(scope): description`, {});
        spinner.stop();
        const commitMsg = msg.trim().replace(/^["']|["']$/g, '').split('\n')[0];
        printInfo(`AI Commit: ${commitMsg}`);
        const { gitCommit } = await import('./git.js');
        const result = gitCommit({ message: commitMsg, all: options.all, amend: options.amend });
        if (result.success) printSuccess(`Committed: ${result.commitHash}`);
        else printError(result.error);
      } catch (err) { spinner.stop(); printError(err.message); }
    }
  });

gitCmd
  .command('push')
  .description('Push to remote')
  .argument('[remote]', 'Remote name', 'origin')
  .argument('[branch]', 'Branch name')
  .option('-f, --force', 'Force push')
  .option('-u, --set-upstream', 'Set upstream')
  .option('--tags', 'Push tags')
  .action(async (remote, branch, options) => {
    const spinner = createSpinner('Pushing...');
    spinner.start();
    const { gitPush } = await import('./git.js');
    const result = gitPush({ remote, branch, force: options.force, setUpstream: options.setUpstream, tags: options.tags });
    spinner.stop();
    if (result.success) printSuccess(result.message);
    else printError(result.error);
  });

gitCmd
  .command('pull')
  .description('Pull from remote')
  .argument('[remote]', 'Remote name', 'origin')
  .argument('[branch]', 'Branch name')
  .option('--rebase', 'Pull with rebase')
  .action(async (remote, branch, options) => {
    const spinner = createSpinner('Pulling...');
    spinner.start();
    const { gitPull } = await import('./git.js');
    const result = gitPull({ remote, branch, rebase: options.rebase });
    spinner.stop();
    if (result.success) printSuccess(result.message);
    else printError(result.error);
  });

gitCmd
  .command('branch')
  .description('Branch management')
  .argument('[action]', 'list|create|delete|rename|checkout')
  .argument('[name]', 'Branch name')
  .argument('[newName]', 'New name (for rename)')
  .option('-r, --remote', 'Include remote branches')
  .action(async (action, name, newName, options) => {
    const { gitBranch } = await import('./git.js');
    const result = gitBranch({ action: action || 'list', name, newName, remote: options.remote });
    if (!result.success) { printError(result.error); return; }
    if (result.branches) {
      console.log(colors.brand.bold('\n  Git Branches'));
      printDivider();
      for (const b of result.branches) {
        const isCurrent = b.name === result.current;
        console.log(`  ${isCurrent ? colors.success('* ') : '  '}${isCurrent ? colors.accent(b.name) : b.name} ${colors.dim(b.hash)}`);
      }
      printDivider();
    } else {
      printSuccess(result.message);
    }
  });

gitCmd
  .command('merge')
  .description('Merge a branch')
  .argument('[branch]', 'Branch to merge')
  .option('--squash', 'Squash merge')
  .option('--no-ff', 'No fast-forward')
  .option('--abort', 'Abort current merge')
  .action(async (branch, options) => {
    const { gitMerge } = await import('./git.js');
    const result = gitMerge({ branch, squash: options.squash, noFf: options.noFf, abort: options.abort });
    if (result.success) printSuccess(result.message);
    else printError(result.error);
  });

gitCmd
  .command('stash')
  .description('Stash operations')
  .argument('[action]', 'save|list|pop|apply|drop|clear|show', 'list')
  .argument('[args...]', 'Stash message or index')
  .action(async (action, args) => {
    const { gitStash } = await import('./git.js');
    const params = { action };
    if ((action === 'save' || action === 'push') && args.length) params.message = args.join(' ');
    if (['pop', 'apply', 'drop', 'show'].includes(action) && args[0]) params.index = parseInt(args[0]);
    const result = gitStash(params);
    if (!result.success) { printError(result.error); return; }
    if (result.stashes) {
      console.log(colors.brand.bold('\n  Git Stash'));
      printDivider();
      if (result.stashes.length === 0) console.log(colors.dim('  No stashes.'));
      else result.stashes.forEach(s => console.log(`  ${colors.accent(s.ref)} ${s.description}`));
      printDivider();
    } else if (result.diff) {
      printDivider(); console.log(result.diff.slice(0, 3000)); printDivider();
    } else {
      printSuccess(result.message);
    }
  });

gitCmd
  .command('diff')
  .description('Show changes')
  .option('--staged', 'Show staged changes')
  .option('--stat', 'Show stats only')
  .option('--name-only', 'Show file names only')
  .argument('[file]', 'Specific file')
  .action(async (file, options) => {
    const { gitDiff } = await import('./git.js');
    const result = gitDiff({ staged: options.staged, stat: options.stat, nameOnly: options.nameOnly, file });
    if (!result.success) { printError(result.error); return; }
    if (!result.diff) { printInfo('No changes.'); return; }
    const lines = result.diff.split('\n');
    printDivider();
    for (const line of lines.slice(0, 80)) {
      if (line.startsWith('+') && !line.startsWith('+++')) console.log(colors.success(`  ${line}`));
      else if (line.startsWith('-') && !line.startsWith('---')) console.log(colors.error(`  ${line}`));
      else if (line.startsWith('@@')) console.log(colors.accent(`  ${line}`));
      else console.log(colors.dim(`  ${line}`));
    }
    if (lines.length > 80) console.log(colors.dim(`  ... ${lines.length - 80} more lines`));
    printDivider();
  });

gitCmd
  .command('tag')
  .description('Tag management')
  .argument('[action]', 'list|create|delete', 'list')
  .argument('[name]', 'Tag name')
  .argument('[message...]', 'Tag message')
  .action(async (action, name, message) => {
    const { gitTag } = await import('./git.js');
    const result = gitTag({ action, name, message: message?.join(' ') || undefined });
    if (!result.success) { printError(result.error); return; }
    if (result.tags) {
      console.log(colors.brand.bold('\n  Git Tags'));
      printDivider();
      if (result.tags.length === 0) console.log(colors.dim('  No tags.'));
      else result.tags.forEach(t => console.log(`  ${colors.accent(t.name)} ${colors.dim(t.message)}`));
      printDivider();
    } else {
      printSuccess(result.message);
    }
  });

gitCmd
  .command('remote')
  .description('Remote management')
  .argument('[action]', 'list|add|remove|set-url', 'list')
  .argument('[name]', 'Remote name')
  .argument('[url]', 'Remote URL')
  .action(async (action, name, url) => {
    const { gitRemote } = await import('./git.js');
    const result = gitRemote({ action, name, url });
    if (!result.success) { printError(result.error); return; }
    if (result.remotes) {
      console.log(colors.brand.bold('\n  Git Remotes'));
      printDivider();
      if (result.remotes.length === 0) console.log(colors.dim('  No remotes.'));
      else result.remotes.forEach(r => console.log(`  ${colors.accent(r.name.padEnd(15))} ${r.fetchUrl}`));
      printDivider();
    } else {
      printSuccess(result.message);
    }
  });

gitCmd
  .command('blame')
  .description('Show who changed each line')
  .argument('<file>', 'File path')
  .option('-L, --lines <range>', 'Line range (start,end)')
  .action(async (file, options) => {
    const { gitBlame } = await import('./git.js');
    let startLine, endLine;
    if (options.lines) { const p = options.lines.split(','); startLine = parseInt(p[0]); endLine = parseInt(p[1]); }
    const result = gitBlame({ file, startLine, endLine });
    if (!result.success) { printError(result.error); return; }
    printDivider();
    result.blame.split('\n').slice(0, 50).forEach(l => console.log(colors.dim(`  ${l}`)));
    printDivider();
  });

gitCmd
  .command('clone')
  .description('Clone a repository')
  .argument('<url>', 'Repository URL')
  .argument('[directory]', 'Target directory')
  .option('-b, --branch <branch>', 'Clone specific branch')
  .option('--depth <n>', 'Shallow clone depth')
  .action(async (url, directory, options) => {
    const spinner = createSpinner('Cloning...');
    spinner.start();
    const { gitClone } = await import('./git.js');
    const result = gitClone({ url, directory, branch: options.branch, depth: options.depth ? parseInt(options.depth) : undefined });
    spinner.stop();
    if (result.success) printSuccess(result.message);
    else printError(result.error);
  });

gitCmd
  .command('info')
  .description('Show comprehensive repository information')
  .action(async () => {
    const { gitRepoInfo } = await import('./git.js');
    const result = gitRepoInfo();
    if (!result.success) { printError(result.error); return; }
    console.log(colors.brand.bold('\n  Repository Info'));
    printDivider();
    console.log(`  Root:         ${colors.accent(result.root)}`);
    console.log(`  Branch:       ${colors.accent(result.branch)}`);
    if (result.remoteUrl) console.log(`  Remote:       ${colors.dim(result.remoteUrl)}`);
    console.log(`  Commits:      ${result.commitCount}`);
    console.log(`  Branches:     ${result.branchCount}`);
    console.log(`  Tags:         ${result.tagCount}${result.lastTag ? ` (latest: ${colors.accent(result.lastTag)})` : ''}`);
    if (result.contributors.length) {
      console.log(colors.accent('\n  Contributors:'));
      result.contributors.slice(0, 10).forEach(c => console.log(`    ${colors.dim(String(c.commits).padStart(5))} ${c.name} ${colors.dim(`<${c.email}>`)}`));
    }
    printDivider();
  });

// ═══════════════════════════════════════════════════
// DEFAULT — No subcommand = launch interactive shell
// (with stdin pipe detection)
// ═══════════════════════════════════════════════════
program
  .option('--continue', 'Resume the last session')
  .action(async (options) => {
    // ── Stdin Pipe Detection ──
    // If stdin is piped (not a TTY), read from pipe and send as one-shot
    if (!process.stdin.isTTY) {
      let pipeData = '';
      for await (const chunk of process.stdin) {
        pipeData += chunk;
      }
      pipeData = pipeData.trim();
      if (pipeData) {
        await askOnce(pipeData, 'text');
        return;
      }
    }
    await startChat({ continueSession: options.continue });
  });

/**
 * One-shot question handler (used by `vinsa ask <question>`)
 * @param {string} prompt - The question
 * @param {string} format - Output format: 'text', 'json', 'markdown'
 */
async function askOnce(prompt, format = 'text') {
  const isJson = format === 'json';
  const spinner = isJson ? null : createSpinner('Vinsa is thinking...');

  try {
    const agent = getAgent();
    agent.initialize();
    if (spinner) spinner.start();

    const response = await agent.ask(prompt, { silent: isJson });
    if (spinner) spinner.stop();

    if (isJson) {
      // JSON output for piping/scripting/CI
      const stats = agent.getStats();
      const output = {
        success: true,
        prompt,
        response,
        model: getModel(),
        stats: {
          promptTokens: stats.promptTokens,
          completionTokens: stats.completionTokens,
          totalTokens: stats.totalTokens,
          duration: stats.sessionDuration,
        },
      };
      process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    } else if (format === 'markdown') {
      // Raw markdown output (no colors, no UI)
      process.stdout.write(response + '\n');
    } else {
      // Default: styled terminal output
      printResponse(response);
    }
  } catch (err) {
    if (spinner) spinner.stop();

    if (isJson) {
      process.stdout.write(JSON.stringify({ success: false, error: err.message }) + '\n');
    } else {
      if (err.message.includes('DEV_KEY_EXHAUSTED')) {
        printWarning('The built-in API key has hit its limit across all models.');
        printInfo('To continue, provide your own free Groq API key:');
        printInfo('  1. Get a key at: https://console.groq.com/keys');
        printInfo('  2. Run: vinsa config set-key YOUR_API_KEY');
      } else {
        printError(err.message);
        if (err.message.includes('API key')) {
          printInfo('Get your FREE key at: https://console.groq.com/keys');
          printInfo('Then run: vinsa config set-key YOUR_API_KEY');
        }
      }
    }
    process.exit(1);
  }
}

export { program };
