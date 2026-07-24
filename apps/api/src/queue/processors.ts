/**
 * Job-name → processor registry. Real processors (seal pipeline, email,
 * webhooks) arrive with their phases; `probe` exists so the queue path is
 * exercised and tested from day one.
 */
export type Processor = (data: Record<string, unknown>) => Promise<void>;

export const processors: Record<string, Processor> = {
  probe: async () => {
    // Intentionally trivial — liveness/wiring check.
  },
};
