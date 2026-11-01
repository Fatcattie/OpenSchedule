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

export { FLUE_INSTRUMENTATION_KEY, FLUE_INTEGRATION_NAME, FLUE_MODULE_NAME, FLUE_OPERATION, FLUE_ORIGIN, MAX_TRACKED_FLUE_SPANS };
//# sourceMappingURL=constants.js.map
