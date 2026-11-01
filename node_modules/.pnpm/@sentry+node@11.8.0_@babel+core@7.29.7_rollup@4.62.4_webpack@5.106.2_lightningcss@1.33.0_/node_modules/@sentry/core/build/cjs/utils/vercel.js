Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

function getVercelEnv() {
  if (typeof process === "undefined") {
    return void 0;
  }
  return process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV || void 0;
}

exports.getVercelEnv = getVercelEnv;
//# sourceMappingURL=vercel.js.map
