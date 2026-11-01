Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const server = require('@sentry/core/server');
const optionsMapping = require('../options-mapping.js');
const transports = require('./transports.js');
const cli = require('../cli.js');
const version = require('../version.js');

const SENTRY_SAAS_HOSTNAME = "sentry.io";
const stackParser = core.createStackParser(server.nodeStackLineParser());
function createSentryInstance(options, shouldSendTelemetry, buildTool, buildToolMajorVersion) {
  const clientOptions = {
    platform: "node",
    runtime: { name: "node", version: global.process.version },
    dsn: "https://4c2bae7d9fbc413e8f7385f55c515d51@o1.ingest.sentry.io/6690737",
    tracesSampleRate: 0.3,
    traceLifecycle: "static",
    sampleRate: 1,
    release: version.LIB_VERSION,
    integrations: [],
    tracePropagationTargets: ["sentry.io/api"],
    stackParser,
    beforeSend: (event) => {
      event.exception?.values?.forEach((exception) => {
        delete exception.stacktrace;
      });
      delete event.server_name;
      return event;
    },
    // Deprecated, but still applied because this client runs on the static trace lifecycle.
    // oxlint-disable-next-line typescript/no-deprecated
    beforeSendTransaction: (event) => {
      delete event.server_name;
      return event;
    },
    // We create a transport that stalls sending events until we know that we're allowed to (i.e. when Sentry CLI told
    // us that the upload URL is the Sentry SaaS URL)
    transport: transports.makeOptionallyEnabledNodeTransport(shouldSendTelemetry)
  };
  core.applySdkMetadata(clientOptions, "node");
  const client = new server.ServerRuntimeClient(clientOptions);
  const scope = new core.Scope();
  scope.setClient(client);
  if (process.env["SENTRY_TEST_OUT_DIR"]) {
    scope.setPropagationContext({ ...scope.getPropagationContext(), sampleRand: 0 });
  }
  setTelemetryDataOnScope(options, scope, buildTool, buildToolMajorVersion);
  return { sentryScope: scope, sentryClient: client };
}
function setTelemetryDataOnScope(options, scope, buildTool, buildToolMajorVersion) {
  const { org, project, release, errorHandler, sourcemaps, reactComponentAnnotation } = options;
  scope.setTag("upload-legacy-sourcemaps", !!release.uploadLegacySourcemaps);
  if (release.uploadLegacySourcemaps) {
    scope.setTag(
      "uploadLegacySourcemapsEntries",
      Array.isArray(release.uploadLegacySourcemaps) ? release.uploadLegacySourcemaps.length : 1
    );
  }
  scope.setTag("module-metadata", !!options.moduleMetadata);
  scope.setTag("inject-build-information", !!options._experiments.injectBuildInformation);
  if (release.setCommits) {
    scope.setTag("set-commits", release.setCommits.auto === true ? "auto" : "manual");
  } else {
    scope.setTag("set-commits", "undefined");
  }
  scope.setTag("finalize-release", release.finalize);
  scope.setTag("deploy-options", !!release.deploy);
  scope.setTag("custom-error-handler", !!errorHandler);
  scope.setTag("sourcemaps-assets", !!sourcemaps?.assets);
  scope.setTag("delete-after-upload", !!sourcemaps?.filesToDeleteAfterUpload);
  scope.setTag("sourcemaps-disabled", !!sourcemaps?.disable);
  scope.setTag("react-annotate", !!reactComponentAnnotation?.enabled);
  scope.setTag("node", process.version);
  scope.setTag("platform", process.platform);
  scope.setTag("meta-framework", options._metaOptions.telemetry.metaFramework ?? "none");
  scope.setTag("application-key-set", options.applicationKey !== void 0);
  scope.setTag("ci", !!process.env["CI"]);
  scope.setTags({
    organization: org,
    project: Array.isArray(project) ? project.join(", ") : project ?? "undefined",
    bundler: buildTool
  });
  if (buildToolMajorVersion) {
    scope.setTag("bundler-major-version", buildToolMajorVersion);
  }
  scope.setUser({ id: org });
}
async function allowedToSendTelemetry(options) {
  const { telemetry, url } = options;
  if (telemetry === false) {
    return false;
  }
  if (url === optionsMapping.SENTRY_SAAS_URL) {
    return true;
  }
  const cliInfoUrl = await new cli.SentryCliAdapter(options).getServerUrl();
  if (cliInfoUrl === void 0) {
    return false;
  }
  return new URL(cliInfoUrl).hostname === SENTRY_SAAS_HOSTNAME;
}
async function safeFlushTelemetry(sentryClient) {
  try {
    await sentryClient.flush(2e3);
  } catch {
  }
}

exports.allowedToSendTelemetry = allowedToSendTelemetry;
exports.createSentryInstance = createSentryInstance;
exports.safeFlushTelemetry = safeFlushTelemetry;
exports.setTelemetryDataOnScope = setTelemetryDataOnScope;
//# sourceMappingURL=telemetry.js.map
