/**
 * Vinsa CLI — Theme & UI Layer
 * Beautiful terminal output with colors, markdown, and formatting.
 */
import chalk from 'chalk';
import ora from 'ora';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

// Configure marked for terminal rendering
marked.use(markedTerminal({
  reflowText: true,
  width: 80,
  showSectionPrefix: false,
}));

// ─── Color Palette ───
export const colors = {
  brand:    chalk.hex('#7C3AED'),     // Vinsa purple
  accent:   chalk.hex('#06B6D4'),     // Cyan accent
  success:  chalk.hex('#10B981'),     // Green
  warning:  chalk.hex('#F59E0B'),     // Amber
  error:    chalk.hex('#EF4444'),     // Red
  dim:      chalk.gray,
  bold:     chalk.bold,
  code:     chalk.hex('#A78BFA'),     // Light purple for code
  tool:     chalk.hex('#FB923C'),     // Orange for tool calls
};

// ─── Branding ───
export function printBanner() {
  const purple = chalk.hex('#7C3AED');
  const violet = chalk.hex('#8B5CF6');
  const indigo = chalk.hex('#6366F1');
  const cyan   = chalk.hex('#06B6D4');
  const pink   = chalk.hex('#EC4899');
  const gold   = chalk.hex('#F59E0B');

  console.log('');
  console.log(purple.bold('  ██╗   ██╗') + violet.bold('██╗') + indigo.bold('███╗   ██╗') + cyan.bold('███████╗') + pink.bold(' █████╗ '));
  console.log(purple.bold('  ██║   ██║') + violet.bold('██║') + indigo.bold('████╗  ██║') + cyan.bold('██╔════╝') + pink.bold('██╔══██╗'));
  console.log(purple.bold('  ██║   ██║') + violet.bold('██║') + indigo.bold('██╔██╗ ██║') + cyan.bold('███████╗') + pink.bold('███████║'));
  console.log(purple.bold('  ╚██╗ ██╔╝') + violet.bold('██║') + indigo.bold('██║╚██╗██║') + cyan.bold('╚════██║') + pink.bold('██╔══██║'));
  console.log(purple.bold('   ╚████╔╝ ') + violet.bold('██║') + indigo.bold('██║ ╚████║') + cyan.bold('███████║') + pink.bold('██║  ██║'));
  console.log(purple.bold('    ╚═══╝  ') + violet.bold('╚═╝') + indigo.bold('╚═╝  ╚═══╝') + cyan.bold('╚══════╝') + pink.bold('╚═╝  ╚═╝'));
  console.log('');
  console.log(cyan('  ⚡ ') + chalk.white.bold('AI-Powered Agentic CLI') + cyan(' — ') + chalk.white('Free & Open Source'));
  console.log(colors.dim('  Groq · Llama 3.3 70B · MCP · Built-in Tools · Self-Healing Agent'));
  console.log('');
  console.log(colors.dim('  crafted by ') + gold.bold('✦ Lagishetti Vignesh ✦'));
  console.log('');
}

export function printDivider() {
  console.log(colors.dim('─'.repeat(60)));
}

// ─── Spinners ───
export function createSpinner(text = 'Thinking...') {
  return ora({
    text: colors.accent(text),
    spinner: 'dots12',
    color: 'cyan',
    discardStdin: false, // Prevent stdin-discarder from pausing stdin on Windows (breaks readline)
  });
}

// ─── Output Formatting ───
export function renderMarkdown(text) {
  try {
    return marked(text);
  } catch {
    return text;
  }
}

export function printResponse(text) {
  console.log('');
  console.log(colors.brand.bold('  Vinsa ›'));
  console.log(renderMarkdown(text));
}

export function printToolCall(toolName, args) {
  const argsStr = typeof args === 'string' ? args : JSON.stringify(args, null, 0);
  const truncated = argsStr.length > 120 ? argsStr.slice(0, 120) + '...' : argsStr;
  console.log(colors.tool(`  🔧 Using tool: ${toolName}`) + colors.dim(` (${truncated})`));
}

export function printToolResult(result) {
  const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  const lines = text.split('\n');
  const preview = lines.slice(0, 8).join('\n');
  if (lines.length > 8) {
    console.log(colors.dim(`  ┃ ${preview}\n  ┃ ... (${lines.length - 8} more lines)`));
  } else {
    console.log(colors.dim(`  ┃ ${preview}`));
  }
}

export function printError(message) {
  console.log(colors.error(`  ✖ Error: ${message}`));
}

export function printWarning(message) {
  console.log(colors.warning(`  ⚠ ${message}`));
}

export function printSuccess(message) {
  console.log(colors.success(`  ✔ ${message}`));
}

export function printInfo(message) {
  console.log(colors.accent(`  ℹ ${message}`));
}

export function printRetry(attempt, maxRetries, reason) {
  console.log(colors.warning(`  ↻ Retry ${attempt}/${maxRetries}: ${reason}`));
}

export function printPrompt() {
  return colors.brand.bold('  You › ');
}

export function printCommandBox(command) {
  const lines = command.split('\n');
  const maxLen = Math.max(...lines.map(l => l.length), 10);
  const pad = maxLen + 2;
  console.log(colors.dim('  ┌' + '─'.repeat(pad) + '┐'));
  for (const line of lines) {
    console.log(colors.dim('  │ ') + chalk.white.bold(line.padEnd(maxLen)) + colors.dim(' │'));
  }
  console.log(colors.dim('  └' + '─'.repeat(pad) + '┘'));
}

export function printCommandCard(header, command, description) {
  console.log('');
  // Header with checkmark — like VS Code's "✔ Preparing tracert command snippet"
  console.log(colors.success('  ✔  ') + colors.dim(header));
  console.log('');

  // Command box
  printCommandBox(command);

  // Description / parameter hints
  if (description) {
    console.log('');
    const descLines = description.split('\n').filter(l => l.trim());
    for (const line of descLines) {
      // Render lines starting with - or * or • as bullet points
      const trimmed = line.replace(/^\s*[-*•]\s*/, '').trim();
      if (trimmed) {
        console.log(colors.dim('  • ') + colors.dim(trimmed));
      }
    }
  }
  console.log('');
}

export function printCommandActions() {
  console.log(
    '  ' +
    chalk.bgGreen.black.bold(' Run ') + '  ' +
    chalk.bgCyan.black.bold(' Edit ') + '  ' +
    chalk.bgWhite.black.bold(' Insert ') + '  ' +
    chalk.bgWhite.black.bold(' Close ')
  );
}

export function printSystemInfo(info) {
  console.log('');
  console.log(colors.brand.bold('  System Information'));
  printDivider();
  for (const [key, value] of Object.entries(info)) {
    console.log(`  ${colors.accent(key)}: ${value}`);
  }
  printDivider();
}
