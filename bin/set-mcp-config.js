import { setMcpConfig } from '../src/config.js';

const mcpConfig = {
  mcpServers: {
    lingo: {
      command: 'npx',
      type: 'stdio',
      tools: ['*'],
      args: ['mcp-remote', 'https://mcp.lingo.dev/main']
    }
  }
};

setMcpConfig(mcpConfig);
console.log('MCP configuration saved.');