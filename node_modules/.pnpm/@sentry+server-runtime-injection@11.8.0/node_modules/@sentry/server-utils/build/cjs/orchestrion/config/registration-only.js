Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const MODULE_REGISTRATION_TRANSFORM = "sentryModuleRegistration";
function registrationOnly(module) {
  return {
    channelName: "module-registration",
    module,
    astQuery: "Program",
    transform: MODULE_REGISTRATION_TRANSFORM
  };
}

exports.MODULE_REGISTRATION_TRANSFORM = MODULE_REGISTRATION_TRANSFORM;
exports.registrationOnly = registrationOnly;
//# sourceMappingURL=registration-only.js.map
