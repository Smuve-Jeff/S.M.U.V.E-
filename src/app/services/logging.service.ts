import { Injectable, isDevMode } from '@angular/core';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

@Injectable({
  providedIn: 'root'
})
export class LoggingService {
  private level: LogLevel = isDevMode() ? LogLevel.DEBUG : LogLevel.WARN;

  setLogLevel(level: LogLevel) {
    this.level = level;
  }

  debug(message: string, ...args: any[]) {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]) {
    if (this.level <= LogLevel.INFO) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]) {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]) {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  // Specialized logging for S.M.U.V.E 4.0 Strategic Commander persona
  system(message: string, ...args: any[]) {
     if (this.level <= LogLevel.INFO) {
       console.log(`%c[SYSTEM COMMANDER]: ${message}`, 'color: #10b981; font-weight: bold; text-transform: uppercase;', ...args);
     }
  }
}
