const ORIGIN = "auto.graphql.diagnostic_channel";
const SPAN_NAME_PARSE = "graphql.parse";
const SPAN_NAME_VALIDATE = "graphql.validate";
const SPAN_NAME_EXECUTE = "graphql.execute";
const SPAN_NAME_SUBSCRIBE = "graphql.subscribe";
const SPAN_NAME_RESOLVE = "graphql.resolve";
const GRAPHQL_PROCESSING_TYPE = "graphql.processing.type";
const PROCESSING_TYPE_PARSE = "parse";
const PROCESSING_TYPE_VALIDATE = "validate";
const PROCESSING_TYPE_EXECUTE = "execute";
const PROCESSING_TYPE_RESOLVE = "resolve";
const GRAPHQL_FIELD_NAME = "graphql.field.name";
const GRAPHQL_FIELD_PATH = "graphql.field.path";
const GRAPHQL_FIELD_TYPE = "graphql.field.type";
const GRAPHQL_PARENT_NAME = "graphql.parent.name";
const GRAPHQL_DATA_SYMBOL = /* @__PURE__ */ Symbol.for("opentelemetry.graphql_data");
const GRAPHQL_PATCHED_SYMBOL = /* @__PURE__ */ Symbol.for("opentelemetry.patched");

export { GRAPHQL_DATA_SYMBOL, GRAPHQL_FIELD_NAME, GRAPHQL_FIELD_PATH, GRAPHQL_FIELD_TYPE, GRAPHQL_PARENT_NAME, GRAPHQL_PATCHED_SYMBOL, GRAPHQL_PROCESSING_TYPE, ORIGIN, PROCESSING_TYPE_EXECUTE, PROCESSING_TYPE_PARSE, PROCESSING_TYPE_RESOLVE, PROCESSING_TYPE_VALIDATE, SPAN_NAME_EXECUTE, SPAN_NAME_PARSE, SPAN_NAME_RESOLVE, SPAN_NAME_SUBSCRIBE, SPAN_NAME_VALIDATE };
//# sourceMappingURL=constants.js.map
