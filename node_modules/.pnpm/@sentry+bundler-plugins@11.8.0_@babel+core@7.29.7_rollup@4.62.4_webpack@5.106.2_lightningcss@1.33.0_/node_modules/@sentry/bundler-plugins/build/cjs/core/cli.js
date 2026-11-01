Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const sentry = require('sentry');
const utils = require('./utils.js');

var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var _options, _sdk, _SentryCliAdapter_instances, createClient_fn;
function serializeIgnore(ignore) {
  if (!ignore) {
    return void 0;
  }
  const patterns = utils.arrayify(ignore);
  return patterns.length > 0 ? patterns.join(",") : void 0;
}
class SentryCliAdapter {
  constructor(options) {
    __privateAdd(this, _SentryCliAdapter_instances);
    __privateAdd(this, _options);
    /** Client for every command that is not scoped to a specific project. */
    __privateAdd(this, _sdk);
    __privateSet(this, _options, options);
    __privateSet(this, _sdk, __privateMethod(this, _SentryCliAdapter_instances, createClient_fn).call(this));
  }
  /** Create a release and associate it with the configured project(s). */
  async createRelease(name) {
    return __privateGet(this, _sdk).release.create({ orgVersion: name, project: utils.getProjects(__privateGet(this, _options).project)?.join(",") });
  }
  /** Finalize a release by stamping an end timestamp. */
  async finalizeRelease(name) {
    await __privateGet(this, _sdk).release.finalize({ orgVersion: name });
  }
  /**
   * Associate commits with a release. Translates the plugin's {@link SetCommitsOptions} `auto` /
   * `repo`+`commit` union into the flags accepted by `sentry release set-commits`. The old CLI's
   * `ignoreMissing`/`ignoreEmpty` toggles have no equivalent flag on the new CLI; the caller's
   * `shouldNotThrowOnFailure` handling still swallows the "no repository" failure case.
   */
  async setCommits(name, setCommitsOptions) {
    const { auto, repo, commit, previousCommit } = setCommitsOptions;
    const commitSpec = repo && commit ? `${repo}@${previousCommit ? `${previousCommit}..${commit}` : commit}` : void 0;
    await __privateGet(this, _sdk).release["set-commits"]({
      orgVersion: name,
      auto: auto === true,
      commit: commitSpec
    });
  }
  /** Create a deploy for a release. */
  async newDeploy(name, deploy) {
    if (deploy === false) {
      return;
    }
    await __privateGet(this, _sdk).release.deploy({
      orgVersion: name,
      environment: deploy.env,
      name: deploy.name,
      url: deploy.url,
      started: deploy.started !== void 0 ? String(deploy.started) : void 0,
      finished: deploy.finished !== void 0 ? String(deploy.finished) : void 0,
      time: deploy.time !== void 0 ? String(deploy.time) : void 0
    });
  }
  /**
   * Upload sourcemaps for one or more directories. The old CLI accepted a structured `include`
   * array; the new `sourcemap upload` command takes a single directory, so we upload each target
   * separately. A client is created per project because project selection is bound at client
   * creation time.
   */
  async uploadSourcemaps(name, targets) {
    const projects = utils.getProjects(__privateGet(this, _options).project) ?? [void 0];
    for (const project of projects) {
      const sdk = __privateMethod(this, _SentryCliAdapter_instances, createClient_fn).call(this, project);
      for (const target of targets) {
        await sdk.sourcemap.upload({
          directory: target.directory,
          release: name,
          dist: target.dist ?? __privateGet(this, _options).release.dist,
          ext: target.ext?.join(","),
          ignore: serializeIgnore(target.ignore),
          ignoreFile: target.ignoreFile,
          urlPrefix: target.urlPrefix
        });
      }
    }
  }
  /** Inject debug IDs into the given build artifacts. */
  async injectDebugIds(directories, ignore) {
    const serializedIgnore = serializeIgnore(ignore) ?? "node_modules";
    for (const directory of directories) {
      await __privateGet(this, _sdk).sourcemap.inject({ directory, ignore: serializedIgnore });
    }
  }
  /**
   * Resolve the Sentry server URL the CLI is configured to talk to. Used by the telemetry guard
   * to decide whether the current build targets Sentry SaaS. Returns `undefined` on error.
   */
  async getServerUrl() {
    try {
      const info = await __privateGet(this, _sdk).run("info");
      return info.config?.url;
    } catch {
      return void 0;
    }
  }
}
_options = new WeakMap();
_sdk = new WeakMap();
_SentryCliAdapter_instances = new WeakSet();
/**
 * The CLI binds `org`/`project`/`url` when the client is created rather than per call, so a
 * client scoped to a different project needs to be a different client.
 *
 * Creating one is free: it reads no config and opens no connection, it only closes over these
 * options. Everything happens when a command is actually invoked.
 */
createClient_fn = function(project) {
  const options = {
    token: __privateGet(this, _options).authToken,
    org: __privateGet(this, _options).org,
    project,
    url: __privateGet(this, _options).url,
    headers: __privateGet(this, _options).headers
  };
  return sentry.createSentrySDK(options);
};

exports.SentryCliAdapter = SentryCliAdapter;
//# sourceMappingURL=cli.js.map
