Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const utils = require('./utils.js');

const SENTRY_SAAS_URL = "https://sentry.io";
function normalizeUserOptions(userOptions) {
  const options = {
    org: userOptions.org ?? process.env["SENTRY_ORG"],
    project: userOptions.project ?? (process.env["SENTRY_PROJECT"]?.includes(",") ? process.env["SENTRY_PROJECT"].split(",").map((p) => p.trim()) : process.env["SENTRY_PROJECT"]),
    authToken: userOptions.authToken ?? process.env["SENTRY_AUTH_TOKEN"],
    url: userOptions.url ?? process.env["SENTRY_URL"] ?? SENTRY_SAAS_URL,
    headers: userOptions.headers,
    debug: userOptions.debug ?? false,
    silent: userOptions.silent ?? false,
    errorHandler: userOptions.errorHandler,
    telemetry: userOptions.telemetry ?? true,
    disable: userOptions.disable ?? false,
    sourcemaps: userOptions.sourcemaps,
    release: {
      ...userOptions.release,
      name: userOptions.release?.name ?? process.env["SENTRY_RELEASE"] ?? utils.determineReleaseName(),
      inject: userOptions.release?.inject ?? true,
      create: userOptions.release?.create ?? true,
      finalize: userOptions.release?.finalize ?? true,
      vcsRemote: userOptions.release?.vcsRemote ?? process.env["SENTRY_VSC_REMOTE"] ?? "origin",
      // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- rule false positive: the cast carries the internal `shouldNotThrowOnFailure` field; tsc errors without it
      setCommits: userOptions.release?.setCommits
    },
    bundleSizeOptimizations: userOptions.bundleSizeOptimizations,
    reactComponentAnnotation: userOptions.reactComponentAnnotation,
    _metaOptions: {
      telemetry: {
        metaFramework: userOptions._metaOptions?.telemetry?.metaFramework,
        bundlerMajorVersion: userOptions._metaOptions?.telemetry?.bundlerMajorVersion
      }
    },
    applicationKey: userOptions.applicationKey,
    moduleMetadata: userOptions.moduleMetadata,
    _experiments: userOptions._experiments ?? {}
  };
  if (options.release.setCommits === void 0) {
    if (process.env["VERCEL"] && process.env["VERCEL_GIT_COMMIT_SHA"] && process.env["VERCEL_GIT_REPO_SLUG"] && process.env["VERCEL_GIT_REPO_OWNER"] && // We only want to set commits for the production env because Sentry becomes extremely noisy (eg on slack) for
    // preview environments because the previous commit is always the "stem" commit of the preview/PR causing Sentry
    // to notify you for other people creating PRs.
    process.env["VERCEL_TARGET_ENV"] === "production") {
      options.release.setCommits = {
        shouldNotThrowOnFailure: true,
        commit: process.env["VERCEL_GIT_COMMIT_SHA"],
        previousCommit: process.env["VERCEL_GIT_PREVIOUS_SHA"],
        repo: `${process.env["VERCEL_GIT_REPO_OWNER"]}/${process.env["VERCEL_GIT_REPO_SLUG"]}`,
        ignoreEmpty: true,
        ignoreMissing: true
      };
    } else {
      options.release.setCommits = {
        shouldNotThrowOnFailure: true,
        auto: true,
        ignoreEmpty: true,
        ignoreMissing: true
      };
    }
  }
  const vercelEnv = core.getVercelEnv();
  if (options.release.deploy === void 0 && process.env["VERCEL"] && vercelEnv) {
    options.release.deploy = {
      env: vercelEnv,
      url: process.env["VERCEL_URL"] ? `https://${process.env["VERCEL_URL"]}` : void 0
    };
  }
  return options;
}
function validateOptions(options, logger) {
  const setCommits = options.release?.setCommits;
  if (setCommits) {
    if (!setCommits.auto && !(setCommits.repo && setCommits.commit)) {
      logger.error(
        "The `setCommits` option was specified but is missing required properties.",
        "Please set either `auto` or both, `repo` and `commit`."
      );
      return false;
    }
    if (setCommits.auto && setCommits.repo && setCommits) {
      logger.warn(
        "The `setCommits` options includes `auto` but also `repo` and `commit`.",
        "Ignoring `repo` and `commit`.",
        "Please only set either `auto` or both, `repo` and `commit`."
      );
    }
  }
  if (options.release?.deploy && typeof options.release.deploy === "object" && !options.release.deploy.env) {
    logger.error(
      "The `deploy` option was specified but is missing the required `env` property.",
      "Please set the `env` property."
    );
    return false;
  }
  if (options.project && Array.isArray(options.project)) {
    if (options.project.length === 0) {
      logger.error(
        "The `project` option was specified as an array but is empty.",
        "Please provide at least one project slug."
      );
      return false;
    }
    const invalidProjects = options.project.filter((p) => typeof p !== "string" || p.trim() === "");
    if (invalidProjects.length > 0) {
      logger.error("The `project` option contains invalid project slugs.", "All projects must be non-empty strings.");
      return false;
    }
  }
  return true;
}

exports.SENTRY_SAAS_URL = SENTRY_SAAS_URL;
exports.normalizeUserOptions = normalizeUserOptions;
exports.validateOptions = validateOptions;
//# sourceMappingURL=options-mapping.js.map
