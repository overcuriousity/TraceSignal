import { get } from "./client";
import type { HealthResponse } from "./types";

export const healthApi = {
  check: () => get<HealthResponse>("/health"),
};
