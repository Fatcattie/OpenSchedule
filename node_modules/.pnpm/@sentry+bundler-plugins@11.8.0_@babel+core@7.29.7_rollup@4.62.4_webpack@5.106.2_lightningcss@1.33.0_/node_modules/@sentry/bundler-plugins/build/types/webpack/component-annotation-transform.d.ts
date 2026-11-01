export default function transform(this: {
    async: () => (err: Error | null, content?: string, sourceMap?: unknown) => void;
    resourcePath: string;
    query: {
        transform?: (code: string, id: string) => Promise<{
            code: string;
            map?: unknown;
        } | null | undefined | string>;
    };
}, source: string, map: unknown): Promise<void>;
//# sourceMappingURL=component-annotation-transform.d.ts.map