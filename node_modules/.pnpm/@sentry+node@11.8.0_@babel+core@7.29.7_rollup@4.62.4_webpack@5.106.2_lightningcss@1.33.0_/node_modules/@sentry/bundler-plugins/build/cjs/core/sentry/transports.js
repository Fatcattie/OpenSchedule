Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const https = require('node:https');
const node_stream = require('node:stream');
const node_zlib = require('node:zlib');
const core = require('@sentry/core');
const path = require('node:path');
const node_fs = require('node:fs');

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  const n = Object.create(null, { [Symbol.toStringTag]: { value: 'Module' } });
  if (e) {
    for (const k in e) {
      n[k] = e[k];
    }
  }
  n.default = e;
  return n;
}

const https__namespace = /*#__PURE__*/_interopNamespace(https);

const GZIP_THRESHOLD = 1024 * 32;
function streamFromBody(body) {
  return new node_stream.Readable({
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
      core.suppressTracing(() => {
        let body = streamFromBody(request.body);
        const headers = {};
        if (request.body.length > GZIP_THRESHOLD) {
          headers["content-encoding"] = "gzip";
          body = body.pipe(node_zlib.createGzip());
        }
        const req = https__namespace.request(
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
  return core.createTransport(options, requestExecutor);
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
            node_fs.mkdirSync(outDir, { recursive: true });
            const path$1 = path.join(outDir, "sentry-telemetry.json");
            node_fs.appendFileSync(path$1, `${JSON.stringify(request)},
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

exports.makeOptionallyEnabledNodeTransport = makeOptionallyEnabledNodeTransport;
//# sourceMappingURL=transports.js.map
