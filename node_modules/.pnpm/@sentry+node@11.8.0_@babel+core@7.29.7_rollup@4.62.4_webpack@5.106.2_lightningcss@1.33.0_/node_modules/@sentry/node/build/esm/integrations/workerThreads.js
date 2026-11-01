import { defineIntegration, isObjectLike, captureException } from '@sentry/core';
import { subscribeDiagnosticsChannel } from '@sentry/server-utils';

const INTEGRATION_NAME = "WorkerThreads";
const workerThreadsIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      subscribeDiagnosticsChannel("worker_threads", (event) => {
        if (isObjectLike(event) && "worker" in event) {
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
    captureException(error, {
      mechanism: {
        type: "auto.node.worker_threads",
        handled: false,
        data: threadId !== void 0 ? { threadId: String(threadId) } : void 0
      }
    });
  });
}

export { workerThreadsIntegration };
//# sourceMappingURL=workerThreads.js.map
