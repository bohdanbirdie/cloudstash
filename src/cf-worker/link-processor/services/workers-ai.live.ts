import { Layer } from "effect";

import { WorkersAi } from "../services";

export const WorkersAiLive = (ai: Ai) => Layer.succeed(WorkersAi, ai);
