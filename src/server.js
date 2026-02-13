/**
 * Vinsa CLI — HTTP API Server (vinsa serve)
 * 
 * Exposes Vinsa as a local HTTP API so other tools can use it as an AI backend.
 * 
 * Endpoints:
 *   POST /api/ask        — One-shot question → JSON response
 *   POST /api/chat       — Multi-turn chat (send history)
 *   GET  /api/tools      — List available tools
 *   GET  /api/models     — List model pool & status
 *   GET  /api/health     — Health check
 *   POST /api/tool       — Execute a specific tool directly
 * 
 * Usage: vinsa serve --port 3141
 */
import http from 'http';
import { getAgent } from './agent.js';
import { toolDefinitions, executeTool } from './tools.js';
import { getModel } from './config.js';
import { printSuccess, printInfo, printError, colors } from './ui.js';

/**
 * Parse JSON body from an incoming request
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Start the Vinsa HTTP API server
 */
export function startServer({ port = 3141 } = {}) {
  const agent = getAgent();
  agent.initialize();

  const server = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${port}`);
    const pathname = url.pathname;

    try {
      // ─── Health Check ───
      if (pathname === '/api/health' && req.method === 'GET') {
        return sendJson(res, 200, {
          status: 'ok',
          version: '3.0.0',
          model: getModel(),
          uptime: process.uptime(),
        });
      }

      // ─── List Tools ───
      if (pathname === '/api/tools' && req.method === 'GET') {
        return sendJson(res, 200, {
          tools: toolDefinitions.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        });
      }

      // ─── List Models ───
      if (pathname === '/api/models' && req.method === 'GET') {
        const models = agent.getModelStatus();
        return sendJson(res, 200, { models, current: getModel() });
      }

      // ─── One-shot Ask ───
      if (pathname === '/api/ask' && req.method === 'POST') {
        const body = await parseBody(req);
        if (!body.prompt) {
          return sendJson(res, 400, { error: 'Missing "prompt" field' });
        }

        const response = await agent.ask(body.prompt, { silent: true });
        const stats = agent.getStats();

        return sendJson(res, 200, {
          success: true,
          prompt: body.prompt,
          response,
          model: getModel(),
          stats: {
            promptTokens: stats.promptTokens,
            completionTokens: stats.completionTokens,
            totalTokens: stats.totalTokens,
          },
        });
      }

      // ─── Multi-turn Chat ───
      if (pathname === '/api/chat' && req.method === 'POST') {
        const body = await parseBody(req);
        if (!body.message) {
          return sendJson(res, 400, { error: 'Missing "message" field' });
        }

        // Optionally restore history
        if (body.history && Array.isArray(body.history)) {
          agent.setConversationHistory(body.history);
        }

        const response = await agent.run(body.message, {
          onToolCall: () => {},
          onToolResult: () => {},
          onRetry: () => {},
          onModelSwitch: () => {},
        });

        return sendJson(res, 200, {
          success: true,
          response,
          history: agent.getConversationHistory(),
          model: getModel(),
        });
      }

      // ─── Execute Tool Directly ───
      if (pathname === '/api/tool' && req.method === 'POST') {
        const body = await parseBody(req);
        if (!body.name) {
          return sendJson(res, 400, { error: 'Missing "name" field' });
        }

        const result = await executeTool(body.name, body.args || {});
        return sendJson(res, 200, result);
      }

      // ─── Stats ───
      if (pathname === '/api/stats' && req.method === 'GET') {
        return sendJson(res, 200, agent.getStats());
      }

      // ─── 404 ───
      sendJson(res, 404, { error: `Unknown endpoint: ${req.method} ${pathname}` });

    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  server.listen(port, () => {
    console.log('');
    printSuccess(`Vinsa API server running on http://localhost:${port}`);
    printInfo('Endpoints:');
    console.log(colors.accent('  POST /api/ask    ') + colors.dim('— One-shot question (body: { prompt })'));
    console.log(colors.accent('  POST /api/chat   ') + colors.dim('— Multi-turn chat (body: { message, history? })'));
    console.log(colors.accent('  POST /api/tool   ') + colors.dim('— Execute tool (body: { name, args })'));
    console.log(colors.accent('  GET  /api/tools  ') + colors.dim('— List available tools'));
    console.log(colors.accent('  GET  /api/models ') + colors.dim('— Model pool status'));
    console.log(colors.accent('  GET  /api/health ') + colors.dim('— Health check'));
    console.log(colors.accent('  GET  /api/stats  ') + colors.dim('— Token usage stats'));
    console.log('');
    printInfo('Press Ctrl+C to stop.');
  });

  return server;
}
