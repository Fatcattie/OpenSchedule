const MODULE_REGISTRATION_TRANSFORM = "sentryModuleRegistration";
function registrationOnly(module) {
  return {
    channelName: "module-registration",
    module,
    astQuery: "Program",
    transform: MODULE_REGISTRATION_TRANSFORM
  };
}

export { MODULE_REGISTRATION_TRANSFORM, registrationOnly };
//# sourceMappingURL=registration-only.js.map
