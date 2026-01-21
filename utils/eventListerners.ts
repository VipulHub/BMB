import type { ErrorLogData,logData } from "../types/globalTypes.ts";
import { logger } from "./logger.ts";
import { errorGenerator, errorParser } from "./utils.ts";

const errorListener = async (logData: ErrorLogData) => {
    const { message, name, stack } = logData as unknown as { message: string, name: string, stack: string };

    const err = await errorGenerator(
        name,
        message,
        logData.code,
        logData.level,
        logData.methodName,
        stack ?? 'No stack trace'
    );

    const error = await errorParser(err, err.methodName);
    logger[error.level](`🧨 Emitter Log: Anomaly flagged in ${error.method}`, error);
    return error;
};


const logListener = (log: logData) => {
    logger[log.level](`🎯 Intel Drop → "${log.msg}" [Severity: ${log.level}]`);
};

export {
    logListener,
    errorListener
}