#!/usr/bin/env node
/**
 * Cometix MCP Server
 * 
 * MCP (Model Context Protocol) server for Cursor API code completion
 * Provides AI code completion capabilities to Zed editor
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { CursorApiClient, CompletionRequest, CompletionResponse } from './cursor-api.js';
import { ConfigManager } from './config.js';
import { Logger } from './logger.js';

const logger = new Logger('CometixMCP');

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: 'cursor_completion',
    description: 'Get AI code completion suggestions using Cursor API. Provides intelligent code suggestions based on the current file content and cursor position.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the current file being edited'
        },
        file_content: {
          type: 'string',
          description: 'Full content of the current file'
        },
        cursor_line: {
          type: 'number',
          description: 'Line number of the cursor (0-based)'
        },
        cursor_column: {
          type: 'number',
          description: 'Column number of the cursor (0-based)'
        },
        language: {
          type: 'string',
          description: 'Programming language of the file (e.g., typescript, python, rust)'
        },
        context_files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' }
            }
          },
          description: 'Optional: Additional context files for better completion'
        }
      },
      required: ['file_path', 'file_content', 'cursor_line', 'cursor_column']
    }
  },
  {
    name: 'cursor_config',
    description: 'Get or set Cursor API configuration',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set'],
          description: 'Action to perform: get current config or set new config'
        },
        auth_token: {
          type: 'string',
          description: 'Cursor API authentication token (required for set action)'
        },
        server_url: {
          type: 'string',
          description: 'Optional: Custom Cursor API server URL'
        },
        model: {
          type: 'string',
          enum: ['auto', 'fast', 'advanced'],
          description: 'AI model to use for completions'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'cursor_test_connection',
    description: 'Test connection to Cursor API server',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

class CometixMcpServer {
  private server: Server;
  private apiClient: CursorApiClient | null = null;
  private configManager: ConfigManager;

  constructor() {
    this.configManager = new ConfigManager();
    this.server = new Server(
      {
        name: 'cometix-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: TOOLS };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'cursor_completion':
            return await this.handleCompletion(args as any);
          case 'cursor_config':
            return await this.handleConfig(args as any);
          case 'cursor_test_connection':
            return await this.handleTestConnection();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error(`Tool ${name} failed:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async ensureApiClient(): Promise<CursorApiClient> {
    if (!this.apiClient) {
      const config = this.configManager.getConfig();
      if (!config.authToken) {
        throw new Error('Cursor API auth token not configured. Use cursor_config tool to set it.');
      }
      this.apiClient = new CursorApiClient(config);
    }
    return this.apiClient;
  }

  private async handleCompletion(args: {
    file_path: string;
    file_content: string;
    cursor_line: number;
    cursor_column: number;
    language?: string;
    context_files?: Array<{ path: string; content: string }>;
  }): Promise<any> {
    logger.info(`Completion request for ${args.file_path} at ${args.cursor_line}:${args.cursor_column}`);

    const client = await this.ensureApiClient();

    const request: CompletionRequest = {
      currentFile: {
        path: args.file_path,
        content: args.file_content,
        sha256: this.hashContent(args.file_content),
      },
      cursorPosition: {
        line: args.cursor_line,
        column: args.cursor_column,
      },
      language: args.language || this.detectLanguage(args.file_path),
      additionalFiles: args.context_files?.map(f => ({
        path: f.path,
        content: f.content,
        sha256: this.hashContent(f.content),
      })),
    };

    const completion = await client.requestCompletion(request);

    if (!completion || !completion.text) {
      return {
        content: [
          {
            type: 'text',
            text: 'No completion suggestions available for this context.',
          },
        ],
      };
    }

    // Format the response with completion details
    let responseText = `## Code Completion Suggestion\n\n`;
    responseText += '```' + (args.language || this.detectLanguage(args.file_path)) + '\n';
    responseText += completion.text;
    responseText += '\n```\n\n';

    if (completion.range) {
      responseText += `**Replace lines**: ${completion.range.startLine} - ${completion.range.endLine}\n`;
    }

    if (completion.cursorPosition) {
      responseText += `**Suggested cursor position**: Line ${completion.cursorPosition.line}, Column ${completion.cursorPosition.column}\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: responseText,
        },
      ],
    };
  }

  private async handleConfig(args: {
    action: 'get' | 'set';
    auth_token?: string;
    server_url?: string;
    model?: string;
  }): Promise<any> {
    if (args.action === 'get') {
      const config = this.configManager.getConfig();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              serverUrl: config.serverUrl,
              model: config.model,
              hasAuthToken: !!config.authToken,
            }, null, 2),
          },
        ],
      };
    }

    // Set config
    if (args.auth_token) {
      this.configManager.setAuthToken(args.auth_token);
    }
    if (args.server_url) {
      this.configManager.setServerUrl(args.server_url);
    }
    if (args.model) {
      this.configManager.setModel(args.model);
    }

    // Reset API client to use new config
    this.apiClient = null;

    return {
      content: [
        {
          type: 'text',
          text: 'Configuration updated successfully.',
        },
      ],
    };
  }

  private async handleTestConnection(): Promise<any> {
    try {
      const client = await this.ensureApiClient();
      const result = await client.testConnection();

      return {
        content: [
          {
            type: 'text',
            text: result.success
              ? `✅ Connection successful!\n\n${result.message}`
              : `❌ Connection failed!\n\n${result.message}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Connection test failed: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'py': 'python',
      'rs': 'rust',
      'go': 'go',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'rb': 'ruby',
      'php': 'php',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown',
      'sql': 'sql',
      'sh': 'bash',
      'bash': 'bash',
      'zsh': 'zsh',
    };
    return languageMap[ext] || 'plaintext';
  }

  private hashContent(content: string): string {
    // Simple hash for content verification
    const CryptoJS = require('crypto-js');
    return CryptoJS.SHA256(content).toString();
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Cometix MCP Server started');
  }
}

// Main entry point
const server = new CometixMcpServer();
server.run().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
