Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const utils = require('../core/utils.js');
const utils$1 = require('./utils.js');

function isAsyncIterable(value) {
  return !!value && typeof value[Symbol.asyncIterator] === "function";
}
function createStreamingState() {
  return {
    responseTexts: [],
    finishReasons: [],
    responseId: "",
    responseModel: "",
    promptTokens: void 0,
    completionTokens: void 0,
    totalTokens: void 0,
    toolCalls: {}
  };
}
function processToolCalls(toolCalls, state) {
  for (const toolCall of toolCalls) {
    const index = toolCall.index;
    if (index === void 0 || !toolCall.function) {
      continue;
    }
    const existing = state.toolCalls[index];
    if (!existing) {
      state.toolCalls[index] = {
        ...toolCall,
        function: { name: toolCall.function.name, arguments: toolCall.function.arguments ?? "" }
      };
    } else if (toolCall.function.arguments && existing.function) {
      existing.function.arguments = `${existing.function.arguments}${toolCall.function.arguments}`;
    }
  }
}
function processChunk(chunk, state, recordOutputs) {
  state.responseId = chunk.id ?? state.responseId;
  state.responseModel = chunk.model ?? state.responseModel;
  if (chunk.usage) {
    state.promptTokens = chunk.usage.promptTokens;
    state.completionTokens = chunk.usage.completionTokens;
    state.totalTokens = chunk.usage.totalTokens;
  }
  for (const choice of chunk.choices ?? []) {
    if (recordOutputs) {
      const content = utils$1.contentToString(choice.delta?.content);
      if (content) {
        state.responseTexts.push(content);
      }
      if (choice.delta?.toolCalls) {
        processToolCalls(choice.delta.toolCalls, state);
      }
    }
    if (choice.finishReason) {
      state.finishReasons.push(choice.finishReason);
    }
  }
}
function processEvent(event, state, recordOutputs) {
  const chunk = event?.data;
  if (chunk && typeof chunk === "object") {
    processChunk(chunk, state, recordOutputs);
  }
}
async function* instrumentIterator(iterate, state, recordOutputs, claim, settle) {
  try {
    for await (const event of { [Symbol.asyncIterator]: iterate }) {
      if (claim("iterator")) {
        processEvent(event, state, recordOutputs);
      }
      yield event;
    }
  } catch (error) {
    settle(error);
    throw error;
  } finally {
    settle();
  }
}
function wrapReader(reader, state, recordOutputs, claim, settle, markCancelled) {
  const originalRead = reader.read;
  const originalCancel = reader.cancel;
  const read = () => originalRead.call(reader);
  const cancel = typeof originalCancel === "function" ? (reason) => originalCancel.call(reader, reason) : void 0;
  return new Proxy(reader, {
    get(target, prop) {
      if (prop === "read") {
        return async () => {
          try {
            const result = await read();
            if (result.done) {
              settle();
            } else if (claim("reader")) {
              processEvent(result.value, state, recordOutputs);
            }
            return result;
          } catch (error) {
            settle(error);
            throw error;
          }
        };
      }
      if (prop === "cancel" && cancel) {
        return async (reason) => {
          markCancelled();
          try {
            return await cancel(reason);
          } finally {
            settle();
          }
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}
function instrumentedSource(readable) {
  const reader = readable.getReader();
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel?.(reason);
    }
  });
}
function instrumentEventStream(stream, span, recordOutputs) {
  if (!isAsyncIterable(stream)) {
    return false;
  }
  const state = createStreamingState();
  let consumer;
  let settled = false;
  let cancelled = false;
  const claim = (candidate) => {
    consumer ?? (consumer = candidate);
    return consumer === candidate;
  };
  const markCancelled = () => {
    cancelled = true;
  };
  const settle = (error) => {
    if (settled) {
      return;
    }
    settled = true;
    if (error !== void 0 && !cancelled) {
      span.setStatus({ code: core.SPAN_STATUS_ERROR, message: "internal_error" });
    }
    const toolCalls = Object.values(state.toolCalls);
    if (recordOutputs) {
      utils.setOutputMessagesAttribute(span, {
        responseText: state.responseTexts.join(""),
        toolCalls,
        finishReason: state.finishReasons[0]
      });
    }
    utils.endStreamSpan(span, { ...state, toolCalls }, recordOutputs);
  };
  const iterate = stream[Symbol.asyncIterator].bind(stream);
  const instrumented = instrumentIterator(iterate, state, recordOutputs, claim, settle);
  stream[Symbol.asyncIterator] = () => instrumented;
  const readable = stream;
  if (typeof readable.getReader === "function") {
    const getReader = readable.getReader.bind(readable);
    readable.getReader = (...args) => wrapReader(getReader(...args), state, recordOutputs, claim, settle, markCancelled);
  }
  if (typeof readable.cancel === "function") {
    const cancel = readable.cancel.bind(readable);
    readable.cancel = async (reason) => {
      markCancelled();
      try {
        return await cancel(reason);
      } finally {
        settle();
      }
    };
  }
  if (typeof readable.getReader === "function") {
    if (typeof readable.tee === "function") {
      readable.tee = () => instrumentedSource(readable).tee();
    }
    if (typeof readable.pipeTo === "function") {
      readable.pipeTo = (destination, options) => instrumentedSource(readable).pipeTo(destination, options);
    }
    if (typeof readable.pipeThrough === "function") {
      readable.pipeThrough = (transform, options) => instrumentedSource(readable).pipeThrough(
        transform,
        options
      );
    }
  }
  return true;
}

exports.instrumentEventStream = instrumentEventStream;
exports.isAsyncIterable = isAsyncIterable;
//# sourceMappingURL=streaming.js.map
