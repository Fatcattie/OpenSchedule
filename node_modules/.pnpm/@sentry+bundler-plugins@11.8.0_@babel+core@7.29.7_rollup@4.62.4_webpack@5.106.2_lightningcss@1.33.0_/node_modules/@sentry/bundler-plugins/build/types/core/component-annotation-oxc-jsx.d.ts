import type { AttributeInsertion, FragmentContext, JSXElementNode, JSXFragmentNode, JSXOpeningElementNode, JSXRootNode } from './component-annotation-oxc-ast';
type PendingInsertion = {
    offset: number;
    attributeValues: Map<string, string>;
};
export declare function isJSXElement(value: unknown): value is JSXElementNode;
export declare function isJSXFragment(value: unknown): value is JSXFragmentNode;
export declare function isJSXRoot(value: unknown): value is JSXRootNode;
export declare function getStringName(node: unknown): string | null;
export declare function getJSXName(name: unknown): string;
export declare function getInsertionOffset(code: string, openingElement: JSXOpeningElementNode): number | null;
export declare function isReactFragment(openingElement: JSXOpeningElementNode, fragmentContext: FragmentContext): boolean;
export declare function addPendingAttributes(code: string, openingElement: JSXOpeningElementNode, componentName: string, ignoredComponents: string[], fragmentContext: FragmentContext, sourceFileName: string, insertionsByOffset: Map<number, PendingInsertion>): void;
/**
 * Returns `true` when the element is an HTML element, because HTML mode only
 * annotates the first HTML elements below a component root.
 */
export declare function addPendingHtmlAttribute(code: string, openingElement: JSXOpeningElementNode, componentName: string, ignoredComponents: string[], fragmentContext: FragmentContext, insertionsByOffset: Map<number, PendingInsertion>): boolean;
export declare function toAttributeInsertions(insertionsByOffset: Map<number, PendingInsertion>): AttributeInsertion[];
export {};
//# sourceMappingURL=component-annotation-oxc-jsx.d.ts.map