import type { ComponentAnnotationTransformMeta, ComponentAnnotationTransformResult, ParseAstAsync } from './component-annotation-oxc-ast';
export type { ComponentAnnotationTransformMeta, ComponentAnnotationTransformResult, } from './component-annotation-oxc-ast';
export declare function getOxcParseAstAsync(): Promise<ParseAstAsync | null>;
export declare function createOxcComponentNameAnnotateHooks(ignoredComponents: string[], getParseAstAsync: () => Promise<ParseAstAsync | null>, injectIntoHtml?: boolean): {
    transform(code: string, id: string, meta?: ComponentAnnotationTransformMeta): Promise<ComponentAnnotationTransformResult>;
};
//# sourceMappingURL=component-annotation-oxc.d.ts.map