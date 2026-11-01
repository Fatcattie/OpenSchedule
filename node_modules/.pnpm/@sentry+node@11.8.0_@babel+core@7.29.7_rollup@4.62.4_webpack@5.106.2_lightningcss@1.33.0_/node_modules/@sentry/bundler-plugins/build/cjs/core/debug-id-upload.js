Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const fs = require('fs');
const path = require('path');
const url = require('url');
const util = require('util');
const utils = require('./utils.js');

const _interopDefault = e => e && e.__esModule ? e.default : e;

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

const fs__default = /*#__PURE__*/_interopDefault(fs);
const path__default = /*#__PURE__*/_interopDefault(path);
const url__namespace = /*#__PURE__*/_interopNamespace(url);
const util__namespace = /*#__PURE__*/_interopNamespace(util);

function createDebugIdUploadFunction({ sentryBuildPluginManager }) {
  return async (buildArtifactPaths) => {
    const cleanedPaths = buildArtifactPaths.map(utils.stripQueryAndHashFromPath);
    await sentryBuildPluginManager.uploadSourcemaps(cleanedPaths);
  };
}
async function prepareBundleForDebugIdUpload(bundleFilePath, uploadFolder, chunkIndex, logger, rewriteSourcesHook, resolveSourceMapHook) {
  let bundleContent;
  try {
    bundleContent = await util.promisify(fs__default.readFile)(bundleFilePath, "utf8");
  } catch (e) {
    logger.error(`Could not read bundle to determine debug ID and source map: ${bundleFilePath}`, e);
    return;
  }
  const debugId = determineDebugIdFromBundleSource(bundleContent);
  if (debugId === void 0) {
    logger.debug(
      `Could not determine debug ID from bundle. This can happen if you did not clean your output folder before installing the Sentry plugin. File will not be source mapped: ${bundleFilePath}`
    );
    return;
  }
  const uniqueUploadName = `${debugId}-${chunkIndex}`;
  bundleContent = addDebugIdToBundleSource(bundleContent, debugId);
  const sourceMapPath = await determineSourceMapPathFromBundle(
    bundleFilePath,
    bundleContent,
    logger,
    resolveSourceMapHook
  );
  if (!sourceMapPath && !bundleHasInlineSourceMap(bundleContent)) {
    logger.debug(`Not uploading bundle without a source map: ${bundleFilePath}`);
    return;
  }
  const writeSourceFilePromise = fs__default.promises.writeFile(
    path__default.join(uploadFolder, `${uniqueUploadName}.js`),
    bundleContent,
    "utf-8"
  );
  const writeSourceMapFilePromise = sourceMapPath ? prepareSourceMapForDebugIdUpload(
    sourceMapPath,
    path__default.join(uploadFolder, `${uniqueUploadName}.js.map`),
    debugId,
    rewriteSourcesHook,
    logger
  ) : Promise.resolve();
  await writeSourceFilePromise;
  await writeSourceMapFilePromise;
}
function determineDebugIdFromBundleSource(code) {
  const match = code.match(
    /sentry-dbid-([0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12})/
  );
  if (match) {
    return match[1];
  } else {
    return void 0;
  }
}
const SPEC_LAST_DEBUG_ID_REGEX = /\/\/# debugId=([a-fA-F0-9-]+)(?![\s\S]*\/\/# debugId=)/m;
function hasSpecCompliantDebugId(bundleSource) {
  return SPEC_LAST_DEBUG_ID_REGEX.test(bundleSource);
}
function addDebugIdToBundleSource(bundleSource, debugId) {
  if (hasSpecCompliantDebugId(bundleSource)) {
    return bundleSource.replace(SPEC_LAST_DEBUG_ID_REGEX, `//# debugId=${debugId}`);
  } else {
    return `${bundleSource}
//# debugId=${debugId}`;
  }
}
function setDebugIdOnSourceMap(map, debugId) {
  map["debug_id"] = debugId;
  map["debugId"] = debugId;
}
function parseSourceMap(sourceMapSource) {
  let map;
  try {
    map = JSON.parse(sourceMapSource);
  } catch {
    return void 0;
  }
  return map && typeof map === "object" ? map : void 0;
}
function stampDebugId(bundleSource, sourceMapSource) {
  const debugId = determineDebugIdFromBundleSource(bundleSource);
  if (debugId === void 0) {
    return void 0;
  }
  if (sourceMapSource === void 0) {
    if (!bundleHasInlineSourceMap(bundleSource)) {
      return void 0;
    }
    return { bundleSource: addDebugIdToBundleSource(bundleSource, debugId), sourceMapSource: void 0 };
  }
  const map = parseSourceMap(sourceMapSource);
  if (!map) {
    return void 0;
  }
  setDebugIdOnSourceMap(map, debugId);
  return {
    bundleSource: addDebugIdToBundleSource(bundleSource, debugId),
    sourceMapSource: JSON.stringify(map)
  };
}
async function addDebugIdToEmittedArtifacts(bundleFilePath, logger, resolveSourceMapHook) {
  let bundleSource;
  try {
    bundleSource = await fs__default.promises.readFile(bundleFilePath, "utf8");
  } catch (e) {
    logger.error(`Could not read bundle to stamp debug ID: ${bundleFilePath}`, e);
    return;
  }
  const sourceMapPath = await determineSourceMapPathFromBundle(
    bundleFilePath,
    bundleSource,
    logger,
    resolveSourceMapHook
  );
  let sourceMapSource;
  if (sourceMapPath) {
    try {
      sourceMapSource = await fs__default.promises.readFile(sourceMapPath, "utf8");
    } catch (e) {
      logger.error(`Could not read source map to stamp debug ID: ${sourceMapPath}`, e);
      return;
    }
  }
  const stamped = stampDebugId(bundleSource, sourceMapSource);
  if (!stamped) {
    logger.debug(
      `Could not stamp debug ID (no debug ID in bundle, no source map, or invalid source map): ${bundleFilePath}`
    );
    return;
  }
  const writes = [fs__default.promises.writeFile(bundleFilePath, stamped.bundleSource, "utf8")];
  if (sourceMapPath && stamped.sourceMapSource !== void 0) {
    writes.push(fs__default.promises.writeFile(sourceMapPath, stamped.sourceMapSource, "utf8"));
  }
  try {
    await Promise.all(writes);
  } catch (e) {
    logger.error(`Could not write debug ID into build artifacts: ${bundleFilePath}`, e);
  }
}
function bundleHasInlineSourceMap(bundleSource) {
  return /^\s*\/\/# sourceMappingURL=data:/m.test(bundleSource);
}
async function determineSourceMapPathFromBundle(bundlePath, bundleSource, logger, resolveSourceMapHook) {
  const sourceMappingUrlMatch = bundleSource.match(/^\s*\/\/# sourceMappingURL=(.*)$/m);
  const sourceMappingUrl = sourceMappingUrlMatch ? sourceMappingUrlMatch[1] : void 0;
  const searchLocations = [];
  if (resolveSourceMapHook) {
    logger.debug(
      `Calling sourcemaps.resolveSourceMap(${JSON.stringify(bundlePath)}, ${JSON.stringify(sourceMappingUrl)})`
    );
    const customPath = await resolveSourceMapHook(bundlePath, sourceMappingUrl);
    logger.debug(`resolveSourceMap hook returned: ${JSON.stringify(customPath)}`);
    if (customPath) {
      searchLocations.push(customPath);
    }
  }
  if (sourceMappingUrl) {
    let parsedUrl;
    try {
      parsedUrl = new URL(sourceMappingUrl);
    } catch {
    }
    if (parsedUrl?.protocol === "file:") {
      searchLocations.push(url__namespace.fileURLToPath(sourceMappingUrl));
    } else if (parsedUrl) ; else if (path__default.isAbsolute(sourceMappingUrl)) {
      searchLocations.push(path__default.normalize(sourceMappingUrl));
    } else {
      searchLocations.push(path__default.normalize(path__default.join(path__default.dirname(bundlePath), sourceMappingUrl)));
    }
  }
  searchLocations.push(`${bundlePath}.map`);
  for (const searchLocation of searchLocations) {
    try {
      await util__namespace.promisify(fs__default.access)(searchLocation);
      logger.debug(`Source map found for bundle \`${bundlePath}\`: \`${searchLocation}\``);
      return searchLocation;
    } catch {
    }
  }
  logger.debug(
    `Could not determine source map path for bundle \`${bundlePath}\` with sourceMappingURL=${sourceMappingUrl === void 0 ? "undefined" : `\`${sourceMappingUrl}\``} - Did you turn on source map generation in your bundler? (Attempted paths: ${searchLocations.map((e) => `\`${e}\``).join(", ")})`
  );
  return void 0;
}
async function prepareSourceMapForDebugIdUpload(sourceMapPath, targetPath, debugId, rewriteSourcesHook, logger) {
  let sourceMapFileContent;
  try {
    sourceMapFileContent = await util__namespace.promisify(fs__default.readFile)(sourceMapPath, {
      encoding: "utf8"
    });
  } catch (e) {
    logger.error(`Failed to read source map for debug ID upload: ${sourceMapPath}`, e);
    return;
  }
  let map;
  try {
    map = JSON.parse(sourceMapFileContent);
    setDebugIdOnSourceMap(map, debugId);
  } catch {
    logger.error(`Failed to parse source map for debug ID upload: ${sourceMapPath}`);
    return;
  }
  if (map["sources"] && Array.isArray(map["sources"])) {
    const mapDir = path__default.dirname(sourceMapPath);
    map["sources"] = map["sources"].map((source) => rewriteSourcesHook(source, map, { mapDir }));
  }
  try {
    await util__namespace.promisify(fs__default.writeFile)(targetPath, JSON.stringify(map), {
      encoding: "utf8"
    });
  } catch (e) {
    logger.error(`Failed to prepare source map for debug ID upload: ${sourceMapPath}`, e);
    return;
  }
}
const PROTOCOL_REGEX = /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//;
function defaultRewriteSourcesHook(source) {
  if (source.match(PROTOCOL_REGEX)) {
    return source.replace(PROTOCOL_REGEX, "");
  } else {
    return path__default.relative(process.cwd(), path__default.normalize(source));
  }
}

exports.addDebugIdToEmittedArtifacts = addDebugIdToEmittedArtifacts;
exports.createDebugIdUploadFunction = createDebugIdUploadFunction;
exports.defaultRewriteSourcesHook = defaultRewriteSourcesHook;
exports.determineSourceMapPathFromBundle = determineSourceMapPathFromBundle;
exports.prepareBundleForDebugIdUpload = prepareBundleForDebugIdUpload;
exports.stampDebugId = stampDebugId;
//# sourceMappingURL=debug-id-upload.js.map
