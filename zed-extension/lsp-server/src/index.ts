#!/usr/bin/env node
/**
 * Cometix LSP Server
 * 
 * An LSP server that provides AI code completion via Cursor API.
 * This allows Zed (and other LSP-compatible editors) to use Cursor's
 * intelligent code completion.
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  InsertTextFormat,
  MarkupKind,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { CursorApiClient, CompletionRequest, CompletionResponse } from './cursor-client';
import { Logger } from './logger';

// Create LSP connection
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const logger = new Logger(connection);

// Cursor API client
let cursorClient: CursorApiClient | null = null;

// Configuration
interface CometixSettings {
  authToken?: string;
  serverUrl?: string;
  clientKey?: string;
  enabled?: boolean;
  maxCompletionLength?: number;
  debounceMs?: number;
}

let settings: CometixSettings = {
  enabled: true,
  maxCompletionLength: 1000,
  debounceMs: 300,
};

// Debounce tracking
let lastCompletionTime = 0;
const pendingCompletions = new Map<string, NodeJS.Timeout>();

connection.onInitialize((params: InitializeParams): InitializeResult => {
  logger.info('🚀 Cometix LSP Server initializing...');

  // Get initialization options
  const initOptions = params.initializationOptions as CometixSettings | undefined;
  if (initOptions) {
    settings = { ...settings, ...initOptions };
  }

  // Also check environment variables
  if (process.env.COMETIX_AUTH_TOKEN) {
    settings.authToken = process.env.COMETIX_AUTH_TOKEN;
  }
  if (process.env.COMETIX_SERVER_URL) {
    settings.serverUrl = process.env.COMETIX_SERVER_URL;
  }
  if (process.env.COMETIX_CLIENT_KEY) {
    settings.clientKey = process.env.COMETIX_CLIENT_KEY;
  }

  // Initialize Cursor API client
  if (settings.authToken) {
    cursorClient = new CursorApiClient({
      baseUrl: settings.serverUrl || 'https://api2.cursor.sh',
      authToken: settings.authToken,
      clientKey: settings.clientKey || '',
      timeout: 15000,
    });
    logger.info('✅ Cursor API client initialized');
  } else {
    logger.warn('⚠️ No auth token provided. AI completions will be disabled.');
    logger.warn('   Set COMETIX_AUTH_TOKEN environment variable or configure in settings.');
  }

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', ':', '<', '"', "'", '/', '@', '#', ' ', '(', '{', '[', ',', '='],
      },
    },
  };
});

connection.onInitialized(() => {
  logger.info('✅ Cometix LSP Server initialized successfully');
});

// Handle completion requests
connection.onCompletion(async (params: TextDocumentPositionParams): Promise<CompletionItem[]> => {
  if (!settings.enabled || !cursorClient) {
    return [];
  }

  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  // Debounce completions
  const now = Date.now();
  const debounceMs = settings.debounceMs || 300;
  if (now - lastCompletionTime < debounceMs) {
    logger.debug(`⏰ Debouncing completion request (${now - lastCompletionTime}ms < ${debounceMs}ms)`);
    return [];
  }
  lastCompletionTime = now;

  try {
    logger.info(`🔍 Completion request at ${params.position.line}:${params.position.character}`);

    // Build completion request
    const request = buildCompletionRequest(document, params);
    
    // Call Cursor API
    const response = await cursorClient.getCompletion(request);
    
    if (!response || !response.text) {
      logger.debug('📭 No completion received');
      return [];
    }

    logger.info(`✅ Received completion: ${response.text.substring(0, 50)}...`);

    // Convert to LSP completion items
    return convertToCompletionItems(response, document, params);

  } catch (error) {
    logger.error('❌ Completion error:', error);
    return [];
  }
});

// Resolve completion item (add documentation, etc.)
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  // Add documentation for AI completions
  if (item.data?.source === 'cometix') {
    item.documentation = {
      kind: MarkupKind.Markdown,
      value: '✨ **AI Completion** by Cometix\n\nPowered by Cursor API',
    };
  }
  return item;
});

// Handle configuration changes
connection.onDidChangeConfiguration((change) => {
  const newSettings = change.settings?.cometix as CometixSettings | undefined;
  if (newSettings) {
    settings = { ...settings, ...newSettings };
    
    // Reinitialize client if auth token changed
    if (newSettings.authToken && newSettings.authToken !== settings.authToken) {
      cursorClient = new CursorApiClient({
        baseUrl: settings.serverUrl || 'https://api2.cursor.sh',
        authToken: newSettings.authToken,
        clientKey: settings.clientKey || '',
        timeout: 15000,
      });
      logger.info('🔄 Cursor API client reinitialized with new settings');
    }
  }
});

// Build completion request from document and position
function buildCompletionRequest(
  document: TextDocument,
  params: TextDocumentPositionParams
): CompletionRequest {
  const content = document.getText();
  const uri = document.uri;
  const filePath = uri.replace('file://', '');
  const languageId = document.languageId;

  // Calculate context (lines before and after cursor)
  const lines = content.split('\n');
  const cursorLine = params.position.line;
  const cursorChar = params.position.character;

  // Get context radius (50 lines before/after)
  const contextRadius = 50;
  const startLine = Math.max(0, cursorLine - contextRadius);
  const endLine = Math.min(lines.length - 1, cursorLine + contextRadius);

  // Build prefix and suffix
  const prefixLines = lines.slice(startLine, cursorLine);
  const currentLinePrefix = lines[cursorLine]?.substring(0, cursorChar) || '';
  const currentLineSuffix = lines[cursorLine]?.substring(cursorChar) || '';
  const suffixLines = lines.slice(cursorLine + 1, endLine + 1);

  const prefix = [...prefixLines, currentLinePrefix].join('\n');
  const suffix = [currentLineSuffix, ...suffixLines].join('\n');

  return {
    filePath,
    content,
    prefix,
    suffix,
    languageId,
    cursorPosition: {
      line: cursorLine,
      character: cursorChar,
    },
  };
}

// Convert Cursor API response to LSP completion items
function convertToCompletionItems(
  response: CompletionResponse,
  document: TextDocument,
  params: TextDocumentPositionParams
): CompletionItem[] {
  const items: CompletionItem[] = [];

  if (response.text) {
    // Create main completion item
    const item: CompletionItem = {
      label: getCompletionLabel(response.text),
      kind: CompletionItemKind.Snippet,
      detail: '✨ Cometix AI',
      insertText: response.text,
      insertTextFormat: InsertTextFormat.PlainText,
      sortText: '0000', // High priority
      preselect: true,
      data: {
        source: 'cometix',
        fullText: response.text,
      },
    };

    // If there's a range replacement, use TextEdit
    if (response.range) {
      item.textEdit = {
        range: {
          start: { line: response.range.startLine, character: 0 },
          end: { line: response.range.endLine, character: Number.MAX_SAFE_INTEGER },
        },
        newText: response.text,
      };
    }

    items.push(item);

    // If the completion is multi-line, also offer individual lines
    const lines = response.text.split('\n');
    if (lines.length > 1 && lines.length <= 5) {
      // First line only
      items.push({
        label: getCompletionLabel(lines[0]),
        kind: CompletionItemKind.Text,
        detail: '✨ First line',
        insertText: lines[0],
        insertTextFormat: InsertTextFormat.PlainText,
        sortText: '0001',
        data: { source: 'cometix' },
      });
    }
  }

  return items;
}

// Get a short label for completion
function getCompletionLabel(text: string): string {
  const firstLine = text.split('\n')[0];
  const maxLen = 50;
  
  if (firstLine.length <= maxLen) {
    return firstLine;
  }
  
  return firstLine.substring(0, maxLen - 3) + '...';
}

// Document management
documents.onDidOpen((e) => {
  logger.debug(`📄 Document opened: ${e.document.uri}`);
});

documents.onDidChangeContent((e) => {
  logger.debug(`📝 Document changed: ${e.document.uri}`);
});

documents.onDidClose((e) => {
  logger.debug(`📄 Document closed: ${e.document.uri}`);
});

// Listen for document changes
documents.listen(connection);

// Start listening
connection.listen();

logger.info('🎉 Cometix LSP Server started');
