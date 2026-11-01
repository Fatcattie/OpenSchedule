Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const FLUE_INTEGRATION_NAME = "Flue";
const FLUE_MODULE_NAME = "@flue/runtime";
const FLUE_ORIGIN = "auto.ai.flue";
const FLUE_INSTRUMENTATION_KEY = /* @__PURE__ */ Symbol.for("sentry.flue.instrumentation");
const FLUE_OPERATION = {
  AGENT: "agent",
  MODEL: "model",
  TOOL: "tool"
};
const MAX_TRACKED_FLUE_SPANS = 1e3;

exports.FLUE_INSTRUMENTATION_KEY = FLUE_INSTRUMENTATION_KEY;
exports.FLUE_INTEGRATION_NAME = FLUE_INTEGRATION_NAME;
exports.FLUE_MODULE_NAME = FLUE_MODULE_NAME;
exports.FLUE_OPERATION = FLUE_OPERATION;
exports.FLUE_ORIGIN = FLUE_ORIGIN;
exports.MAX_TRACKED_FLUE_SPANS = MAX_TRACKED_FLUE_SPANS;
//# sourceMappingURL=constants.js.map
