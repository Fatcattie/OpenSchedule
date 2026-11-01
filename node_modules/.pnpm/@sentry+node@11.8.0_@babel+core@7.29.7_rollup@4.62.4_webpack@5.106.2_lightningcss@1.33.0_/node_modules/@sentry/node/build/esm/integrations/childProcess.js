import { defineIntegration, isObjectLike, addBreadcrumb } from '@sentry/core';
import { subscribeDiagnosticsChannel } from '@sentry/server-utils';

const INTEGRATION_NAME = "ChildProcess";
const childProcessIntegration = defineIntegration((options = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      subscribeDiagnosticsChannel("child_process", (event) => {
        if (isObjectLike(event) && "process" in event) {
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
        addBreadcrumb({
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
      addBreadcrumb({
        category: "child_process",
        message: `Child process errored with '${error.message}'`,
        level: "error",
        data
      });
    }
  });
}

export { childProcessIntegration };
//# sourceMappingURL=childProcess.js.map
