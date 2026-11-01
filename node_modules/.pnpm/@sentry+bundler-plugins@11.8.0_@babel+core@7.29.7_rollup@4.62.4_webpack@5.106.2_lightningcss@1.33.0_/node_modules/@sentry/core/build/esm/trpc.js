import { TRPC_PROCEDURE_TYPE, TRPC_PROCEDURE_PATH, RPC_METHOD, RPC_SYSTEM_NAME, SENTRY_ORIGIN, SENTRY_SEGMENT_NAME_SOURCE, SENTRY_OP } from '@sentry/conventions/attributes';
import { RPC } from '@sentry/conventions/op';
import { getClient, withIsolationScope } from './currentScopes.js';
import { captureException } from './exports.js';
import { startSpanManual } from './tracing/trace.js';
import { normalize } from './utils/normalize.js';
import { setNormalizationDepthOverrideHint } from './utils/normalizationHints.js';

const trpcCaptureContext = { mechanism: { handled: false, type: "auto.rpc.trpc.middleware" } };
function captureIfError(nextResult) {
  if (typeof nextResult === "object" && nextResult !== null && "ok" in nextResult && !nextResult.ok && "error" in nextResult) {
    captureException(nextResult.error, trpcCaptureContext);
  }
}
function trpcMiddleware(options = {}) {
  return async function(opts) {
    const { path, type, next, rawInput, getRawInput } = opts;
    const client = getClient();
    const clientOptions = client?.getOptions();
    const dataCollection = client?.getDataCollectionOptions();
    const trpcContext = {
      procedure_path: path,
      procedure_type: type
    };
    setNormalizationDepthOverrideHint(
      trpcContext,
      1 + // 1 for context.input + the normal normalization depth
      (clientOptions?.normalizeDepth ?? 5)
      // 5 is a sane depth
    );
    if (options.attachRpcInput !== void 0 ? options.attachRpcInput : dataCollection?.httpBodies.includes("incomingRequest")) {
      if (rawInput !== void 0) {
        trpcContext.input = normalize(rawInput);
      }
      if (getRawInput !== void 0 && typeof getRawInput === "function") {
        try {
          const rawRes = await getRawInput();
          trpcContext.input = normalize(rawRes);
        } catch {
        }
      }
    }
    return withIsolationScope((scope) => {
      scope.setContext("trpc", trpcContext);
      return startSpanManual(
        {
          name: `trpc/${path}`,
          attributes: {
            [SENTRY_OP]: RPC,
            [SENTRY_SEGMENT_NAME_SOURCE]: "route",
            [SENTRY_ORIGIN]: "auto.rpc.trpc",
            [RPC_SYSTEM_NAME]: "trpc",
            [RPC_METHOD]: String(path),
            [TRPC_PROCEDURE_PATH]: String(path),
            [TRPC_PROCEDURE_TYPE]: String(type)
          },
          // oxlint-disable-next-line typescript/no-deprecated
          forceTransaction: !!options.forceTransaction
        },
        async (span) => {
          try {
            const nextResult = await next();
            captureIfError(nextResult);
            span.end();
            return nextResult;
          } catch (e) {
            captureException(e, trpcCaptureContext);
            span.end();
            throw e;
          }
        }
      );
    });
  };
}

export { trpcMiddleware };
//# sourceMappingURL=trpc.js.map
