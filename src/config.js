/**
 * Vinsa CLI — Configuration Manager
 * Stores API keys and settings in the user's home directory.
 * No .env file needed for end users — they run `vinsa config set-key <key>`.
 */
import Conf from 'conf';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Load .env file (project root or cwd) so GROQ_API_KEY env var is available
dotenv.config();

// ─── Built-in Developer API Key ───
// Used by default so end-users don't need their own key.
// When all model rotations are exhausted on this key, the user is prompted for theirs.
const VINSA_DEV_KEY = '';

const config = new Conf({
  projectName: 'vinsa-cli',
  schema: {
    groqApiKey: { type: 'string', default: '' },
    defaultModel: { type: 'string', default: 'llama-3.3-70b-versatile' },
    maxRetries: { type: 'number', default: 3 },
    theme: { type: 'string', default: 'default' },
    mcpServers: { type: 'object', default: {} },
    mcpAutoSetupDone: { type: 'boolean', default: false },
    history: { type: 'array', default: [] },
    savedSessions: { type: 'object', default: {} },
    lastSession: { type: 'array', default: [] },
    planMode: { type: 'boolean', default: false },
    aliases: { type: 'object', default: {} },
    hooks: { type: 'object', default: { preToolUse: [], postToolUse: [] } },
    conversationBranches: { type: 'object', default: {} },
    activeBranch: { type: 'string', default: 'main' },
    confirmWrites: { type: 'boolean', default: false },
  },
});

export function getApiKey() {
  // Priority: env var > user stored config > built-in dev key
  return process.env.GROQ_API_KEY || config.get('groqApiKey') || VINSA_DEV_KEY;
}

/**
 * Returns true if no user-provided key exists (using the built-in dev key).
 */
export function isUsingDevKey() {
  return !process.env.GROQ_API_KEY && !config.get('groqApiKey');
}

/**
 * Returns only the user-provided key (env var or stored), or empty string.
 */
export function getUserApiKey() {
  return process.env.GROQ_API_KEY || config.get('groqApiKey') || '';
}

export function setApiKey(key) {
  config.set('groqApiKey', key);
}

export function getModel() {
  return process.env.VINSA_MODEL || config.get('defaultModel');
}

export function setModel(model) {
  config.set('defaultModel', model);
}

export function getMaxRetries() {
  return config.get('maxRetries');
}

export function getMcpServers() {
  return config.get('mcpServers') || {};
}

export function addMcpServer(name, serverConfig) {
  const servers = getMcpServers();
  servers[name] = serverConfig;
  config.set('mcpServers', servers);
}

export function removeMcpServer(name) {
  const servers = getMcpServers();
  delete servers[name];
  config.set('mcpServers', servers);
}

export function isMcpAutoSetupDone() {
  return config.get('mcpAutoSetupDone') || false;
}

export function setMcpAutoSetupDone(value = true) {
  config.set('mcpAutoSetupDone', value);
}

export function addToHistory(entry) {
  const history = config.get('history') || [];
  history.push({ ...entry, timestamp: Date.now() });
  // Keep last 100 entries
  if (history.length > 100) history.shift();
  config.set('history', history);
}

export function getHistory() {
  return config.get('history') || [];
}

export function clearHistory() {
  config.set('history', []);
}

// ─── Saved Sessions ───
export function saveSession(name, conversationHistory) {
  const sessions = config.get('savedSessions') || {};
  sessions[name] = {
    history: conversationHistory,
    savedAt: Date.now(),
    messageCount: conversationHistory.length,
  };
  config.set('savedSessions', sessions);
}

export function loadSession(name) {
  const sessions = config.get('savedSessions') || {};
  return sessions[name] || null;
}

export function listSessions() {
  return config.get('savedSessions') || {};
}

export function deleteSession(name) {
  const sessions = config.get('savedSessions') || {};
  delete sessions[name];
  config.set('savedSessions', sessions);
}

export function saveLastSession(conversationHistory) {
  config.set('lastSession', conversationHistory);
}

export function getLastSession() {
  return config.get('lastSession') || [];
}

// ─── Plan Mode ───
export function getPlanMode() {
  return config.get('planMode') || false;
}

export function setPlanMode(value) {
  config.set('planMode', value);
}

export function getConfigPath() {
  return config.path;
}

export function resetConfig() {
  config.clear();
}

// ─── Aliases ───
export function getAliases() {
  return config.get('aliases') || {};
}

export function setAlias(name, promptTemplate) {
  const aliases = getAliases();
  aliases[name] = promptTemplate;
  config.set('aliases', aliases);
}

export function removeAlias(name) {
  const aliases = getAliases();
  delete aliases[name];
  config.set('aliases', aliases);
}

export function resolveAlias(input) {
  const aliases = getAliases();
  const parts = input.split(' ');
  const cmd = parts[0].replace(/^\//, '');
  if (aliases[cmd]) {
    const rest = parts.slice(1).join(' ');
    return aliases[cmd].replace(/\$\*/g, rest).replace(/\$1/g, parts[1] || '').replace(/\$2/g, parts[2] || '');
  }
  return null;
}

// ─── Hooks ───
export function getHooks() {
  return config.get('hooks') || { preToolUse: [], postToolUse: [] };
}

export function addHook(type, hook) {
  const hooks = getHooks();
  if (!hooks[type]) hooks[type] = [];
  hooks[type].push(hook);
  config.set('hooks', hooks);
}

export function removeHook(type, index) {
  const hooks = getHooks();
  if (hooks[type] && hooks[type][index]) {
    hooks[type].splice(index, 1);
    config.set('hooks', hooks);
    return true;
  }
  return false;
}

export function clearHooks(type) {
  const hooks = getHooks();
  if (type) {
    hooks[type] = [];
  } else {
    hooks.preToolUse = [];
    hooks.postToolUse = [];
  }
  config.set('hooks', hooks);
}

// ─── Conversation Branches ───
export function getBranches() {
  return config.get('conversationBranches') || {};
}

export function saveBranch(name, history) {
  const branches = getBranches();
  branches[name] = { history, savedAt: Date.now(), messageCount: history.length };
  config.set('conversationBranches', branches);
}

export function getBranch(name) {
  const branches = getBranches();
  return branches[name] || null;
}

export function deleteBranch(name) {
  const branches = getBranches();
  delete branches[name];
  config.set('conversationBranches', branches);
}

export function getActiveBranch() {
  return config.get('activeBranch') || 'main';
}

export function setActiveBranch(name) {
  config.set('activeBranch', name);
}

// ─── Confirm Writes (Interactive Diff Preview) ───
export function getConfirmWrites() {
  return config.get('confirmWrites') || false;
}

export function setConfirmWrites(value) {
  config.set('confirmWrites', value);
}

export function showConfig() {
  const key = getApiKey();
  const maskedKey = key ? key.slice(0, 8) + '...' + key.slice(-4) : chalk.red('NOT SET');
  const sessions = listSessions();
  const aliases = getAliases();
  const branches = getBranches();
  return {
    apiKey: maskedKey,
    model: getModel(),
    maxRetries: getMaxRetries(),
    planMode: getPlanMode() ? 'ON' : 'off',
    confirmWrites: getConfirmWrites() ? 'ON' : 'off',
    activeBranch: getActiveBranch(),
    aliases: Object.keys(aliases).length,
    mcpServers: Object.keys(getMcpServers()),
    savedSessions: Object.keys(sessions).length,
    branches: Object.keys(branches).length,
    configPath: getConfigPath(),
    historyCount: getHistory().length,
  };
}

export default config;
