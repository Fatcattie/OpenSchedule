import { DB_STORED_PROCEDURE_NAME } from '@sentry/conventions/attributes';
import { getClient, hasSpanStreamingEnabled } from '@sentry/core';

const DB_SYSTEM_VALUE_REDIS = "redis";
const STORED_PROCEDURE_COMMANDS = ["fcall", "fcall_ro"];
function getStoredProcedureName(command, args) {
  if (!STORED_PROCEDURE_COMMANDS.includes(command.toLowerCase())) {
    return void 0;
  }
  const raw = args[0];
  const name = typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString() : void 0;
  return name && name !== "?" ? name : void 0;
}
function getServerTarget({ host, port }) {
  const hasPort = typeof port === "number" || typeof port === "string" && !!port;
  return typeof host === "string" && host && hasPort ? `${host}:${port}` : void 0;
}
function getRedisQueryNaming(command, args, connection) {
  const storedProcedure = getStoredProcedureName(command, args);
  const target = storedProcedure || getServerTarget(connection);
  const name = command && target ? `${command} ${target}` : target || DB_SYSTEM_VALUE_REDIS;
  const client = getClient();
  return {
    streamedName: client && hasSpanStreamingEnabled(client) ? name : void 0,
    attributes: storedProcedure ? { [DB_STORED_PROCEDURE_NAME]: storedProcedure } : {}
  };
}

export { getRedisQueryNaming };
//# sourceMappingURL=redis-span-name.js.map
