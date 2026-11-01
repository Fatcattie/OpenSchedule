import { debug, isObjectLike, getClient, hasSpanStreamingEnabled, startSpanManual, SPAN_STATUS_ERROR, getActiveSpan } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build.js';
import { sanitizeSqlQuery, getSqlQuerySummary } from '../utils/sql.js';
import { DB_NAMESPACE, SERVER_ADDRESS, SERVER_PORT, DB_OPERATION_NAME, DB_QUERY_SUMMARY, DB_QUERY_TEXT, DB_SYSTEM_NAME, SENTRY_ORIGIN, SENTRY_OP } from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';

const SQL_OPERATION_REGEX = /^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i;
const CONNECTION_CONTEXT_SYMBOL = /* @__PURE__ */ Symbol("sentryPostgresConnectionContext");
const INSTRUMENTED_MARKER = /* @__PURE__ */ Symbol.for("sentry.instrumented.postgresjs");
const QUERY_FROM_INSTRUMENTED_SQL = /* @__PURE__ */ Symbol.for("sentry.query.from.instrumented.sql");
function instrumentPostgresJsSql(sql, options) {
  if (!sql || typeof sql !== "function") {
    DEBUG_BUILD && debug.warn("instrumentPostgresJsSql: provided value is not a valid postgres.js sql instance");
    return sql;
  }
  return _instrumentSqlInstance(sql, { requireParentSpan: true, ...options });
}
function _instrumentSqlInstance(sql, options, parentConnectionContext) {
  if (sql[INSTRUMENTED_MARKER]) {
    return sql;
  }
  const proxiedSql = new Proxy(sql, {
    apply(target, thisArg, argumentsList) {
      const query = Reflect.apply(target, thisArg, argumentsList);
      if (isObjectLike(query) && "handle" in query) {
        _wrapSingleQueryHandle(query, proxiedSql, options);
      }
      return query;
    },
    get(target, prop) {
      const original = target[prop];
      if (typeof prop !== "string" || typeof original !== "function") {
        return original;
      }
      if (prop === "unsafe" || prop === "file") {
        return _wrapQueryMethod(original, target, proxiedSql, options);
      }
      if (prop === "begin" || prop === "reserve") {
        return _wrapCallbackMethod(original, target, proxiedSql, options);
      }
      return original;
    }
  });
  if (parentConnectionContext) {
    proxiedSql[CONNECTION_CONTEXT_SYMBOL] = parentConnectionContext;
  } else {
    _attachConnectionContext(sql, proxiedSql);
  }
  sql[INSTRUMENTED_MARKER] = true;
  proxiedSql[INSTRUMENTED_MARKER] = true;
  return proxiedSql;
}
function _wrapQueryMethod(original, target, proxiedSql, options) {
  return function(...args) {
    const query = Reflect.apply(original, target, args);
    if (isObjectLike(query) && "handle" in query) {
      _wrapSingleQueryHandle(query, proxiedSql, options);
    }
    return query;
  };
}
function _wrapCallbackMethod(original, target, parentSqlInstance, options) {
  return function(...args) {
    const parentContext = parentSqlInstance[CONNECTION_CONTEXT_SYMBOL];
    const isCallbackBased = typeof args[args.length - 1] === "function";
    if (!isCallbackBased) {
      const result = Reflect.apply(original, target, args);
      if (result && typeof result.then === "function") {
        return result.then((sqlInstance) => {
          return _instrumentSqlInstance(sqlInstance, options, parentContext);
        });
      }
      return result;
    }
    const callback = args.length === 1 ? args[0] : args[1];
    const wrappedCallback = function(sqlInstance) {
      const instrumentedSql = _instrumentSqlInstance(sqlInstance, options, parentContext);
      return callback(instrumentedSql);
    };
    const newArgs = args.length === 1 ? [wrappedCallback] : [args[0], wrappedCallback];
    return Reflect.apply(original, target, newArgs);
  };
}
function _wrapSingleQueryHandle(query, sqlInstance, options) {
  if (query.handle?.__sentryWrapped) {
    return;
  }
  query[QUERY_FROM_INSTRUMENTED_SQL] = true;
  const originalHandle = query.handle;
  const wrappedHandle = async function(...args) {
    if (this.executed || !_shouldCreateSpans(options)) {
      return originalHandle.apply(this, args);
    }
    const fullQuery = _reconstructQuery(query.strings);
    const sanitizedSqlQuery = sanitizeSqlQuery(fullQuery);
    const client = getClient();
    const querySummary = getSqlQuerySummary(sanitizedSqlQuery);
    const connectionContext = sqlInstance ? sqlInstance[CONNECTION_CONTEXT_SYMBOL] : void 0;
    const name = client && hasSpanStreamingEnabled(client) ? querySummary || connectionContext?.ATTR_DB_NAMESPACE || "postgres" : sanitizedSqlQuery || "postgresjs.query";
    return startSpanManual(
      {
        name,
        attributes: {
          [SENTRY_OP]: DB,
          [SENTRY_ORIGIN]: "auto.db.postgresjs",
          [DB_SYSTEM_NAME]: "postgres",
          [DB_QUERY_TEXT]: sanitizedSqlQuery,
          [DB_QUERY_SUMMARY]: querySummary,
          [DB_OPERATION_NAME]: _getOperationName(sanitizedSqlQuery),
          ...connectionContext && _getConnectionAttributes(connectionContext)
        }
      },
      (span) => {
        if (options.requestHook) {
          try {
            options.requestHook(span, sanitizedSqlQuery, connectionContext);
          } catch (e) {
            span.setAttribute("sentry.hook.error", "requestHook failed");
            DEBUG_BUILD && debug.error("Error in requestHook for PostgresJs instrumentation:", e);
          }
        }
        const queryWithCallbacks = this;
        queryWithCallbacks.resolve = new Proxy(queryWithCallbacks.resolve, {
          apply: (resolveTarget, resolveThisArg, resolveArgs) => {
            try {
              span.setAttribute(DB_OPERATION_NAME, _getOperationName(sanitizedSqlQuery, resolveArgs?.[0]?.command));
              span.end();
            } catch (e) {
              DEBUG_BUILD && debug.error("Error ending span in resolve callback:", e);
            }
            return Reflect.apply(resolveTarget, resolveThisArg, resolveArgs);
          }
        });
        queryWithCallbacks.reject = new Proxy(queryWithCallbacks.reject, {
          apply: (rejectTarget, rejectThisArg, rejectArgs) => {
            try {
              span.setStatus({
                code: SPAN_STATUS_ERROR,
                message: rejectArgs?.[0]?.message || "unknown_error"
              });
              span.setAttribute("db.response.status_code", rejectArgs?.[0]?.code || "unknown");
              span.setAttribute("error.type", rejectArgs?.[0]?.name || "unknown");
              span.end();
            } catch (e) {
              DEBUG_BUILD && debug.error("Error ending span in reject callback:", e);
            }
            return Reflect.apply(rejectTarget, rejectThisArg, rejectArgs);
          }
        });
        try {
          return originalHandle.apply(this, args);
        } catch (e) {
          span.setStatus({
            code: SPAN_STATUS_ERROR,
            message: e instanceof Error ? e.message : "unknown_error"
          });
          span.end();
          throw e;
        }
      }
    );
  };
  wrappedHandle.__sentryWrapped = true;
  query.handle = wrappedHandle;
}
function _shouldCreateSpans(options) {
  const hasParentSpan = getActiveSpan() !== void 0;
  return hasParentSpan || !options.requireParentSpan;
}
function _reconstructQuery(strings) {
  if (!strings?.length) {
    return void 0;
  }
  if (strings.length === 1) {
    return strings[0] || void 0;
  }
  return strings.reduce((acc, str, i) => i === 0 ? str : `${acc}$${i}${str}`, "");
}
function _getConnectionAttributes(connectionContext) {
  const attributes = {};
  const portNumber = connectionContext.ATTR_SERVER_PORT ? parseInt(connectionContext.ATTR_SERVER_PORT, 10) : void 0;
  const dbNamespace = connectionContext.ATTR_DB_NAMESPACE;
  const serverAddress = connectionContext.ATTR_SERVER_ADDRESS;
  if (dbNamespace) {
    attributes[DB_NAMESPACE] = dbNamespace;
  }
  if (serverAddress) {
    attributes[SERVER_ADDRESS] = serverAddress;
  }
  if (portNumber !== void 0 && !isNaN(portNumber)) {
    attributes[SERVER_PORT] = portNumber;
  }
  return attributes;
}
function _getOperationName(sanitizedQuery, command) {
  if (command) {
    return command;
  }
  const operationMatch = sanitizedQuery?.match(SQL_OPERATION_REGEX);
  return operationMatch?.[1]?.toUpperCase();
}
function _buildConnectionContext(options) {
  const host = options.host?.[0] || "localhost";
  const port = options.port?.[0] || 5432;
  return {
    ATTR_DB_NAMESPACE: typeof options.database === "string" && options.database !== "" ? options.database : void 0,
    ATTR_SERVER_ADDRESS: host,
    ATTR_SERVER_PORT: String(port)
  };
}
function _attachConnectionContext(sql, proxiedSql) {
  const sqlInstance = sql;
  if (!sqlInstance.options || typeof sqlInstance.options !== "object") {
    return;
  }
  proxiedSql[CONNECTION_CONTEXT_SYMBOL] = _buildConnectionContext(sqlInstance.options);
}

export { _buildConnectionContext, _getConnectionAttributes, _getOperationName, _reconstructQuery, instrumentPostgresJsSql };
//# sourceMappingURL=postgresjs.js.map
