/**
 * Vinsa CLI — Plugin System
 * 
 * Drop .js files in ~/.vinsa/plugins/ → auto-loaded as custom tools.
 * Each plugin exports: { name, description, parameters, execute }
 * 
 * Example plugin (~/.vinsa/plugins/my-tool.js):
 * 
 *   export default {
 *     name: 'my_custom_tool',
 *     description: 'Does something cool',
 *     parameters: {
 *       type: 'object',
 *       properties: {
 *         input: { type: 'string', description: 'Input text' },
 *       },
 *       required: ['input'],
 *     },
 *     async execute(args) {
 *       return { success: true, result: `Processed: ${args.input}` };
 *     },
 *   };
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { printInfo, printWarning, printSuccess, colors } from './ui.js';

const PLUGINS_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.vinsa',
  'plugins'
);

// Loaded plugin tool definitions + their execute functions
const pluginTools = [];        // { name, description, parameters }
const pluginHandlers = {};     // name → execute function

/**
 * Ensure the plugins directory exists
 */
export function ensurePluginsDir() {
  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  }
  return PLUGINS_DIR;
}

/**
 * Load all plugins from ~/.vinsa/plugins/
 * Returns array of tool definitions
 */
export async function loadPlugins({ silent = false } = {}) {
  pluginTools.length = 0;
  for (const key of Object.keys(pluginHandlers)) delete pluginHandlers[key];

  ensurePluginsDir();

  const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js'));
  
  if (files.length === 0) return [];

  for (const file of files) {
    const filePath = path.join(PLUGINS_DIR, file);
    try {
      const fileUrl = pathToFileURL(filePath).href;
      const mod = await import(fileUrl);
      const plugin = mod.default || mod;

      // Validate plugin structure
      if (!plugin.name || !plugin.execute) {
        if (!silent) printWarning(`Plugin ${file}: missing 'name' or 'execute'. Skipped.`);
        continue;
      }

      const toolDef = {
        name: `plugin_${plugin.name}`,
        description: plugin.description || `Custom plugin: ${plugin.name}`,
        parameters: plugin.parameters || { type: 'object', properties: {}, required: [] },
      };

      pluginTools.push(toolDef);
      pluginHandlers[toolDef.name] = plugin.execute;

      if (!silent) printSuccess(`Plugin loaded: ${plugin.name} (${file})`);
    } catch (err) {
      if (!silent) printWarning(`Plugin ${file} failed to load: ${err.message}`);
    }
  }

  return pluginTools;
}

/**
 * Execute a plugin tool by name
 */
export async function executePlugin(toolName, args) {
  const handler = pluginHandlers[toolName];
  if (!handler) {
    return { success: false, error: `Plugin not found: ${toolName}` };
  }
  try {
    return await handler(args);
  } catch (err) {
    return { success: false, error: `Plugin '${toolName}' failed: ${err.message}` };
  }
}

/**
 * Check if a tool name is a plugin
 */
export function isPluginTool(toolName) {
  return toolName.startsWith('plugin_') && pluginHandlers[toolName];
}

/**
 * Get all loaded plugin tool definitions
 */
export function getPluginTools() {
  return [...pluginTools];
}

/**
 * Get the plugins directory path
 */
export function getPluginsDir() {
  return PLUGINS_DIR;
}

/**
 * List all plugin files (loaded or not)
 */
export function listPluginFiles() {
  ensurePluginsDir();
  return fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js'));
}
