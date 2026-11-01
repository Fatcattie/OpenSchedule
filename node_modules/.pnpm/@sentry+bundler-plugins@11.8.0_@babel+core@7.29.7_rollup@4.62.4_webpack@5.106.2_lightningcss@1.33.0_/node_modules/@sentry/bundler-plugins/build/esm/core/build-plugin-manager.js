import { DEFAULT_ENVIRONMENT, makeSession, startSpan, setMeasurement, closeSession } from '@sentry/core';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SentryCliAdapter } from './cli.js';
import { normalizeUserOptions, validateOptions } from './options-mapping.js';
import { createLogger } from './logger.js';
import { allowedToSendTelemetry, createSentryInstance, safeFlushTelemetry } from './sentry/telemetry.js';
import { getProjects, stripQueryAndHashFromPath, getTurborepoEnvPassthroughWarning, arrayify } from './utils.js';
import { prepareBundleForDebugIdUpload, defaultRewriteSourcesHook } from './debug-id-upload.js';
import { globFiles } from './glob.js';
import { LIB_VERSION } from './version.js';

const _deployedReleases = /* @__PURE__ */ new Set();
function createSentryBuildPluginManager(userOptions, bundlerPluginMetaContext) {
  const logger = createLogger({
    prefix: bundlerPluginMetaContext.loggerPrefix,
    silent: userOptions.silent ?? false,
    debug: userOptions.debug ?? false
  });
  try {
    const dotenvFile = fs.readFileSync(path.join(process.cwd(), ".env.sentry-build-plugin"), "utf-8");
    const dotenvResult = dotenv.parse(dotenvFile);
    Object.assign(process.env, dotenvResult);
    logger.info('Using environment variables configured in ".env.sentry-build-plugin".');
  } catch (e) {
    if (typeof e === "object" && e && "code" in e && e.code !== "ENOENT") {
      throw e;
    }
  }
  const options = normalizeUserOptions(userOptions);
  if (options.disable) {
    return {
      normalizedOptions: options,
      logger,
      bundleSizeOptimizationReplacementValues: {},
      telemetry: {
        emitBundlerPluginExecutionSignal: async () => {
        }
      },
      bundleMetadata: {},
      createRelease: async () => {
      },
      uploadSourcemaps: async () => {
      },
      deleteArtifacts: async () => {
      },
      createDependencyOnBuildArtifacts: () => () => {
      },
      injectDebugIds: async () => {
      }
    };
  }
  const shouldSendTelemetry = allowedToSendTelemetry(options);
  const { sentryScope, sentryClient } = createSentryInstance(
    options,
    shouldSendTelemetry,
    bundlerPluginMetaContext.buildTool,
    bundlerPluginMetaContext.buildToolMajorVersion
  );
  const { release, environment = DEFAULT_ENVIRONMENT } = sentryClient.getOptions();
  const sentrySession = makeSession({ release, environment });
  sentryScope.setSession(sentrySession);
  sentryClient.captureSession(sentrySession);
  let sessionHasEnded = false;
  function endSession() {
    if (sessionHasEnded) {
      return;
    }
    closeSession(sentrySession);
    sentryClient.captureSession(sentrySession);
    sessionHasEnded = true;
  }
  process.on("beforeExit", () => {
    endSession();
  });
  process.env["SENTRY_PIPELINE"] = `${bundlerPluginMetaContext.buildTool}-plugin/${LIB_VERSION}`;
  if (options.debug && !process.env["SENTRY_LOG_LEVEL"]) {
    process.env["SENTRY_LOG_LEVEL"] = "debug";
  }
  const isDevMode = process.env["NODE_ENV"] === "development";
  function handleRecoverableError(unknownError, throwByDefault) {
    sentrySession.status = "abnormal";
    try {
      if (options.errorHandler) {
        try {
          if (unknownError instanceof Error) {
            options.errorHandler(unknownError);
          } else {
            options.errorHandler(new Error("An unknown error occurred"));
          }
        } catch (e) {
          sentrySession.status = "crashed";
          throw e;
        }
      } else {
        sentrySession.status = "crashed";
        if (throwByDefault) {
          throw unknownError;
        }
        logger.error("An error occurred. Couldn't finish all operations:", unknownError);
      }
    } finally {
      endSession();
    }
  }
  if (!validateOptions(options, logger)) {
    handleRecoverableError(new Error("Options were not set correctly. See output above for more details."), true);
  }
  const dependenciesOnBuildArtifacts = /* @__PURE__ */ new Set();
  const buildArtifactsDependencySubscribers = [];
  function notifyBuildArtifactDependencySubscribers() {
    buildArtifactsDependencySubscribers.forEach((subscriber) => {
      subscriber();
    });
  }
  function createDependencyOnBuildArtifacts() {
    const dependencyIdentifier = /* @__PURE__ */ Symbol();
    dependenciesOnBuildArtifacts.add(dependencyIdentifier);
    return function freeDependencyOnBuildArtifacts() {
      dependenciesOnBuildArtifacts.delete(dependencyIdentifier);
      notifyBuildArtifactDependencySubscribers();
    };
  }
  function waitUntilBuildArtifactDependenciesAreFreed() {
    return new Promise((resolve) => {
      buildArtifactsDependencySubscribers.push(() => {
        if (dependenciesOnBuildArtifacts.size === 0) {
          resolve();
        }
      });
      if (dependenciesOnBuildArtifacts.size === 0) {
        resolve();
      }
    });
  }
  const bundleSizeOptimizationReplacementValues = {};
  if (options.bundleSizeOptimizations) {
    const { bundleSizeOptimizations } = options;
    if (bundleSizeOptimizations.excludeDebugStatements) {
      bundleSizeOptimizationReplacementValues["__SENTRY_DEBUG__"] = false;
    }
    if (bundleSizeOptimizations.excludeTracing) {
      bundleSizeOptimizationReplacementValues["__SENTRY_TRACING__"] = false;
    }
    if (bundleSizeOptimizations.excludeChannelInjection) {
      bundleSizeOptimizationReplacementValues["__SENTRY_CHANNEL_INJECTION__"] = false;
    }
    if (bundleSizeOptimizations.excludeReplayCanvas) {
      bundleSizeOptimizationReplacementValues["__RRWEB_EXCLUDE_CANVAS__"] = true;
    }
    if (bundleSizeOptimizations.excludeReplayIframe) {
      bundleSizeOptimizationReplacementValues["__RRWEB_EXCLUDE_IFRAME__"] = true;
    }
    if (bundleSizeOptimizations.excludeReplayShadowDom) {
      bundleSizeOptimizationReplacementValues["__RRWEB_EXCLUDE_SHADOW_DOM__"] = true;
    }
    if (bundleSizeOptimizations.excludeReplayWorker) {
      bundleSizeOptimizationReplacementValues["__SENTRY_EXCLUDE_REPLAY_WORKER__"] = true;
    }
  }
  let bundleMetadata = {};
  if (options.moduleMetadata || options.applicationKey) {
    if (options.applicationKey) {
      bundleMetadata[`_sentryBundlerPluginAppKey:${options.applicationKey}`] = true;
    }
    if (typeof options.moduleMetadata === "function") {
      const args = {
        org: options.org,
        project: getProjects(options.project)?.[0],
        projects: getProjects(options.project),
        release: options.release.name
      };
      bundleMetadata = { ...bundleMetadata, ...options.moduleMetadata(args) };
    } else {
      bundleMetadata = { ...bundleMetadata, ...options.moduleMetadata };
    }
  }
  return {
    /**
     * A logger instance that takes the options passed to the build plugin manager into account. (for silencing and log level etc.)
     */
    logger,
    /**
     * Options after normalization. Includes things like the inferred release name.
     */
    normalizedOptions: options,
    /**
     * Magic strings and their replacement values that can be used for bundle size optimizations. This already takes
     * into account the options passed to the build plugin manager.
     */
    bundleSizeOptimizationReplacementValues,
    /**
     * Metadata that should be injected into bundles if possible. Takes into account options passed to the build plugin manager.
     */
    // See `generateModuleMetadataInjectorCode` for how this should be used exactly
    bundleMetadata,
    /**
     * Contains utility functions for emitting telemetry via the build plugin manager.
     */
    telemetry: {
      /**
       * Emits a `Sentry Bundler Plugin execution` signal.
       */
      async emitBundlerPluginExecutionSignal() {
        if (await shouldSendTelemetry) {
          logger.info(
            "Sending telemetry data on issues and performance to Sentry. To disable telemetry, set `options.telemetry` to `false`."
          );
          startSpan({ name: "Sentry Bundler Plugin execution", scope: sentryScope }, () => {
          });
          await safeFlushTelemetry(sentryClient);
        }
      }
    },
    /**
     * Will potentially create a release based on the build plugin manager options.
     *
     * Also
     * - finalizes the release
     * - sets commits
     * - uploads legacy sourcemaps
     * - adds deploy information
     */
    async createRelease() {
      if (!options.release.name) {
        logger.debug(
          "No release name provided. Will not create release. Please set the `release.name` option to identify your release."
        );
        return;
      } else if (isDevMode) {
        logger.debug("Running in development mode. Will not create release.");
        return;
      } else if (!options.authToken) {
        logger.warn(
          `No auth token provided. Will not create release. Please set the \`authToken\` option. You can find information on how to generate a Sentry auth token here: https://docs.sentry.io/api/auth/${getTurborepoEnvPassthroughWarning("SENTRY_AUTH_TOKEN")}`
        );
        return;
      } else if (!options.org && !options.authToken.startsWith("sntrys_")) {
        logger.warn(
          `No organization slug provided. Will not create release. Please set the \`org\` option to your Sentry organization slug.${getTurborepoEnvPassthroughWarning("SENTRY_ORG")}`
        );
        return;
      } else if (!options.project || Array.isArray(options.project) && options.project.length === 0) {
        logger.warn(
          `No project provided. Will not create release. Please set the \`project\` option to your Sentry project slug.${getTurborepoEnvPassthroughWarning("SENTRY_PROJECT")}`
        );
        return;
      }
      const freeWriteBundleInvocationDependencyOnSourcemapFiles = createDependencyOnBuildArtifacts();
      const releaseName = options.release.name;
      try {
        const cliInstance = new SentryCliAdapter(options);
        if (options.release.create) {
          const releaseOutput = await cliInstance.createRelease(releaseName);
          logger.debug("Release created:", releaseOutput);
        }
        if (options.release.uploadLegacySourcemaps) {
          const uploadTargets = arrayify(options.release.uploadLegacySourcemaps).map((includeItem) => typeof includeItem === "string" ? { paths: [includeItem] } : includeItem).flatMap(
            (includeEntry) => includeEntry.paths.map((directory) => ({
              directory,
              dist: options.release.dist,
              ext: includeEntry.ext ? includeEntry.ext.map((extension) => `.${extension.replace(/^\./, "")}`) : [".js", ".map", ".jsbundle", ".bundle"],
              // The old CLI only skipped `node_modules` when neither ignore source was configured.
              ignore: includeEntry.ignore ? arrayify(includeEntry.ignore) : includeEntry.ignoreFile ? void 0 : ["node_modules"],
              ignoreFile: includeEntry.ignoreFile,
              urlPrefix: includeEntry.urlPrefix
            }))
          );
          await cliInstance.uploadSourcemaps(releaseName, uploadTargets);
        }
        if (options.release.setCommits !== false) {
          try {
            await cliInstance.setCommits(
              releaseName,
              // set commits always exists due to the normalize function
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              options.release.setCommits
            );
          } catch (e) {
            if (options.release.setCommits && "shouldNotThrowOnFailure" in options.release.setCommits && options.release.setCommits.shouldNotThrowOnFailure) {
              logger.debug(
                "An error occurred setting commits on release (this message can be ignored unless you commits on release are desired):",
                e
              );
            } else {
              throw e;
            }
          }
        }
        if (options.release.finalize) {
          await cliInstance.finalizeRelease(releaseName);
        }
        if (options.release.deploy && !_deployedReleases.has(releaseName)) {
          await cliInstance.newDeploy(releaseName, options.release.deploy);
          _deployedReleases.add(releaseName);
        }
      } catch (e) {
        sentryScope.captureException('Error in "releaseManagementPlugin" writeBundle hook');
        await safeFlushTelemetry(sentryClient);
        handleRecoverableError(e, false);
      } finally {
        freeWriteBundleInvocationDependencyOnSourcemapFiles();
      }
    },
    /*
          Injects debug IDs into the build artifacts.
    
          This is a separate function from `uploadSourcemaps` because that needs to run before the sourcemaps are uploaded.
          Usually the respective bundler-plugin will take care of this before the sourcemaps are uploaded.
          Only use this if you need to manually inject debug IDs into the build artifacts.
        */
    async injectDebugIds(buildArtifactPaths) {
      await startSpan({ name: "inject-debug-ids", scope: sentryScope, forceTransaction: true }, async () => {
        try {
          const cliInstance = new SentryCliAdapter(options);
          await cliInstance.injectDebugIds(buildArtifactPaths, options.sourcemaps?.ignore);
        } catch (e) {
          sentryScope.captureException('Error in "debugIdInjectionPlugin" writeBundle hook');
          handleRecoverableError(e, false);
        } finally {
          await safeFlushTelemetry(sentryClient);
        }
      });
    },
    /**
     * Uploads sourcemaps using the "Debug ID" method.
     *
     * By default, this prepares bundles in a temporary folder before uploading. You can opt into an
     * in-place, direct upload path by setting `prepareArtifacts` to `false`. If `prepareArtifacts` is set to
     * `false`, no preparation (e.g. adding `//# debugId=...` and writing adjusted source maps) is performed and no temp folder is used.
     *
     * @param buildArtifactPaths - The paths of the build artifacts to upload
     * @param opts - Optional flags to control temp folder usage and preparation
     */
    async uploadSourcemaps(buildArtifactPaths, opts) {
      if (!canUploadSourceMaps(options, logger, isDevMode)) {
        return;
      }
      const assets = options.sourcemaps?.assets;
      if (Array.isArray(assets) && assets.length === 0) {
        logger.debug("Empty `sourcemaps.assets` option provided. Will not upload sourcemaps with debug ID.");
        return;
      }
      await startSpan(
        // This is `forceTransaction`ed because this span is used in dashboards in the form of indexed transactions.
        // oxlint-disable-next-line typescript/no-deprecated
        { name: "debug-id-sourcemap-upload", scope: sentryScope, forceTransaction: true },
        async () => {
          const shouldPrepare = opts?.prepareArtifacts ?? true;
          let folderToCleanUp;
          const freeUploadDependencyOnBuildArtifacts = createDependencyOnBuildArtifacts();
          try {
            if (!shouldPrepare) {
              let pathsToUpload;
              if (assets) {
                pathsToUpload = Array.isArray(assets) ? assets : [assets];
                logger.debug(
                  `Direct upload mode: passing user-provided assets directly to CLI: ${pathsToUpload.join(", ")}`
                );
              } else {
                pathsToUpload = buildArtifactPaths;
              }
              await startSpan({ name: "upload", scope: sentryScope }, async () => {
                const cliInstance = new SentryCliAdapter(options);
                await cliInstance.uploadSourcemaps(
                  options.release.name ?? "undefined",
                  pathsToUpload.map((directory) => ({
                    directory,
                    dist: options.release.dist,
                    ignore: options.sourcemaps?.ignore
                  }))
                );
              });
              logger.info("Successfully uploaded source maps to Sentry");
            } else {
              let globAssets;
              if (assets) {
                globAssets = assets;
              } else {
                logger.debug(
                  "No `sourcemaps.assets` option provided, falling back to uploading detected build artifacts."
                );
                globAssets = buildArtifactPaths;
              }
              const globResult = await startSpan(
                { name: "glob", scope: sentryScope },
                async () => globFiles(globAssets, { ignore: options.sourcemaps?.ignore })
              );
              const debugIdChunkFilePaths = globResult.filter((debugIdChunkFilePath) => {
                return !!stripQueryAndHashFromPath(debugIdChunkFilePath).match(/\.(js|mjs|cjs)$/);
              });
              debugIdChunkFilePaths.sort();
              if (debugIdChunkFilePaths.length === 0) {
                logger.warn(
                  "Didn't find any matching sources for debug ID upload. Please check the `sourcemaps.assets` option."
                );
              } else {
                const tmpUploadFolder = await startSpan({ name: "mkdtemp", scope: sentryScope }, async () => {
                  return process.env?.["SENTRY_TEST_OVERRIDE_TEMP_DIR"] || await fs.promises.mkdtemp(path.join(os.tmpdir(), "sentry-bundler-plugin-upload-"));
                });
                folderToCleanUp = tmpUploadFolder;
                await startSpan({ name: "prepare-bundles", scope: sentryScope }, async (prepBundlesSpan) => {
                  const preparationTasks = debugIdChunkFilePaths.map((chunkFilePath, chunkIndex) => async () => {
                    await prepareBundleForDebugIdUpload(
                      chunkFilePath,
                      tmpUploadFolder,
                      chunkIndex,
                      logger,
                      options.sourcemaps?.rewriteSources ?? defaultRewriteSourcesHook,
                      options.sourcemaps?.resolveSourceMap
                    );
                  });
                  const workers = [];
                  const worker = async () => {
                    while (preparationTasks.length > 0) {
                      const task = preparationTasks.shift();
                      if (task) {
                        await task();
                      }
                    }
                  };
                  for (let workerIndex = 0; workerIndex < 16; workerIndex++) {
                    workers.push(worker());
                  }
                  await Promise.all(workers);
                  const files = await fs.promises.readdir(tmpUploadFolder);
                  const stats = files.map((file) => fs.promises.stat(path.join(tmpUploadFolder, file)));
                  const uploadSize = (await Promise.all(stats)).reduce(
                    (accumulator, { size }) => accumulator + size,
                    0
                  );
                  setMeasurement("files", files.length, "none", prepBundlesSpan);
                  setMeasurement("upload_size", uploadSize, "byte", prepBundlesSpan);
                  if (files.length === 0) {
                    logger.warn(
                      `No source maps found for any of the ${debugIdChunkFilePaths.length} matched build artifacts, so no source maps were uploaded to Sentry. This usually means source map generation is not enabled in your bundler. Enable it so Sentry can un-minify your stack traces.`
                    );
                    return;
                  }
                  await startSpan({ name: "upload", scope: sentryScope }, async () => {
                    const cliInstance = new SentryCliAdapter(options);
                    await cliInstance.uploadSourcemaps(options.release.name ?? "undefined", [
                      {
                        directory: tmpUploadFolder,
                        dist: options.release.dist
                      }
                    ]);
                  });
                  logger.info("Successfully uploaded source maps to Sentry");
                });
              }
            }
          } catch (e) {
            sentryScope.captureException('Error in "debugIdUploadPlugin" writeBundle hook');
            handleRecoverableError(e, false);
          } finally {
            if (folderToCleanUp && !process.env?.["SENTRY_TEST_OVERRIDE_TEMP_DIR"]) {
              logger.debug("Cleaning up temporary files...");
              try {
                await startSpan({ name: "cleanup", scope: sentryScope }, async () => {
                  if (folderToCleanUp) {
                    await fs.promises.rm(folderToCleanUp, { recursive: true, force: true });
                    logger.debug(`Temporary folder deleted: ${folderToCleanUp}`);
                  }
                });
              } catch (e) {
                logger.debug("Failed to clean up temporary folder:", e);
              }
            }
            logger.debug("Freeing upload dependencies...");
            freeUploadDependencyOnBuildArtifacts();
            logger.debug("Flushing telemetry data...");
            await safeFlushTelemetry(sentryClient);
            logger.debug("Telemetry flushed. Plugin upload process complete.");
          }
        }
      );
    },
    /**
     * Will delete artifacts based on the passed `sourcemaps.filesToDeleteAfterUpload` option.
     */
    async deleteArtifacts() {
      try {
        const filesToDelete = await options.sourcemaps?.filesToDeleteAfterUpload;
        if (filesToDelete !== void 0) {
          const filePathsToDelete = await globFiles(filesToDelete);
          logger.debug("Waiting for dependencies on generated files to be freed before deleting...");
          await waitUntilBuildArtifactDependenciesAreFreed();
          filePathsToDelete.forEach((filePathToDelete) => {
            logger.debug(`Deleting asset after upload: ${filePathToDelete}`);
          });
          await Promise.all(
            filePathsToDelete.map(
              (filePathToDelete) => fs.promises.rm(filePathToDelete, { force: true }).catch((e) => {
                logger.debug(`An error occurred while attempting to delete asset: ${filePathToDelete}`, e);
              })
            )
          );
        }
      } catch (e) {
        sentryScope.captureException('Error in "sentry-file-deletion-plugin" buildEnd hook');
        await safeFlushTelemetry(sentryClient);
        handleRecoverableError(e, true);
      }
    },
    createDependencyOnBuildArtifacts
  };
}
function canUploadSourceMaps(options, logger, isDevMode) {
  if (options.sourcemaps?.disable) {
    logger.debug("Source map upload was disabled. Will not upload sourcemaps using debug ID process.");
    return false;
  }
  if (isDevMode) {
    logger.debug("Running in development mode. Will not upload sourcemaps.");
    return false;
  }
  if (!options.authToken) {
    logger.warn(
      `No auth token provided. Will not upload source maps. Please set the \`authToken\` option. You can find information on how to generate a Sentry auth token here: https://docs.sentry.io/api/auth/${getTurborepoEnvPassthroughWarning("SENTRY_AUTH_TOKEN")}`
    );
    return false;
  }
  if (!options.org && !options.authToken.startsWith("sntrys_")) {
    logger.warn(
      `No org provided. Will not upload source maps. Please set the \`org\` option to your Sentry organization slug.${getTurborepoEnvPassthroughWarning("SENTRY_ORG")}`
    );
    return false;
  }
  if (!getProjects(options.project)?.[0]) {
    logger.warn(
      `No project provided. Will not upload source maps. Please set the \`project\` option to your Sentry project slug.${getTurborepoEnvPassthroughWarning("SENTRY_PROJECT")}`
    );
    return false;
  }
  return true;
}

export { createSentryBuildPluginManager };
//# sourceMappingURL=build-plugin-manager.js.map
