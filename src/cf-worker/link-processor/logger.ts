import { createLogger, runWithLogger } from "../logger";

export const LinkProcessorLogger = createLogger("LinkProcessorDO");
export const runEffect = runWithLogger("LinkProcessorDO");
