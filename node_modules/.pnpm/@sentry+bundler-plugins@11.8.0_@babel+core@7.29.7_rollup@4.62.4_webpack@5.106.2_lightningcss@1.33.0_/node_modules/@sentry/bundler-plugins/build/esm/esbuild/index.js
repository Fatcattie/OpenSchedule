import { getDebugIdSnippet, isJsFile } from '../core/index.js';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createSentryBuildPluginManager } from '../core/build-plugin-manager.js';
import { CodeInjection, generateReleaseInjectorCode, generateModuleMetadataInjectorCode } from '../core/utils.js';
import { addDebugIdToEmittedArtifacts, createDebugIdUploadFunction } from '../core/debug-id-upload.js';

function getEsbuildMajorVersion() {
  try {
    const req = createRequire(import.meta.url);
    const esbuild = req("esbuild");
    return esbuild.version?.split(".")[1];
  } catch {
  }
  return void 0;
}
const pluginName = "sentry-esbuild-plugin";
function sentryEsbuildPlugin(userOptions = {}) {
  const sentryBuildPluginManager = createSentryBuildPluginManager(userOptions, {
    loggerPrefix: userOptions._metaOptions?.loggerPrefixOverride ?? `[${pluginName}]`,
    buildTool: "esbuild",
    buildToolMajorVersion: getEsbuildMajorVersion()
  });
  const {
    logger,
    normalizedOptions: options,
    bundleSizeOptimizationReplacementValues: replacementValues,
    bundleMetadata,
    createDependencyOnBuildArtifacts
  } = sentryBuildPluginManager;
  if (options.disable) {
    return {
      name: "sentry-esbuild-noop-plugin",
      setup() {
      }
    };
  }
  if (process.cwd().match(/\\node_modules\\|\/node_modules\//)) {
    logger.warn("Running Sentry plugin from within a `node_modules` folder. Some features may not work.");
  }
  const sourcemapsEnabled = options.sourcemaps?.disable !== true;
  const staticInjectionCode = new CodeInjection();
  if (!options.release.inject) {
    logger.debug("Release injection disabled via `release.inject` option. Will not inject release.");
  } else if (!options.release.name) {
    logger.debug(
      "No release name provided. Will not inject release. Please set the `release.name` option to identify your release."
    );
  } else {
    staticInjectionCode.append(
      generateReleaseInjectorCode({
        release: options.release.name,
        injectBuildInformation: options._experiments.injectBuildInformation || false
      })
    );
  }
  if (Object.keys(bundleMetadata).length > 0) {
    staticInjectionCode.append(generateModuleMetadataInjectorCode(bundleMetadata));
  }
  if (options.reactComponentAnnotation?.enabled) {
    logger.warn(
      "Component name annotation is not supported in esbuild. Please use a separate transform step or consider using a different bundler."
    );
  }
  const transformReplace = Object.keys(replacementValues).length > 0;
  const debugIdWrappedPaths = /* @__PURE__ */ new Set();
  void sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal().catch(() => {
  });
  return {
    name: pluginName,
    setup({ initialOptions, onLoad, onResolve, onEnd }) {
      if (!staticInjectionCode.isEmpty()) {
        const virtualInjectionFilePath = path.resolve("_sentry-injection-stub");
        initialOptions.inject = initialOptions.inject || [];
        initialOptions.inject.push(virtualInjectionFilePath);
        onResolve({ filter: /_sentry-injection-stub/ }, (args) => {
          return {
            path: args.path,
            sideEffects: true,
            pluginName
          };
        });
        onLoad({ filter: /_sentry-injection-stub/ }, () => {
          return {
            loader: "js",
            pluginName,
            contents: staticInjectionCode.code()
          };
        });
      }
      if (transformReplace) {
        const replacementStringValues = {};
        Object.entries(replacementValues).forEach(([key, value]) => {
          replacementStringValues[key] = JSON.stringify(value);
        });
        initialOptions.define = { ...initialOptions.define, ...replacementStringValues };
      }
      if (sourcemapsEnabled) {
        debugIdWrappedPaths.clear();
        if (!initialOptions.bundle) {
          logger.warn(
            "The Sentry esbuild plugin only supports esbuild with `bundle: true` being set in the esbuild build options. Esbuild will probably crash now. Sorry about that. If you need to upload sourcemaps without `bundle: true`, it is recommended to use Sentry CLI instead: https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/cli/"
          );
        }
        onResolve({ filter: /.*/ }, (args) => {
          if (args.kind !== "entry-point") {
            return;
          }
          if (initialOptions.inject?.includes(args.path)) {
            return;
          }
          const resolvedPath = path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path);
          if (debugIdWrappedPaths.has(resolvedPath)) {
            return;
          }
          debugIdWrappedPaths.add(resolvedPath);
          return {
            pluginName,
            path: resolvedPath,
            pluginData: {
              isDebugIdProxy: true,
              originalPath: args.path,
              originalResolveDir: args.resolveDir
            },
            // We need to add a suffix here, otherwise esbuild will mark the entrypoint as resolved and won't traverse
            // the module tree any further down past the proxy module because we're essentially creating a dependency
            // loop back to the proxy module.
            // By setting a suffix we're telling esbuild that the entrypoint and proxy module are two different things,
            // making it re-resolve the entrypoint when it is imported from the proxy module.
            // Super confusing? Yes. Works? Apparently... Let's see.
            suffix: "?sentryDebugIdProxy=true"
          };
        });
        onLoad({ filter: /.*/ }, (args) => {
          if (!args.pluginData?.isDebugIdProxy) {
            return null;
          }
          const originalPath = args.pluginData.originalPath;
          const originalResolveDir = args.pluginData.originalResolveDir;
          return {
            loader: "js",
            pluginName,
            contents: `
              import "_sentry-debug-id-injection-stub";
              import * as OriginalModule from ${JSON.stringify(originalPath)};
              export default OriginalModule.default;
              export * from ${JSON.stringify(originalPath)};`,
            resolveDir: originalResolveDir
          };
        });
        onResolve({ filter: /_sentry-debug-id-injection-stub/ }, (args) => {
          return {
            path: args.path,
            sideEffects: true,
            pluginName,
            namespace: "sentry-debug-id-stub",
            suffix: `?sentry-module-id=${randomUUID()}`
          };
        });
        onLoad({ filter: /_sentry-debug-id-injection-stub/, namespace: "sentry-debug-id-stub" }, () => {
          return {
            loader: "js",
            pluginName,
            contents: getDebugIdSnippet(randomUUID()).code()
          };
        });
      }
      const freeGlobalDependencyOnBuildArtifacts = createDependencyOnBuildArtifacts();
      const upload = createDebugIdUploadFunction({ sentryBuildPluginManager });
      initialOptions.metafile = true;
      onEnd(async (result) => {
        try {
          await sentryBuildPluginManager.createRelease();
          if (sourcemapsEnabled) {
            const buildArtifacts = result.metafile ? Object.keys(result.metafile.outputs) : [];
            if (options.sourcemaps?.disable !== "disable-upload") {
              await upload(buildArtifacts);
            } else if (initialOptions.write === false) {
              logger.debug("Build output is not written to disk. Skipping debug ID injection into build artifacts.");
            } else {
              const outputDir = initialOptions.absWorkingDir ?? process.cwd();
              await Promise.all(
                buildArtifacts.filter(isJsFile).map(
                  (bundle) => addDebugIdToEmittedArtifacts(
                    path.resolve(outputDir, bundle),
                    logger,
                    options.sourcemaps?.resolveSourceMap
                  )
                )
              );
            }
          }
        } finally {
          freeGlobalDependencyOnBuildArtifacts();
          await sentryBuildPluginManager.deleteArtifacts();
        }
      });
    }
  };
}

export { sentryEsbuildPlugin as default, sentryEsbuildPlugin };
//# sourceMappingURL=index.js.map
