import { DEFAULT_IGNORED_ELEMENTS } from './constants.js';

const WEB_COMPONENT_NAME = "data-sentry-component";
const WEB_ELEMENT_NAME = "data-sentry-element";
const WEB_SOURCE_FILE_NAME = "data-sentry-source-file";
const NATIVE_COMPONENT_NAME = "dataSentryComponent";
const NATIVE_ELEMENT_NAME = "dataSentryElement";
const NATIVE_SOURCE_FILE_NAME = "dataSentrySourceFile";
const DEFAULT_IGNORED_ELEMENTS_SET = new Set(DEFAULT_IGNORED_ELEMENTS);
function getComponentAnnotationAttributes({
  attributeNames,
  componentName,
  elementName,
  existingAttributes,
  ignoredComponents,
  isFragment,
  sourceFileName
}) {
  if (isFragment || ignoredComponents.includes(componentName) || ignoredComponents.includes(elementName)) {
    return [];
  }
  const [componentAttributeName, elementAttributeName, sourceFileAttributeName] = attributeNames;
  const isIgnoredElement = DEFAULT_IGNORED_ELEMENTS_SET.has(elementName);
  const attributes = [];
  if (!isIgnoredElement && !existingAttributes.has(elementAttributeName)) {
    attributes.push([elementAttributeName, elementName]);
  }
  if (componentName && !existingAttributes.has(componentAttributeName)) {
    attributes.push([componentAttributeName, componentName]);
  }
  if (sourceFileName && (componentName || !isIgnoredElement) && !existingAttributes.has(sourceFileAttributeName)) {
    attributes.push([sourceFileAttributeName, sourceFileName]);
  }
  return attributes;
}

export { NATIVE_COMPONENT_NAME, NATIVE_ELEMENT_NAME, NATIVE_SOURCE_FILE_NAME, WEB_COMPONENT_NAME, WEB_ELEMENT_NAME, WEB_SOURCE_FILE_NAME, getComponentAnnotationAttributes };
//# sourceMappingURL=component-annotation.js.map
