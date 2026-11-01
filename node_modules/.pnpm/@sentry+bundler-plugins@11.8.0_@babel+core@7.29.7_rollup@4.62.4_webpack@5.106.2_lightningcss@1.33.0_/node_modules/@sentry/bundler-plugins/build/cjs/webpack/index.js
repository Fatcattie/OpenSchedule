Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const index = require('../core/index.js');
const path = require('node:path');
const node_url = require('node:url');
const node_module = require('node:module');
const node_crypto = require('node:crypto');
const buildPluginManager = require('../core/build-plugin-manager.js');
const utils = require('../core/utils.js');
const componentAnnotateHooks = require('../core/component-annotate-hooks.js');
const getCodeInjectionPosition = require('../core/get-code-injection-position.js');
const debugIdUpload = require('../core/debug-id-upload.js');

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
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

const path__namespace = /*#__PURE__*/_interopNamespace(path);

const _req = node_module.createRequire((typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('webpack/index.js', document.baseURI).href)));
let COMPONENT_ANNOTATION_LOADER;
try {
  COMPONENT_ANNOTATION_LOADER = _req.resolve("@sentry/bundler-plugins/webpack-loader");
} catch {
  const dirname = path__namespace.dirname(node_url.fileURLToPath((typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('webpack/index.js', document.baseURI).href))));
  COMPONENT_ANNOTATION_LOADER = path__namespace.resolve(dirname, "component-annotation-transform.js");
}
const WEBPACK_JAVASCRIPT_ASSET_REGEX = /\.(?:js|ts|jsx|tsx|mjs|cjs|mts|cts)(?:\?[^?]*)?(?:#[^#]*)?$/;
function getWebpackMajorVersion() {
  try {
    const webpack = _req("webpack");
    const version = webpack.version ?? webpack.default?.version;
    return version?.split(".")[0];
  } catch {
    return void 0;
  }
}
function addDebugIdsToAssets(compilation, RawSource) {
  for (const asset of compilation.getAssets()) {
    if (!index.isJsFile(asset.name)) {
      continue;
    }
    const bundleSource = asset.source.source().toString();
    const relatedSourceMap = asset.info.related?.sourceMap;
    const sourceMapName = typeof relatedSourceMap === "string" ? relatedSourceMap : `${asset.name}.map`;
    const sourceMapAsset = compilation.getAsset(sourceMapName);
    const stamped = debugIdUpload.stampDebugId(bundleSource, sourceMapAsset?.source.source().toString());
    if (!stamped) {
      continue;
    }
    compilation.updateAsset(asset.name, new RawSource(stamped.bundleSource));
    if (stamped.sourceMapSource !== void 0) {
      compilation.updateAsset(sourceMapName, new RawSource(stamped.sourceMapSource));
    }
  }
}
function createSentryWebpackPlugin(userOptions = {}) {
  const sentryBuildPluginManager = buildPluginManager.createSentryBuildPluginManager(userOptions, {
    loggerPrefix: userOptions._metaOptions?.loggerPrefixOverride ?? "[sentry-webpack-plugin]",
    buildTool: "webpack",
    buildToolMajorVersion: getWebpackMajorVersion()
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
      apply() {
      }
    };
  }
  if (process.cwd().match(/\\node_modules\\|\/node_modules\//)) {
    logger.warn("Running Sentry plugin from within a `node_modules` folder. Some features may not work.");
  }
  const sourcemapsEnabled = options.sourcemaps?.disable !== true;
  const staticInjectionCode = new utils.CodeInjection();
  if (!options.release.inject) {
    logger.debug("Release injection disabled via `release.inject` option. Will not inject release.");
  } else if (!options.release.name) {
    logger.debug(
      "No release name provided. Will not inject release. Please set the `release.name` option to identify your release."
    );
  } else {
    staticInjectionCode.append(
      utils.generateReleaseInjectorCode({
        release: options.release.name,
        injectBuildInformation: options._experiments.injectBuildInformation || false
      })
    );
  }
  if (Object.keys(bundleMetadata).length > 0) {
    staticInjectionCode.append(utils.generateModuleMetadataInjectorCode(bundleMetadata));
  }
  const transformAnnotations = options.reactComponentAnnotation?.enabled ? componentAnnotateHooks.createComponentNameAnnotateHooks(
    options.reactComponentAnnotation?.ignoredComponents || [],
    !!options.reactComponentAnnotation?._experimentalInjectIntoHtml,
    { logger }
  ) : void 0;
  const transformReplace = Object.keys(replacementValues).length > 0;
  function addCodeInjection(compiler) {
    if (staticInjectionCode.isEmpty() && !sourcemapsEnabled) {
      return;
    }
    const ReplaceSource = compiler.webpack?.sources?.ReplaceSource;
    const processAssetsStage = compiler.webpack?.Compilation?.PROCESS_ASSETS_STAGE_ADDITIONS;
    if (!ReplaceSource || processAssetsStage === void 0) {
      logger.warn(
        "Webpack sources are not available. Skipping code injection. This usually means webpack is not properly configured."
      );
      return;
    }
    compiler.hooks.compilation.tap("sentry-webpack-plugin-injection", (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: "sentry-webpack-plugin-injection",
          stage: processAssetsStage
        },
        (assets) => {
          const injectedAssets = /* @__PURE__ */ new Set();
          for (const chunk of compilation.chunks) {
            for (const assetName of chunk.files) {
              if (injectedAssets.has(assetName) || !WEBPACK_JAVASCRIPT_ASSET_REGEX.test(assetName)) {
                continue;
              }
              const source = assets[assetName];
              if (!source) {
                continue;
              }
              injectedAssets.add(assetName);
              const sourceContents = source.source();
              const code = typeof sourceContents === "string" ? sourceContents : Buffer.from(sourceContents).toString();
              const codeToInject = staticInjectionCode.clone();
              if (sourcemapsEnabled) {
                const hash = chunk.contentHash?.javascript ?? chunk.hash;
                codeToInject.append(index.getDebugIdSnippet(hash ? utils.stringToUUID(hash) : node_crypto.randomUUID()));
              }
              const injectionPosition = getCodeInjectionPosition.getCodeInjectionPosition(code);
              const injection = injectionPosition === code.length ? `
${codeToInject.code()}` : codeToInject.code();
              const updatedSource = new ReplaceSource(source);
              updatedSource.insert(injectionPosition, injection);
              compilation.updateAsset(assetName, updatedSource);
            }
          }
        }
      );
    });
  }
  return {
    apply(compiler) {
      void sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal().catch(() => {
      });
      const { DefinePlugin } = compiler.webpack ?? {};
      addCodeInjection(compiler);
      if (sourcemapsEnabled && options.sourcemaps?.disable === "disable-upload") {
        const RawSource = compiler.webpack?.sources?.RawSource;
        const stage = (compiler.webpack?.Compilation?.PROCESS_ASSETS_STAGE_DEV_TOOLING ?? 500) + 1;
        if (!RawSource) {
          logger.warn(
            "Webpack sources are not available. Skipping debug ID injection into emitted source maps. This usually means webpack is not properly configured."
          );
        } else {
          compiler.hooks.thisCompilation.tap("sentry-webpack-plugin", (compilation) => {
            compilation.hooks.processAssets.tap({ name: "sentry-webpack-plugin", stage }, () => {
              addDebugIdsToAssets(compilation, RawSource);
            });
          });
        }
      }
      if (transformReplace && DefinePlugin) {
        compiler.options.plugins = compiler.options.plugins || [];
        compiler.options.plugins.push(new DefinePlugin(replacementValues));
      }
      if (transformAnnotations?.transform) {
        compiler.options.module = compiler.options.module || {};
        compiler.options.module.rules = compiler.options.module.rules || [];
        compiler.options.module.rules.unshift({
          test: /\.[jt]sx$/,
          exclude: /node_modules/,
          enforce: "pre",
          use: [
            {
              loader: COMPONENT_ANNOTATION_LOADER,
              options: {
                transform: transformAnnotations.transform
              }
            }
          ]
        });
      }
      compiler.hooks.afterEmit.tapAsync(
        "sentry-webpack-plugin",
        (compilation, callback) => {
          const freeGlobalDependencyOnBuildArtifacts = createDependencyOnBuildArtifacts();
          const upload = debugIdUpload.createDebugIdUploadFunction({ sentryBuildPluginManager });
          const run = async () => {
            try {
              await sentryBuildPluginManager.createRelease();
              if (sourcemapsEnabled && options.sourcemaps?.disable !== "disable-upload") {
                const outputPath = compilation.outputOptions.path ?? path__namespace.resolve();
                const buildArtifacts = Object.keys(compilation.assets).map((asset) => path__namespace.join(outputPath, asset));
                await upload(buildArtifacts);
              }
            } finally {
              freeGlobalDependencyOnBuildArtifacts();
              await sentryBuildPluginManager.deleteArtifacts();
            }
          };
          run().then(
            () => callback(),
            (err) => callback(err)
          );
        }
      );
      if (userOptions._experiments?.forceExitOnBuildCompletion && compiler.options.mode === "production") {
        compiler.hooks.done.tap("sentry-webpack-plugin", () => {
          setTimeout(() => {
            logger.debug("Exiting process after debug file upload");
            process.exit(0);
          });
        });
      }
    }
  };
}
const sentryWebpackPlugin = createSentryWebpackPlugin;

exports.sentryWebpackPlugin = sentryWebpackPlugin;
//# sourceMappingURL=index.js.map
