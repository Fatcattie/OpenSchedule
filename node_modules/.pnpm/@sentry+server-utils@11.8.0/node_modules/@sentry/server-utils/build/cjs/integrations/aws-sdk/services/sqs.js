Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const attributes = require('@sentry/conventions/attributes');
const op = require('@sentry/conventions/op');
const MessageAttributes = require('./MessageAttributes.js');

class SqsServiceExtension {
  requestPreSpanHook(request) {
    const queueUrl = extractQueueUrl(request.commandInput);
    const queueName = extractQueueNameFromUrl(queueUrl);
    let operation;
    let spanOp;
    const spanAttributes = {
      [attributes.MESSAGING_SYSTEM]: "aws_sqs",
      [attributes.MESSAGING_DESTINATION_NAME]: queueName,
      // oxlint-disable-next-line sdk/no-unfiltered-url-attributes -- SQS queue identifier, not an HTTP request URL
      [attributes.URL_FULL]: queueUrl,
      [attributes.SENTRY_KIND]: "client"
    };
    switch (request.commandName) {
      case "ReceiveMessage":
        {
          operation = "receive";
          spanOp = op.QUEUE_RECEIVE;
          spanAttributes[attributes.SENTRY_KIND] = "consumer";
          request.commandInput.MessageAttributeNames = MessageAttributes.addPropagationFieldsToAttributeNames(
            request.commandInput.MessageAttributeNames
          );
        }
        break;
      case "SendMessage":
      case "SendMessageBatch":
        operation = "send";
        spanOp = op.QUEUE_PUBLISH;
        spanAttributes[attributes.SENTRY_KIND] = "producer";
        break;
    }
    if (operation) {
      spanAttributes[attributes.MESSAGING_OPERATION_TYPE] = operation;
    }
    const client = core.getClient();
    const isStreamed = !!client && core.hasSpanStreamingEnabled(client);
    return {
      spanAttributes,
      spanName: buildSpanName(operation, queueName, isStreamed),
      // Fallback to `rpc` if there's no messaging operation
      spanOp
    };
  }
  requestPostSpanHook(request, span) {
    switch (request.commandName) {
      case "SendMessage":
        {
          const origMessageAttributes = request.commandInput.MessageAttributes ?? {};
          request.commandInput.MessageAttributes = MessageAttributes.injectPropagationContext(
            origMessageAttributes,
            core.getTraceData({ span })
          );
        }
        break;
      case "SendMessageBatch":
        {
          const entries = request.commandInput?.Entries;
          if (Array.isArray(entries)) {
            const traceData = core.getTraceData({ span });
            entries.forEach((messageParams) => {
              messageParams.MessageAttributes = MessageAttributes.injectPropagationContext(
                messageParams.MessageAttributes ?? {},
                traceData
              );
            });
          }
        }
        break;
    }
  }
  responseHook(response, span) {
    switch (response.request.commandName) {
      case "SendMessage":
        span.setAttribute(attributes.MESSAGING_MESSAGE_ID, response?.data?.MessageId);
        break;
      case "SendMessageBatch":
        break;
      case "ReceiveMessage": {
        const messages = response?.data?.Messages || [];
        span.setAttribute(attributes.MESSAGING_BATCH_MESSAGE_COUNT, messages.length);
        for (const message of messages) {
          linkReceivedMessageToProducer(span, message);
        }
        break;
      }
    }
  }
}
function linkReceivedMessageToProducer(span, message) {
  const headers = MessageAttributes.extractPropagationHeaders(message);
  if (!headers) {
    return;
  }
  const { parentSpanId, traceId, sampled } = core.propagationContextFromHeaders(headers.sentryTrace, headers.baggage);
  if (traceId && parentSpanId) {
    span.addLink({
      context: {
        traceId,
        spanId: parentSpanId,
        traceFlags: sampled ? 1 : 0
      },
      attributes: {
        [attributes.MESSAGING_MESSAGE_ID]: message.MessageId
      }
    });
  }
}
function buildSpanName(operation, queueName, isStreamed) {
  if (!operation) {
    return void 0;
  }
  if (!queueName) {
    return operation;
  }
  return isStreamed ? `${operation} ${queueName}` : `${queueName} ${operation}`;
}
function extractQueueUrl(commandInput) {
  return commandInput?.QueueUrl;
}
function extractQueueNameFromUrl(queueUrl) {
  if (!queueUrl) return void 0;
  const segments = queueUrl.split("/");
  if (segments.length === 0) return void 0;
  return segments[segments.length - 1] || void 0;
}

exports.SqsServiceExtension = SqsServiceExtension;
//# sourceMappingURL=sqs.js.map
