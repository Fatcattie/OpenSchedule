Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const serverUtils = require('@sentry/server-utils');

const INTEGRATION_NAME = "ChildProcess";
const childProcessIntegration = core.defineIntegration((options = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      serverUtils.subscribeDiagnosticsChannel("child_process", (event) => {
        if (core.isObjectLike(event) && "process" in event) {
          captureChildProcessEvents(event.process, options);
        }
      });
    }
  };
});
function captureChildProcessEvents(child, options) {
  let hasExited = false;
  let data;
  child.on("spawn", () => {
    if (child.spawnfile === "/usr/bin/sw_vers") {
      hasExited = true;
      return;
    }
    data = { spawnfile: child.spawnfile };
    if (options.includeChildProcessArgs) {
      data.spawnargs = child.spawnargs;
    }
  }).on("exit", (code) => {
    if (!hasExited) {
      hasExited = true;
      if (code !== null && code !== 0) {
        core.addBreadcrumb({
          category: "child_process",
          message: `Child process exited with code '${code}'`,
          level: code === 0 ? "info" : "warning",
          data
        });
      }
    }
  }).on("error", (error) => {
    if (!hasExited) {
      hasExited = true;
      core.addBreadcrumb({
        category: "child_process",
        message: `Child process errored with '${error.message}'`,
        level: "error",
        data
      });
    }
  });
}

exports.childProcessIntegration = childProcessIntegration;
//# sourceMappingURL=childProcess.js.map
