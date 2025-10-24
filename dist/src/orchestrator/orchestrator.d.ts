/**
 * Custom error for orchestration failures
 */
export declare class OrchestrationError extends Error {
    readonly details?: unknown | undefined;
    constructor(message: string, details?: unknown | undefined);
}
//# sourceMappingURL=orchestrator.d.ts.map