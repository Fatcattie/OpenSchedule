import { parseSemver } from '@sentry/core';

const NODE_VERSION = parseSemver(process.versions.node);
NODE_VERSION.major;
NODE_VERSION.minor;

export { NODE_VERSION };
//# sourceMappingURL=nodeVersion.js.map
