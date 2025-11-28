/**
 * Cursor API Client for LSP Server
 * 
 * Simplified implementation of Cursor API client for code completion.
 * Based on the original VSCode extension implementation.
 */

import CryptoJS from 'crypto-js';

export interface CursorApiClientOptions {
  baseUrl: string;
  authToken: string;
  clientKey: string;
  timeout?: number;
}

export interface CompletionRequest {
  filePath: string;
  content: string;
  prefix: string;
  suffix: string;
  languageId: string;
  cursorPosition: {
    line: number;
    character: number;
  };
}

export interface CompletionResponse {
  text: string;
  range?: {
    startLine: number;
    endLine: number;
  };
  cursorPosition?: {
    line: number;
    character: number;
  };
}

export class CursorApiClient {
  private options: CursorApiClientOptions;
  private checksum: string;

  constructor(options: CursorApiClientOptions) {
    this.options = options;
    this.checksum = options.clientKey || this.generateChecksum();
  }

  /**
   * Generate a checksum for API authentication
   */
  private generateChecksum(): string {
    // Generate a random device ID
    const deviceId = this.generateUUID();
    
    // Create checksum in format: sha256hash,macMachineId
    const timestamp = Math.floor(Date.now() / 1000);
    const data = `${deviceId}:${timestamp}`;
    const hash = CryptoJS.SHA256(data).toString();
    
    return `${hash},${deviceId}`;
  }

  /**
   * Generate a UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Get code completion from Cursor API
   */
  async getCompletion(request: CompletionRequest): Promise<CompletionResponse | null> {
    try {
      // Build the request body for Cursor API
      const body = this.buildRequestBody(request);

      // Make HTTP request
      const response = await this.makeRequest('/aiserver.v1.AiService/StreamCpp', body);

      if (!response) {
        return null;
      }

      // Parse response
      return this.parseResponse(response);

    } catch (error) {
      console.error('Cursor API error:', error);
      return null;
    }
  }

  /**
   * Build request body for Cursor API
   */
  private buildRequestBody(request: CompletionRequest): any {
    // Simplified request body
    // The actual Cursor API uses protobuf, but we'll use a REST-compatible format
    return {
      currentFile: {
        relativeWorkspacePath: request.filePath,
        contents: request.content,
        cursorPosition: {
          line: request.cursorPosition.line,
          column: request.cursorPosition.character,
        },
        languageId: request.languageId,
      },
      prefix: request.prefix,
      suffix: request.suffix,
      modelName: 'auto',
    };
  }

  /**
   * Make HTTP request to Cursor API
   */
  private async makeRequest(endpoint: string, body: any): Promise<any> {
    const url = `${this.options.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.options.authToken}`,
      'x-cursor-checksum': this.checksum,
      'x-cursor-client-version': '1.6.1',
      'User-Agent': 'cometix-lsp/0.1.0',
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeout || 15000);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`API error: ${response.status} ${response.statusText}`);
        return null;
      }

      // Handle streaming response
      return await this.handleStreamResponse(response);

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.error('Request timeout');
      } else {
        console.error('Request error:', error);
      }
      return null;
    }
  }

  /**
   * Handle streaming response from Cursor API
   */
  private async handleStreamResponse(response: Response): Promise<any> {
    const reader = response.body?.getReader();
    if (!reader) {
      return null;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let result: any = { text: '' };

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        
        // Try to parse SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // Accumulate text
              if (data.text) {
                result.text += data.text;
              }
              
              // Check for range info
              if (data.rangeToReplace) {
                result.range = {
                  startLine: data.rangeToReplace.startLineNumber - 1,
                  endLine: data.rangeToReplace.endLineNumberInclusive - 1,
                };
              }
              
              // Check for completion signal
              if (data.doneStream) {
                break;
              }
            } catch {
              // Ignore parse errors for partial JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return result;
  }

  /**
   * Parse response from Cursor API
   */
  private parseResponse(response: any): CompletionResponse | null {
    if (!response || !response.text) {
      return null;
    }

    return {
      text: response.text,
      range: response.range,
      cursorPosition: response.cursorPosition,
    };
  }
}
