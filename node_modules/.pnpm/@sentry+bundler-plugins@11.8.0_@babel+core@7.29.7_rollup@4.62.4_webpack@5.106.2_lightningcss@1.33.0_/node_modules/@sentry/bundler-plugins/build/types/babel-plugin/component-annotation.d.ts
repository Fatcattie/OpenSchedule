export declare const WEB_COMPONENT_NAME = "data-sentry-component";
export declare const WEB_ELEMENT_NAME = "data-sentry-element";
export declare const WEB_SOURCE_FILE_NAME = "data-sentry-source-file";
export declare const NATIVE_COMPONENT_NAME = "dataSentryComponent";
export declare const NATIVE_ELEMENT_NAME = "dataSentryElement";
export declare const NATIVE_SOURCE_FILE_NAME = "dataSentrySourceFile";
export type ComponentAnnotationAttributeNames = readonly [string, string, string];
export type ComponentAnnotationAttribute = [string, string];
type ComponentAnnotationAttributesInput = {
    attributeNames: ComponentAnnotationAttributeNames;
    componentName: string;
    elementName: string;
    existingAttributes: ReadonlySet<string>;
    ignoredComponents: readonly string[];
    isFragment: boolean;
    sourceFileName?: string;
};
export declare function getComponentAnnotationAttributes({ attributeNames, componentName, elementName, existingAttributes, ignoredComponents, isFragment, sourceFileName, }: ComponentAnnotationAttributesInput): ComponentAnnotationAttribute[];
export {};
//# sourceMappingURL=component-annotation.d.ts.map