import EventEmitter from "events";
import { logListener, errorListener } from "./eventListerners.ts";
import { logger } from "./logger.ts";
import { env } from "../config/envConfig.ts";
import type { EventsMap } from "../types/globalTypes.ts";

class TypedEmitter extends EventEmitter {
    override on<K extends keyof EventsMap>(event: K, listener: EventsMap[K]): this {
        return super.on(event, listener);
    }

    override emit<K extends keyof EventsMap>(event: K, ...args: Parameters<EventsMap[K]>): boolean {
        return super.emit(event, ...args);
    }
}

const emitter = new TypedEmitter();

const eventHandlers = {
    log: logListener,
    error: errorListener
} as const;

const toggleEmitter = (action: "on" | "off") => {
    (Object.keys(eventHandlers) as (keyof typeof eventHandlers)[]).forEach((key) => {
        if (action === 'on') {
            emitter.on(key, eventHandlers[key]); // safely typed
        } else {
            emitter.off(key, eventHandlers[key]); // safely typed
        }
    })
}

const centralLoggingEmitter = async () => {
    try {
        if (env.env !== 'production') {
            logger.info('🎯 Centeral Logger Initialize')
            toggleEmitter('on');
        }
    } catch (e: any) {
        throw e;
    }
};

export { centralLoggingEmitter, emitter, toggleEmitter };
