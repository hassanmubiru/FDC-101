/**
 * Centralized logging utility
 * Provides structured logging with different log levels
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

export interface LoggerOptions {
    level?: LogLevel;
    prefix?: string;
    enableTimestamp?: boolean;
}

export class Logger {
    private level: LogLevel;
    private prefix: string;
    private enableTimestamp: boolean;

    constructor(options: LoggerOptions = {}) {
        this.level = options.level ?? LogLevel.INFO;
        this.prefix = options.prefix ?? "";
        this.enableTimestamp = options.enableTimestamp ?? true;
    }

    private formatMessage(level: string, message: string): string {
        const parts: string[] = [];

        if (this.enableTimestamp) {
            parts.push(`[${new Date().toISOString()}]`);
        }

        parts.push(`[${level}]`);

        if (this.prefix) {
            parts.push(`[${this.prefix}]`);
        }

        parts.push(message);

        return parts.join(" ");
    }

    private shouldLog(level: LogLevel): boolean {
        return level >= this.level;
    }

    debug(message: string, ...args: any[]): void {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.debug(this.formatMessage("DEBUG", message), ...args);
        }
    }

    info(message: string, ...args: any[]): void {
        if (this.shouldLog(LogLevel.INFO)) {
            console.log(this.formatMessage("INFO", message), ...args);
        }
    }

    warn(message: string, ...args: any[]): void {
        if (this.shouldLog(LogLevel.WARN)) {
            console.warn(this.formatMessage("WARN", message), ...args);
        }
    }

    error(message: string, error?: Error, ...args: any[]): void {
        if (this.shouldLog(LogLevel.ERROR)) {
            console.error(this.formatMessage("ERROR", message), ...args);
            if (error) {
                console.error("Error details:", error);
                if (error.stack) {
                    console.error("Stack trace:", error.stack);
                }
            }
        }
    }

    /**
     * Creates a child logger with an additional prefix
     */
    child(additionalPrefix: string): Logger {
        return new Logger({
            level: this.level,
            prefix: this.prefix ? `${this.prefix}:${additionalPrefix}` : additionalPrefix,
            enableTimestamp: this.enableTimestamp,
        });
    }
}

/**
 * Default logger instance
 */
export const defaultLogger = new Logger({
    level: process.env.LOG_LEVEL
        ? (LogLevel[process.env.LOG_LEVEL as keyof typeof LogLevel] ?? LogLevel.INFO)
        : LogLevel.INFO,
    enableTimestamp: true,
});

