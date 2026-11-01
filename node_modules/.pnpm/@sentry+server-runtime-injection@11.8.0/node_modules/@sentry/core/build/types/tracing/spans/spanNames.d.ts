/**
 * Fallback name for pageload spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#browser-pageload
 */
export declare const PAGELOAD_SPAN_NAME_FALLBACK = "Pageload";
/**
 * Fallback name for navigation spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#browser-navigation
 */
export declare const NAVIGATION_SPAN_NAME_FALLBACK = "Navigation";
/**
 * Fallback name for db spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#db-queries
 */
export declare const DB_SPAN_NAME_FALLBACK = "Database operation";
/**
 * Fallback name for gen_ai agent spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#gen_ai-agent
 */
export declare const GEN_AI_AGENT_SPAN_NAME_FALLBACK = "Generative AI agent operation";
/**
 * Fallback name for gen_ai model spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#gen_ai-inference
 */
export declare const GEN_AI_INFERENCE_SPAN_NAME_FALLBACK = "Generative AI model operation";
/**
 * Fallback name for graphql spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#graphql-graphql
 */
export declare const GRAPHQL_SPAN_NAME_FALLBACK = "GraphQL Operation";
/**
 * Fallback name for http.(client|server) spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#http
 */
export declare const HTTP_SPAN_NAME_FALLBACK = "HTTP";
/**
 * Fallback name for messaging spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#messaging
 */
export declare const MESSAGING_SPAN_NAME_FALLBACK = "Messaging";
/**
 * Fallback name for mcp server spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#mcp-server
 */
export declare const MCP_SERVER_SPAN_NAME_FALLBACK = "MCP server operation";
/**
 * Fallback name for mcp notification spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#mcp-notification
 */
export declare const MCP_NOTIFICATION_SPAN_NAME_FALLBACK = "MCP notification";
/**
 * Fallback name for resource spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#resource-resources
 */
export declare const RESOURCE_SPAN_NAME_FALLBACK = "Resource";
/**
 * Fallback name for router spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#routing-router
 */
export declare const ROUTER_SPAN_NAME_FALLBACK = "Router";
/**
 * Fallback name for request handler spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#web_server-request-handler
 */
export declare const REQUEST_HANDLER_SPAN_NAME_FALLBACK = "Request handler";
/**
 * Fallback name for serverless function execution spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#faas-serverless-function-execution
 */
export declare const SERVERLESS_FUNCTION_SPAN_NAME_FALLBACK = "Serverless function execution";
/**
 * Fallback name for function execution spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#function
 */
export declare const FUNCTION_SPAN_NAME_FALLBACK = "Function execution";
/**
 * Fallback name for ui.mount spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#ui-component-mount
 */
export declare const UI_MOUNT_SPAN_NAME_FALLBACK = "Component mount";
/**
 * Fallback name for ui.update spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#ui-component-update
 */
export declare const UI_UPDATE_SPAN_NAME_FALLBACK = "Component update";
/**
 * Fallback name for ui.render spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#ui-component-render
 */
export declare const UI_RENDER_SPAN_NAME_FALLBACK = "Component render";
/**
 * Fallback name for ui.unmount spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#ui-component-unmount
 */
export declare const UI_UNMOUNT_SPAN_NAME_FALLBACK = "Component unmount";
/**
 * Fallback name for ui.resolve spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#ui-component-resolve
 */
export declare const UI_RESOLVE_SPAN_NAME_FALLBACK = "Component resolve";
/**
 * Fallback name for ui.task spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#ui-ui-task
 */
export declare const UI_TASK_SPAN_NAME_FALLBACK = "UI task";
/**
 * Fallback name for ui.long_task and ui.long_animation_frame spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#ui-main-ui-thread-blocked
 */
export declare const UI_LONG_TASK_SPAN_NAME_FALLBACK = "Main UI thread blocked";
/**
 * Fallback name for ui.action spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#ui-ui-action
 */
export declare const UI_ACTION_SPAN_NAME_FALLBACK = "UI action";
/**
 * Fallback name for ui.action.click spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#ui-click-action
 */
export declare const UI_ACTION_CLICK_SPAN_NAME_FALLBACK = "Click";
/**
 * Fallback name for ui.interaction.click spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#ui-click-interaction
 */
export declare const UI_INTERACTION_CLICK_SPAN_NAME_FALLBACK = "Click";
/**
 * Fallback name for ui.interaction.hover spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#ui-hover-interaction
 */
export declare const UI_INTERACTION_HOVER_SPAN_NAME_FALLBACK = "Hover";
/**
 * Fallback name for ui.interaction.drag spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#ui-drag-interaction
 */
export declare const UI_INTERACTION_DRAG_SPAN_NAME_FALLBACK = "Drag";
/**
 * Fallback name for ui.interaction.press spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#ui-key-press-interaction
 */
export declare const UI_INTERACTION_PRESS_SPAN_NAME_FALLBACK = "Key press";
/**
 * Fallback name for ui.webvital.lcp spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#ui-largest-contentful-paint
 */
export declare const UI_WEBVITAL_LCP_SPAN_NAME_FALLBACK = "Largest contentful paint";
/**
 * Fallback name for ui.webvital.cls spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#ui-layout-shift
 */
export declare const UI_WEBVITAL_CLS_SPAN_NAME_FALLBACK = "Layout shift";
/**
 * Fallback name for generic ui spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#ui-ui
 */
export declare const UI_SPAN_NAME_FALLBACK = "UI";
/**
 * The `cache.operation` attribute value each cache op carries. Cache span names are
 * `cache.{{cache.operation}}`, so the op constant itself doubles as the low-cardinality span name.
 * @see https://getsentry.github.io/sentry-conventions/names/#cache
 */
export declare const CACHE_OPERATION_NAMES: {
    readonly "cache.get": 'get';
    readonly "cache.put": 'put';
    readonly "cache.remove": 'remove';
};
/**
 * Span names for the browser navigation timing ops, keyed by op. None of these ops has an attribute
 * template, so the static name is the only name they can get.
 * @see https://getsentry.github.io/sentry-conventions/names/#browser-navigation-timing
 */
export declare const BROWSER_NAVIGATION_TIMING_SPAN_NAMES: {
    readonly "browser.cache": 'Cache lookup';
    readonly "browser.dns": 'DNS lookup';
    readonly "browser.connect": 'Connect';
    readonly "browser.tls_ssl": 'TLS handshake';
    readonly "browser.redirect": 'Redirect';
    readonly "browser.request": 'Request';
    readonly "browser.response": 'Response';
    readonly "browser.unload_event": 'Unload event';
    readonly "browser.dom_content_loaded_event": 'DOMContentLoaded event';
    readonly "browser.load_event": 'Load event';
};
//# sourceMappingURL=spanNames.d.ts.map