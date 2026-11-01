Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const serverUtils = require('@sentry/server-utils');

const INTEGRATION_NAME = "WorkerThreads";
const workerThreadsIntegration = core.defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      serverUtils.subscribeDiagnosticsChannel("worker_threads", (event) => {
        if (core.isObjectLike(event) && "worker" in event) {
          captureWorkerThreadEvents(event.worker);
        }
      });
    }
  };
});
function captureWorkerThreadEvents(worker) {
  let threadId;
  worker.on("online", () => {
    threadId = worker.threadId;
  }).on("error", (error) => {
    core.captureException(error, {
      mechanism: {
        type: "auto.node.worker_threads",
        handled: false,
        data: threadId !== void 0 ? { threadId: String(threadId) } : void 0
      }
    });
  });
}

exports.workerThreadsIntegration = workerThreadsIntegration;
//# sourceMappingURL=workerThreads.js.map
