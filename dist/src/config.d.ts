declare const validEnvironments: readonly ["qa", "uat", "prod"];
type Environment = typeof validEnvironments[number];
export declare const CONFIG: {
    readonly ENV: Environment;
    readonly BASE_URL: string;
    readonly USERNAME: string;
    readonly PASSWORD: string;
    readonly OPENAI_API_KEY: string;
};
export {};
//# sourceMappingURL=config.d.ts.map