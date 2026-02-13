/**
 * Vinsa CLI — MCP (Model Context Protocol) Client
 * 
 * Connects Vinsa to external MCP servers, making it a "universal plug".
 * Auto-configures powerful defaults on first run — zero manual setup.
 * 
 * Auto-installed (no API keys):
 *  - Filesystem: read/write/search files on your machine
 *  - Memory: persistent knowledge graph across sessions
 *  - Sequential Thinking: step-by-step reasoning for complex problems
 * 
 * Easy-add presets (one command):
 *  - Playwright: browser automation, screenshots, scraping (Microsoft)
 *  - Brave Search: web search with AI summaries
 *  - GitHub: repos, issues, PRs, actions (official, Docker-based)
 *  - Fetch: HTTP requests via MCP
 *  - PostgreSQL: database queries
 *  - Slack: team messaging
 *  - Google Maps: location services
 *  - GitLab: repos/issues/MRs
 * 
 * Users can also add any custom MCP server.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { getMcpServers, addMcpServer, removeMcpServer, isMcpAutoSetupDone, setMcpAutoSetupDone } from './config.js';
import { printInfo, printError, printSuccess, printWarning, colors } from './ui.js';

class MCPManager {
  constructor() {
    this.clients = new Map();         // name → MCP Client
    this.serverTools = new Map();     // name → tools[]
    this.toolToServer = new Map();    // toolName → serverName
  }

  /**
   * Connect to all configured MCP servers
   */
  async connectAll() {
    const servers = getMcpServers();
    const results = [];

    for (const [name, config] of Object.entries(servers)) {
      try {
        await this.connect(name, config);
        results.push({ name, status: 'connected' });
      } catch (err) {
        results.push({ name, status: 'failed', error: err.message });
        // Silent warning — MCP is optional, don't scare the user
        printWarning(`MCP '${name}' unavailable (will retry next time)`);
      }
    }

    return results;
  }

  /**
   * Connect to a single MCP server
   */
  async connect(name, config) {
    let transport;

    if (config.transport === 'stdio') {
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: { ...process.env, ...config.env },
      });
    } else if (config.transport === 'sse') {
      transport = new SSEClientTransport(new URL(config.url));
    } else {
      throw new Error(`Unknown transport: ${config.transport}. Use 'stdio' or 'sse'.`);
    }

    const client = new Client({
      name: `vinsa-cli-${name}`,
      version: '1.0.0',
    }, {
      capabilities: {},
    });

    await client.connect(transport);
    this.clients.set(name, client);

    // Discover tools from this server
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools || [];

    this.serverTools.set(name, tools);
    for (const tool of tools) {
      // Prefix tool names with server name to avoid conflicts
      const prefixedName = `mcp_${name}_${tool.name}`;
      this.toolToServer.set(prefixedName, { serverName: name, originalName: tool.name });
    }

    printSuccess(`MCP server '${name}' connected (${tools.length} tools)`);
    return tools;
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(name) {
    const client = this.clients.get(name);
    if (client) {
      await client.close();
      this.clients.delete(name);
      const tools = this.serverTools.get(name) || [];
      for (const tool of tools) {
        this.toolToServer.delete(`mcp_${name}_${tool.name}`);
      }
      this.serverTools.delete(name);
      printInfo(`MCP server '${name}' disconnected`);
    }
  }

  /**
   * Disconnect all servers
   */
  async disconnectAll() {
    for (const name of this.clients.keys()) {
      await this.disconnect(name);
    }
  }

  /**
   * Get all MCP tools in OpenAI-compatible function calling format (for Groq)
   */
  getToolDefinitions() {
    const definitions = [];

    for (const [serverName, tools] of this.serverTools.entries()) {
      for (const tool of tools) {
        const prefixedName = `mcp_${serverName}_${tool.name}`;
        definitions.push({
          name: prefixedName,
          description: `[MCP:${serverName}] ${tool.description || tool.name}`,
          parameters: tool.inputSchema || { type: 'object', properties: {} },
        });
      }
    }

    return definitions;
  }

  /**
   * Execute an MCP tool
   */
  async executeTool(prefixedName, args) {
    const mapping = this.toolToServer.get(prefixedName);
    if (!mapping) {
      return { success: false, error: `Unknown MCP tool: ${prefixedName}` };
    }

    const client = this.clients.get(mapping.serverName);
    if (!client) {
      return { success: false, error: `MCP server '${mapping.serverName}' not connected` };
    }

    try {
      const result = await client.callTool({
        name: mapping.originalName,
        arguments: args,
      });
      return { success: true, result: result.content };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Check if a tool name belongs to an MCP server
   */
  isMcpTool(toolName) {
    return this.toolToServer.has(toolName);
  }

  /**
   * Get status of all connected servers
   */
  getStatus() {
    const status = {};
    for (const [name, client] of this.clients.entries()) {
      const tools = this.serverTools.get(name) || [];
      status[name] = {
        connected: true,
        tools: tools.map(t => t.name),
        toolCount: tools.length,
      };
    }
    return status;
  }

  /**
   * Add and connect a new MCP server
   */
  async addServer(name, config) {
    addMcpServer(name, config);
    return await this.connect(name, config);
  }

  /**
   * Remove and disconnect an MCP server
   */
  async removeServer(name) {
    await this.disconnect(name);
    removeMcpServer(name);
  }

  /**
   * List available resources from an MCP server
   */
  async listResources(serverName) {
    const client = this.clients.get(serverName);
    if (!client) return { error: `Server '${serverName}' not connected` };
    try {
      const result = await client.listResources();
      return result.resources || [];
    } catch {
      return [];
    }
  }

  /**
   * Read a resource from an MCP server
   */
  async readResource(serverName, uri) {
    const client = this.clients.get(serverName);
    if (!client) return { error: `Server '${serverName}' not connected` };
    try {
      const result = await client.readResource({ uri });
      return result.contents;
    } catch (err) {
      return { error: err.message };
    }
  }
}

// Singleton
let mcpManager = null;
export function getMcpManager() {
  if (!mcpManager) {
    mcpManager = new MCPManager();
  }
  return mcpManager;
}

// ─── Pre-built MCP server configs (presets) ───
// These cover the most useful MCP servers for a developer CLI.
// Category A: Auto-installed (no API keys, no Docker, zero config)
// Category B: Easy-add presets (one command, may need API key or Docker)
export const MCP_PRESETS = {

  // ── CATEGORY A: Auto-install ─────────────────────────────

  filesystem: {
    category: 'auto',
    label: 'Filesystem',
    description: 'Read, write, search, and manage files on your machine (14 tools)',
    needsKey: false,
    getConfig: (paths) => ({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', ...(paths || [])],
    }),
  },

  memory: {
    category: 'auto',
    label: 'Memory',
    description: 'Persistent knowledge graph — remembers across sessions (9 tools)',
    needsKey: false,
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
  },

  'sequential-thinking': {
    category: 'auto',
    label: 'Sequential Thinking',
    description: 'Step-by-step reasoning for complex problems — makes the AI smarter',
    needsKey: false,
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    },
  },

  // ── CATEGORY B: Easy-add presets ─────────────────────────

  playwright: {
    category: 'preset',
    label: 'Playwright',
    description: 'Browser automation: screenshots, scraping, navigation, testing (Microsoft)',
    needsKey: false,
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp'],
    },
  },

  'brave-search': {
    category: 'preset',
    label: 'Brave Search',
    description: 'Web search with results, images, videos, and AI summaries',
    needsKey: true,
    keyName: 'BRAVE_API_KEY',
    keyUrl: 'https://brave.com/search/api/',
    getConfig: (apiKey) => ({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@brave/brave-search-mcp-server'],
      env: { BRAVE_API_KEY: apiKey },
    }),
  },

  github: {
    category: 'preset',
    label: 'GitHub (Official)',
    description: 'Repos, issues, PRs, Actions, code search — GitHub\'s official MCP',
    needsKey: true,
    keyName: 'GITHUB_PERSONAL_ACCESS_TOKEN',
    keyUrl: 'https://github.com/settings/personal-access-tokens/new',
    getConfig: (token) => ({
      transport: 'stdio',
      command: 'docker',
      args: ['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'ghcr.io/github/github-mcp-server'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: token },
    }),
  },

  'github-npx': {
    category: 'preset',
    label: 'GitHub (npm)',
    description: 'GitHub API via npm package (deprecated but works, no Docker needed)',
    needsKey: true,
    keyName: 'GITHUB_PERSONAL_ACCESS_TOKEN',
    keyUrl: 'https://github.com/settings/personal-access-tokens/new',
    getConfig: (token) => ({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: token },
    }),
  },

  fetch: {
    category: 'preset',
    label: 'Fetch',
    description: 'Advanced HTTP requests via MCP (complements built-in web_fetch)',
    needsKey: false,
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
    },
  },

  postgres: {
    category: 'preset',
    label: 'PostgreSQL',
    description: 'Query and inspect PostgreSQL databases',
    needsKey: true,
    keyName: 'connection_string',
    keyUrl: null,
    getConfig: (connectionString) => ({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', connectionString],
    }),
  },

  slack: {
    category: 'preset',
    label: 'Slack',
    description: 'Read/send Slack messages, manage channels and users',
    needsKey: true,
    keyName: 'SLACK_BOT_TOKEN',
    keyUrl: 'https://api.slack.com/apps',
    getConfig: (botToken, teamId) => ({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack'],
      env: { SLACK_BOT_TOKEN: botToken, SLACK_TEAM_ID: teamId || '' },
    }),
  },

  'google-maps': {
    category: 'preset',
    label: 'Google Maps',
    description: 'Search places, get directions, geocoding, and elevations',
    needsKey: true,
    keyName: 'GOOGLE_MAPS_API_KEY',
    keyUrl: 'https://console.cloud.google.com/apis/credentials',
    getConfig: (apiKey) => ({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-google-maps'],
      env: { GOOGLE_MAPS_API_KEY: apiKey },
    }),
  },

  gitlab: {
    category: 'preset',
    label: 'GitLab',
    description: 'Manage GitLab repos, issues, merge requests, and pipelines',
    needsKey: true,
    keyName: 'GITLAB_TOKEN',
    keyUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens',
    getConfig: (token, url) => ({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@zereight/mcp-gitlab'],
      env: { GITLAB_TOKEN: token, GITLAB_API_URL: url || 'https://gitlab.com/api/v4' },
    }),
  },

  pdf: {
    category: 'preset',
    label: 'PDF Reader',
    description: 'Load, extract text, and search through PDF files',
    needsKey: false,
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-pdf'],
    },
  },
};

// ─── Default servers that auto-install on first run ───
// These require NO API keys, NO Docker — just npx.
const DEFAULT_MCP_SERVERS = {
  filesystem: {
    label: 'Filesystem',
    description: 'Read/write files on your machine',
    getConfig: () => {
      const home = process.env.HOME || process.env.USERPROFILE || '.';
      return MCP_PRESETS.filesystem.getConfig([home]);
    },
  },
  memory: {
    label: 'Memory',
    description: 'Persistent knowledge base across sessions',
    config: MCP_PRESETS.memory.config,
  },
  'sequential-thinking': {
    label: 'Sequential Thinking',
    description: 'Step-by-step reasoning for complex problems',
    config: MCP_PRESETS['sequential-thinking'].config,
  },
};

/**
 * Auto-setup default MCP servers on first run.
 * Registers them in config so they connect every time.
 * Silent — never throws, never blocks.
 */
export async function autoSetupDefaultServers() {
  if (isMcpAutoSetupDone()) return;

  const existing = getMcpServers();
  let added = 0;

  for (const [name, preset] of Object.entries(DEFAULT_MCP_SERVERS)) {
    if (existing[name]) continue; // user already configured this
    const config = preset.config || preset.getConfig();
    addMcpServer(name, config);
    added++;
  }

  setMcpAutoSetupDone();

  if (added > 0) {
    printInfo(`Auto-configured ${added} MCP server${added > 1 ? 's' : ''} (filesystem, memory, sequential-thinking)`);
  }
}
