import * as https from 'node:https';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { createTransport, suppressTracing } from '@sentry/core';
import { join } from 'node:path';
import { mkdirSync, appendFileSync } from 'node:fs';

const GZIP_THRESHOLD = 1024 * 32;
function streamFromBody(body) {
  return new Readable({
    read() {
      this.push(body);
      this.push(null);
    }
  });
}
function createRequestExecutor(options) {
  const { hostname, pathname, port, protocol, search } = new URL(options.url);
  return function makeRequest(request) {
    return new Promise((resolve, reject) => {
      suppressTracing(() => {
        let body = streamFromBody(request.body);
        const headers = {};
        if (request.body.length > GZIP_THRESHOLD) {
          headers["content-encoding"] = "gzip";
          body = body.pipe(createGzip());
        }
        const req = https.request(
          {
            method: "POST",
            headers,
            hostname,
            path: `${pathname}${search}`,
            port,
            protocol
          },
          (res) => {
            res.on("data", () => {
            });
            res.on("end", () => {
            });
            res.setEncoding("utf8");
            const retryAfterHeader = res.headers["retry-after"] ?? null;
            const rateLimitsHeader = res.headers["x-sentry-rate-limits"] ?? null;
            resolve({
              statusCode: res.statusCode,
              headers: {
                "retry-after": retryAfterHeader,
                "x-sentry-rate-limits": Array.isArray(rateLimitsHeader) ? rateLimitsHeader[0] || null : rateLimitsHeader
              }
            });
          }
        );
        req.on("error", reject);
        body.pipe(req);
      });
    });
  };
}
function makeNodeTransport(options) {
  const requestExecutor = createRequestExecutor(options);
  return createTransport(options, requestExecutor);
}
function makeOptionallyEnabledNodeTransport(shouldSendTelemetry) {
  return (nodeTransportOptions) => {
    const nodeTransport = makeNodeTransport(nodeTransportOptions);
    return {
      flush: (timeout) => nodeTransport.flush(timeout),
      send: async (request) => {
        if ("__SENTRY_INTERCEPT_TRANSPORT__" in global && Array.isArray(global.__SENTRY_INTERCEPT_TRANSPORT__)) {
          global.__SENTRY_INTERCEPT_TRANSPORT__.push(request);
          return { statusCode: 200 };
        }
        if (await shouldSendTelemetry) {
          if (process.env["SENTRY_TEST_OUT_DIR"]) {
            const outDir = process.env["SENTRY_TEST_OUT_DIR"];
            mkdirSync(outDir, { recursive: true });
            const path = join(outDir, "sentry-telemetry.json");
            appendFileSync(path, `${JSON.stringify(request)},
`);
            return { statusCode: 200 };
          }
          return nodeTransport.send(request);
        }
        return { statusCode: 200 };
      }
    };
  };
}

export { makeOptionallyEnabledNodeTransport };
//# sourceMappingURL=transports.js.map
