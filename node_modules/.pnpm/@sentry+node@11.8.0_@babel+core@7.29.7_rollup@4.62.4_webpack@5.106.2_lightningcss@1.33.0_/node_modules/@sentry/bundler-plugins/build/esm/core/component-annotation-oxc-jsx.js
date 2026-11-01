import { WEB_ELEMENT_NAME, WEB_COMPONENT_NAME, WEB_SOURCE_FILE_NAME, getComponentAnnotationAttributes } from '../babel-plugin/component-annotation.js';
import { isAstNode } from './component-annotation-oxc-ast.js';
import { isObjectLike } from '@sentry/core';

const UNKNOWN_ELEMENT_NAME = "unknown";
const REACT_NATIVE_ELEMENTS = /* @__PURE__ */ new Set([
  "Image",
  "Text",
  "View",
  "ScrollView",
  "TextInput",
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableWithoutFeedback",
  "FlatList",
  "SectionList",
  "ActivityIndicator",
  "Button",
  "Switch",
  "Modal",
  "SafeAreaView",
  "StatusBar",
  "KeyboardAvoidingView",
  "RefreshControl",
  "Picker",
  "Slider"
]);
const WEB_ATTRIBUTE_NAMES = [WEB_ELEMENT_NAME, WEB_COMPONENT_NAME, WEB_SOURCE_FILE_NAME];
const WEB_ATTRIBUTE_NAME_SET = new Set(WEB_ATTRIBUTE_NAMES);
function isJSXElement(value) {
  return isAstNode(value) && value.type === "JSXElement";
}
function isJSXFragment(value) {
  return isAstNode(value) && value.type === "JSXFragment";
}
function isJSXRoot(value) {
  return isJSXElement(value) || isJSXFragment(value);
}
function getStringName(node) {
  return isObjectLike(node) && typeof node.name === "string" ? node.name : null;
}
function getJSXName(name) {
  if (!isAstNode(name)) {
    return UNKNOWN_ELEMENT_NAME;
  }
  if (name.type === "JSXIdentifier") {
    return getStringName(name) ?? UNKNOWN_ELEMENT_NAME;
  }
  if (name.type === "JSXNamespacedName") {
    return getStringName(name.name) ?? UNKNOWN_ELEMENT_NAME;
  }
  if (name.type === "JSXMemberExpression") {
    const objectName = getJSXName(name.object);
    const propertyName = getJSXName(name.property);
    return `${objectName}.${propertyName}`;
  }
  return UNKNOWN_ELEMENT_NAME;
}
function getInsertionOffset(code, openingElement) {
  if (typeof openingElement.end !== "number") {
    return null;
  }
  if (!openingElement.selfClosing) {
    return openingElement.end - 1;
  }
  let offset = openingElement.end - 2;
  while (offset > 0 && /\s/.test(code[offset] ?? "")) {
    offset -= 1;
  }
  return code[offset] === "/" ? offset : openingElement.end - 1;
}
function isReactFragment(openingElement, fragmentContext) {
  const elementName = getJSXName(openingElement.name);
  if (elementName === "Fragment" || elementName === "React.Fragment") {
    return true;
  }
  if (fragmentContext.fragmentAliases.has(elementName)) {
    return true;
  }
  if (isObjectLike(openingElement.name) && openingElement.name.type === "JSXMemberExpression") {
    const objectName = getJSXName(openingElement.name.object);
    const propertyName = getJSXName(openingElement.name.property);
    return propertyName === "Fragment" && (fragmentContext.reactNamespaceAliases.has(objectName) || fragmentContext.fragmentAliases.has(objectName));
  }
  return false;
}
function addPendingAttributes(code, openingElement, componentName, ignoredComponents, fragmentContext, sourceFileName, insertionsByOffset) {
  const offset = getInsertionOffset(code, openingElement);
  if (offset === null) {
    return;
  }
  const pendingInsertion = insertionsByOffset.get(offset);
  const existingAttributes = getExistingAttributeNames(openingElement);
  for (const attributeName of pendingInsertion?.attributeValues.keys() ?? []) {
    existingAttributes.add(attributeName);
  }
  const attributes = getComponentAnnotationAttributes({
    attributeNames: [WEB_COMPONENT_NAME, WEB_ELEMENT_NAME, WEB_SOURCE_FILE_NAME],
    componentName,
    elementName: getJSXName(openingElement.name),
    existingAttributes,
    ignoredComponents,
    isFragment: isReactFragment(openingElement, fragmentContext),
    sourceFileName
  });
  if (attributes.length === 0) {
    return;
  }
  const insertion = getOrCreateInsertion(insertionsByOffset, offset);
  for (const [name, value] of attributes) {
    insertion.attributeValues.set(name, value);
  }
}
function addPendingHtmlAttribute(code, openingElement, componentName, ignoredComponents, fragmentContext, insertionsByOffset) {
  if (isReactFragment(openingElement, fragmentContext)) {
    return false;
  }
  const elementName = getJSXName(openingElement.name);
  if (!isHtmlElement(elementName)) {
    return false;
  }
  if (ignoredComponents.includes(componentName) || ignoredComponents.includes(elementName)) {
    return true;
  }
  const offset = getInsertionOffset(code, openingElement);
  if (offset === null) {
    return true;
  }
  if (getExistingAttributeNames(openingElement).has(WEB_COMPONENT_NAME) || insertionsByOffset.get(offset)?.attributeValues.has(WEB_COMPONENT_NAME)) {
    return true;
  }
  getOrCreateInsertion(insertionsByOffset, offset).attributeValues.set(WEB_COMPONENT_NAME, componentName);
  return true;
}
function isHtmlElement(elementName) {
  if (elementName === UNKNOWN_ELEMENT_NAME) {
    return false;
  }
  if (elementName.charAt(0) === elementName.charAt(0).toLowerCase()) {
    return true;
  }
  return REACT_NATIVE_ELEMENTS.has(elementName);
}
function getOrCreateInsertion(insertionsByOffset, offset) {
  let insertion = insertionsByOffset.get(offset);
  if (!insertion) {
    insertion = { offset, attributeValues: /* @__PURE__ */ new Map() };
    insertionsByOffset.set(offset, insertion);
  }
  return insertion;
}
function toAttributeInsertions(insertionsByOffset) {
  return [...insertionsByOffset.values()].map(({ offset, attributeValues }) => ({
    offset,
    attributes: getOrderedAttributes(attributeValues)
  }));
}
function getExistingAttributeNames(openingElement) {
  const names = /* @__PURE__ */ new Set();
  for (const attribute of openingElement.attributes ?? []) {
    if (attribute.type === "JSXAttribute") {
      const name = getStringName(attribute.name);
      if (name) {
        names.add(name);
      }
    }
  }
  return names;
}
function getOrderedAttributes(attributeValues) {
  const attributes = [];
  for (const name of WEB_ATTRIBUTE_NAMES) {
    const value = attributeValues.get(name);
    if (value !== void 0) {
      attributes.push([name, value]);
    }
  }
  for (const [name, value] of attributeValues) {
    if (!WEB_ATTRIBUTE_NAME_SET.has(name)) {
      attributes.push([name, value]);
    }
  }
  return attributes;
}

export { addPendingAttributes, addPendingHtmlAttribute, getInsertionOffset, getJSXName, getStringName, isJSXElement, isJSXFragment, isJSXRoot, isReactFragment, toAttributeInsertions };
//# sourceMappingURL=component-annotation-oxc-jsx.js.map
