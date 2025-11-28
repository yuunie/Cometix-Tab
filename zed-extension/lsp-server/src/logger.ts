/**
 * Logger for Cometix LSP Server
 */

import { Connection } from 'vscode-languageserver/node';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private connection: Connection;
  private level: LogLevel = LogLevel.INFO;

  constructor(connection: Connection) {
    this.connection = connection;

    // Check environment variable for log level
    const envLevel = process.env.COMETIX_LOG_LEVEL?.toUpperCase();
    if (envLevel) {
      switch (envLevel) {
        case 'DEBUG':
          this.level = LogLevel.DEBUG;
          break;
        case 'INFO':
          this.level = LogLevel.INFO;
          break;
        case 'WARN':
          this.level = LogLevel.WARN;
          break;
        case 'ERROR':
          this.level = LogLevel.ERROR;
          break;
      }
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      this.log('DEBUG', message, args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      this.log('INFO', message, args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      this.log('WARN', message, args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      this.log('ERROR', message, args);
    }
  }

  private log(level: string, message: string, args: any[]): void {
    const timestamp = new Date().toISOString();
    let fullMessage = `[${timestamp}] [${level}] ${message}`;
    
    if (args.length > 0) {
      const argsStr = args
        .map((arg) => {
          if (arg instanceof Error) {
            return arg.message + '\n' + arg.stack;
          }
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(' ');
      fullMessage += ' ' + argsStr;
    }

    // Send to LSP client
    switch (level) {
      case 'ERROR':
        this.connection.console.error(fullMessage);
        break;
      case 'WARN':
        this.connection.console.warn(fullMessage);
        break;
      case 'INFO':
        this.connection.console.info(fullMessage);
        break;
      default:
        this.connection.console.log(fullMessage);
    }

    // Also log to stderr for debugging
    console.error(fullMessage);
  }
}
