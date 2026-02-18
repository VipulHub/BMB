import { env } from "process";
import type { LogLevel, LogTransport, LogMethod } from "../types/globalTypes.ts";
import moment from 'moment';
import { define } from "../config/define.ts";

export class Logger {
    private currentLevel: LogLevel;
    private transports: LogTransport[] = [];

    private readonly levelsPriority: Record<LogLevel, number> = {
        fatal: 0,
        error: 1,
        warn: 2,
        info: 3,
        debug: 4,
        trace: 5,
    };

    constructor(level: LogLevel = 'info') {
        this.currentLevel = level;
    }

    addTransport(transport: LogTransport) {
        this.transports.push(transport);
    }

    private shouldLog(level: LogLevel) {
        return this.levelsPriority[level] <= this.levelsPriority[this.currentLevel];
    }

    private log(level: LogLevel, message: string, ...meta: any[]) {
        if (!this.shouldLog(level)) return;
        const time = moment(new Date()).format(define.logTimeFormate);
        const formattedMessage = `[${time}] [${level.toUpperCase()}] ${message}`;

        for (const transport of this.transports) {
            transport.log(formattedMessage, meta, level);
        }
    }


    fatal: LogMethod = (msg, ...meta) => this.log('fatal', msg, ...meta);
    error: LogMethod = (msg, ...meta) => this.log('error', msg, ...meta);
    warn: LogMethod = (msg, ...meta) => this.log('warn', msg, ...meta);
    info: LogMethod = (msg, ...meta) => this.log('info', msg, ...meta);
    debug: LogMethod = (msg, ...meta) => this.log('debug', msg, ...meta);
    trace: LogMethod = (msg, ...meta) => this.log('trace', msg, ...meta);
}


const createLogger = (): Logger => {
    const logger = new Logger(env.log_level as LogLevel || 'info');
    logger.addTransport(ConsoleTransport);
    return logger;
};
const ConsoleTransport: LogTransport = {
    log(message: string, meta: any[]) {
        console.log(message, ...meta);
    }
};
const logger = createLogger()

export {
    logger
}