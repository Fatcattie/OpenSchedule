Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');

const NODE_VERSION = core.parseSemver(process.versions.node);
NODE_VERSION.major;
NODE_VERSION.minor;

exports.NODE_VERSION = NODE_VERSION;
//# sourceMappingURL=nodeVersion.js.map
