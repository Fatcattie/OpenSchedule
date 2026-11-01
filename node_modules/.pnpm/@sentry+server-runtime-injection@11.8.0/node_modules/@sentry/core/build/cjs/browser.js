Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const browserSpanApi = require('./tracing/browserSpanApi.js');
const idleSpan = require('./tracing/idleSpan.js');



exports._INTERNAL_ensureBrowserSpanStreaming = browserSpanApi._INTERNAL_ensureBrowserSpanStreaming;
exports.startInactiveSpan = browserSpanApi.startInactiveSpan;
exports.startSpan = browserSpanApi.startSpan;
exports.startSpanManual = browserSpanApi.startSpanManual;
exports.startIdleSpan = idleSpan.startIdleSpan;
//# sourceMappingURL=browser.js.map
