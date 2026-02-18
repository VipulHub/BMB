import type { NextFunction, Router } from "express";

type LogTransport = {
  log: (message: string, meta: any[], level?: LogLevel,) => void;
};
type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
type LogMethod = (message: string, ...meta: any[]) => void;
interface ErrorLogData {
  msg: string,
  err?: any,
  stack: string
  level: LogLevel,
  code: number,
  methodName: string
}
interface logData {
  msg: string,
  level: LogLevel
}
interface EventsMap {
  log: (data: logData) => void;
  error: (err: ErrorLogData) => void;
}

type ParsedError = {
  name: string;
  message: string;
  method: string;
  stack: string;
  level: LogLevel,
  code: number
};
type MiddlewareFn = (req: any, res: any, next: any) => void | Promise<void>;

type routeRegistration = {
  routepath: string,
  router: (...middlewares: MiddlewareFn[]) => Promise<Router | undefined>,
  middlewares: MiddlewareFn[],
  authMiddleware: MiddlewareFn[],
}[];

export type {
  LogMethod,
  LogTransport,
  LogLevel,
  EventsMap,
  ParsedError,
  logData,
  ErrorLogData,
  routeRegistration
}