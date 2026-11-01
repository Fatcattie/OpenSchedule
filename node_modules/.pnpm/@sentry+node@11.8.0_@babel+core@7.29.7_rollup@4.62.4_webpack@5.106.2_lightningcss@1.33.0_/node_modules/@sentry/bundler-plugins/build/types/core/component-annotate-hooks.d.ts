import type { ComponentAnnotationTransformMeta, ParseAstAsync } from './component-annotation-oxc-ast';
import type { Logger } from './logger';
export declare function createComponentNameAnnotateHooks(ignoredComponents: string[], injectIntoHtml: boolean, options?: {
    getParseAstAsync?: () => Promise<ParseAstAsync | null>;
    logger?: Logger;
}): {
    transform(this: void, code: string, id: string, meta?: ComponentAnnotationTransformMeta): Promise<import("./component-annotation-oxc-ast").ComponentAnnotationTransformResult>;
};
//# sourceMappingURL=component-annotate-hooks.d.ts.map