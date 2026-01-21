import type { LogLevel } from "./globalTypes.ts";

export class AppError extends Error {
  statusCode: number;
  level: LogLevel;
  methodName: string;

  constructor(
    stack?: string,
    message?: string,
    statusCode: number = 500,
    methodName?: string,
    name?: string,
    level: LogLevel = 'fatal',
  ) {
    super(message);
    this.name = name || 'AppError';
    this.level = level;
    this.statusCode = statusCode;
    this.methodName = methodName!;
    if (stack) this.stack = stack; // ✅ still allowed to assign
  }

  toJSON() {
    return {
      statusCode: this.statusCode,
      level: this.level,
      name: this.name,
      message: this.message,
      methodName: this.methodName,
      stack: this.stack,
    };
  }
}
