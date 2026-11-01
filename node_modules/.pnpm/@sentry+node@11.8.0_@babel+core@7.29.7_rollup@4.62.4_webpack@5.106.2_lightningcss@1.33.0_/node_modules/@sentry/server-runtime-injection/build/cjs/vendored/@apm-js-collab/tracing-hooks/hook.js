Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const node = require('../../debug/src/node.js');
const index = require('../code-transformer/index.js');
const index$1 = require('../../module-details-from-path/index.js');
const require$$3 = require('node:url');
const require$$1 = require('node:path');
const node_worker_threads = require('node:worker_threads');
const getPackageVersion = require('./lib/get-package-version.js');
const diagnostics = require('./lib/diagnostics.js');
const require$$0 = require('node:fs');

const debug = node.default('@apm-js-collab/tracing-hooks:esm-hook');
let transformers = null;
let packages = null;
let instrumentator = null;

// On the main thread diagnostics go straight to the hook set via
// `setDiagnosticsHook`. When these hooks run on the `Module.register` loader
// thread, `initialize` swaps this for a function that posts back over the
// MessagePort supplied in `data.diagnosticsPort`.
let emit = diagnostics.diagnostics.emitDiagnostics;

/**
 * Creates a MessagePort that forwards diagnostics posted by the `Module.register`
 * loader thread to the hook set via `setDiagnosticsHook` on this thread. Pass the
 * returned port to `Module.register` in both `data.diagnosticsPort` and
 * `transferList`.
 */
function createDiagnosticsPort() {
  const { port1, port2 } = new node_worker_threads.MessageChannel();
  port1.on('message', diagnostics.diagnostics.emitDiagnostics);
  // The diagnostics channel must not keep the process alive.
  port1.unref();
  return port2
}

async function initialize(data = {}) {
  return initializeSync(data)
}
function initializeSync(data = {}) {
  const instrumentations = data?.instrumentations || [];
  instrumentator = index.codeTransformer.create(instrumentations);
  packages = new Set(instrumentations.map(i => i.module.name));
  transformers = new Map();
  emit = data?.diagnosticsPort ? createPortEmitter(data.diagnosticsPort) : diagnostics.diagnostics.emitDiagnostics;
}

function createPortEmitter(port) {
  return (diag) => {
    try {
      // Structured clone reliably carries Error instances but not arbitrary thrown
      // values, so flatten anything else to an Error rather than let postMessage
      // throw inside the load path.
      const error = diag.error === undefined || diag.error instanceof Error
        ? diag.error
        : new Error(String(diag.error));
      port.postMessage({ ...diag, error });
    } catch (err) {
      debug('failed to post diagnostics for %s: %o', diag.url, err);
    }
  }
}

async function resolve(specifier, context, nextResolve) {
  return resolveFromURL(await nextResolve(specifier, context))
}
function resolveFromURL(url) {
  if (!url.url.startsWith('file:')) {
    return url
  }
  const resolvedModule = index$1.default(require$$3.fileURLToPath(url.url));
  if (resolvedModule && packages.has(resolvedModule.name)) {
    const path = resolvedModule.basedir;
    const version = getPackageVersion.default(path);
    const transformer = instrumentator.getTransformer(resolvedModule.name, version, resolvedModule.path);
    if (transformer) {
      transformers.set(url.url, transformer);
    }
  }
  return url
}
function resolveSync(specifier, context, nextResolve) {
  return resolveFromURL(nextResolve(specifier, context))
}

async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);

  if (transformers.has(url) === false) {
    return result
  }

  if (result.format === 'commonjs') {
    // CommonJS is always left to the `Module.prototype._compile` patch
    // (`ModulePatch`), which these hooks are only ever registered alongside.
    // Returning `source` for a CommonJS module instead makes Node evaluate it on the
    // synchronous require(esm) bridge, which throws ERR_VM_MODULE_LINK_FAILURE on
    // Node < 24.12 when the module's top-level require() chain reaches an ES module
    // (https://github.com/nodejs/node/issues/59666). Handing the module back exactly
    // as Node produced it (`source` is null) sends it down the ordinary CommonJS
    // loader, where `_compile` transforms it.
    //
    // `resolve` has already put a transformer in the map for this URL and nothing
    // downstream will free it, so do that here.
    debug('deferring commonjs module to the _compile patch %s', url);
    const transformer = transformers.get(url);
    transformer.free();
    transformers.delete(url);
    return result
  }

  return loadResult(url, result)
}

// Unlike the async `load` hook above, this one must transform CommonJS: the sync hooks
// are never paired with a `_compile` patch, so they are the only thing that can, and
// they don't evaluate CommonJS on the require(esm) bridge.
function loadSync(url, context, nextLoad) {
  const result = nextLoad(url, context);

  if (transformers.has(url) === false) {
    return result
  }

  if (result.format === 'commonjs') {
    const parsedUrl = new URL(result.responseURL ?? url);
    result.source ??= require$$0.readFileSync(parsedUrl);
  }

  return loadResult(url, result)
}

function loadResult(url, result) {
  const code = result.source;
  if (code) {
    const transformer = transformers.get(url);
    if (isJSON(url, result.format)) {
      // `resolve` matched the path, but there is nothing here to
      // instrument, and nothing downstream will free the transformer.
      debug('skipping json module %s', url);
      transformer.free();
      transformers.delete(url);
      return result
    }
    try {
      // Node's synchronous hooks (`Module.registerHooks`) deliver `source` as a plain `Uint8Array`,
      // whereas the async loader delivers a `Buffer`. `Uint8Array.prototype.toString('utf8')` ignores
      // the encoding and returns comma-joined byte values instead of the decoded text, so decode via
      // `Buffer` for anything that isn't already a string.
      const source = typeof code === 'string' ? code : Buffer.from(code).toString('utf8');
      const moduleType = result.format === 'module' ? 'esm' :
        result.format === 'commonjs' ? 'cjs' : unlabeledModuleType(url, source);
      const transformedCode = transformer.transform(source, moduleType);
      result.source = transformedCode?.code;
      result.shortCircuit = true;
      emit({ url, moduleName: transformer.moduleName });
    } catch (err) {
      debug('Error transforming module %s: %o', url, err);
      emit({ url, moduleName: transformer.moduleName, error: err });
    } finally {
      transformer.free();
    }
  }

  return result
}

// A `.json` path, with any query or fragment after it.
const jsonPath = /\.json([?#]|$)/;

// JSON is data, so no module type fits it and no instrumentation can
// match inside it. Parsing it as JavaScript only reports a false error to
// the diagnostics hook. Node labels it `format: 'json'`, but Deno's sync
// hooks label nothing at all, so only the path settles it there (issue
// #53). The path is enough on its own: an `import` needs
// `with { type: 'json' }` to load a `.json` file, and `require()` of one
// always parses it as data.
function isJSON(url, format) {
  return format === 'json' || jsonPath.test(url)
}

// Top level `import`/`export`. A dynamic `import()` call is not included,
// because CommonJS can use it too.
const esmSyntax = /(^|[\n;])\s*(import\s+|import\s*[{*'"]|export\b)/;

// Decide how to transform a module that the host's hooks did not label with a
// `format`. Deno's sync hooks label nothing, and Deno loads CommonJS as well
// as ESM, so the runtime alone does not answer the question. Guessing wrong
// breaks the module: `require()` in an ES module throws `ReferenceError:
// require is not defined`, and `import` in a CommonJS module is a syntax
// error.
function unlabeledModuleType(url, source) {
  return declaredModuleType(url) ?? (esmSyntax.test(source) ? 'esm' : 'cjs')
}

// The type the file layout declares, by the rules Node and Deno share: the
// extension wins, then the `"type"` of the nearest enclosing package.json.
// Returns undefined when neither settles it, which leaves the source to say.
function declaredModuleType(url) {
  let file;
  try {
    file = require$$3.fileURLToPath(url);
  } catch {
    // Not a file: URL. There is nothing on disk to read.
    return undefined
  }
  // `.mts` and `.cts` pin the type the same way `.mjs` and `.cjs` do. The
  // source is a poor substitute for them: a `.cts` file may carry a top level
  // `import type`, which strips away at runtime but reads as ESM here.
  if (file.endsWith('.mjs') || file.endsWith('.mts')) return 'esm'
  if (file.endsWith('.cjs') || file.endsWith('.cts')) return 'cjs'
  const type = nearestPackageType(require$$1.dirname(file));
  return type === 'module' ? 'esm' : type === 'commonjs' ? 'cjs' : undefined
}

const packageTypes = new Map();

// The `"type"` of the nearest package.json at or above `dir`. A package.json
// that declares no `"type"` still ends the walk, exactly as it does for the
// runtime, and yields undefined.
function nearestPackageType(dir) {
  if (packageTypes.has(dir)) return packageTypes.get(dir)
  let type;
  try {
    type = JSON.parse(require$$0.readFileSync(require$$1.join(dir, 'package.json'), 'utf8')).type;
  } catch {
    const parent = require$$1.dirname(dir);
    if (parent !== dir) type = nearestPackageType(parent);
  }
  packageTypes.set(dir, type);
  return type
}

exports.createDiagnosticsPort = createDiagnosticsPort;
exports.initialize = initialize;
exports.initializeSync = initializeSync;
exports.load = load;
exports.loadResult = loadResult;
exports.loadSync = loadSync;
exports.resolve = resolve;
exports.resolveSync = resolveSync;
exports.setDiagnosticsHook = diagnostics.diagnostics.setDiagnosticsHook;
//# sourceMappingURL=hook.js.map
