Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const constants = require('./constants.js');

const WEB_COMPONENT_NAME = "data-sentry-component";
const WEB_ELEMENT_NAME = "data-sentry-element";
const WEB_SOURCE_FILE_NAME = "data-sentry-source-file";
const NATIVE_COMPONENT_NAME = "dataSentryComponent";
const NATIVE_ELEMENT_NAME = "dataSentryElement";
const NATIVE_SOURCE_FILE_NAME = "dataSentrySourceFile";
const DEFAULT_IGNORED_ELEMENTS_SET = new Set(constants.DEFAULT_IGNORED_ELEMENTS);
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

exports.NATIVE_COMPONENT_NAME = NATIVE_COMPONENT_NAME;
exports.NATIVE_ELEMENT_NAME = NATIVE_ELEMENT_NAME;
exports.NATIVE_SOURCE_FILE_NAME = NATIVE_SOURCE_FILE_NAME;
exports.WEB_COMPONENT_NAME = WEB_COMPONENT_NAME;
exports.WEB_ELEMENT_NAME = WEB_ELEMENT_NAME;
exports.WEB_SOURCE_FILE_NAME = WEB_SOURCE_FILE_NAME;
exports.getComponentAnnotationAttributes = getComponentAnnotationAttributes;
//# sourceMappingURL=component-annotation.js.map
