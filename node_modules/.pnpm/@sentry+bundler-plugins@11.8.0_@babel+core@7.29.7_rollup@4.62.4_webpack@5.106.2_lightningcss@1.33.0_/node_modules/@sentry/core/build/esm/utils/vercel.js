function getVercelEnv() {
  if (typeof process === "undefined") {
    return void 0;
  }
  return process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV || void 0;
}

export { getVercelEnv };
//# sourceMappingURL=vercel.js.map
