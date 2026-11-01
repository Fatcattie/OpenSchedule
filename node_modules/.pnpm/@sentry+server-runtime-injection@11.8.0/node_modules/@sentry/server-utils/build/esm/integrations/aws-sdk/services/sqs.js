import { getClient, hasSpanStreamingEnabled, getTraceData, propagationContextFromHeaders } from '@sentry/core';
import { SENTRY_KIND, MESSAGING_OPERATION_TYPE, MESSAGING_BATCH_MESSAGE_COUNT, MESSAGING_MESSAGE_ID, URL_FULL, MESSAGING_DESTINATION_NAME, MESSAGING_SYSTEM } from '@sentry/conventions/attributes';
import { QUEUE_PUBLISH, QUEUE_RECEIVE } from '@sentry/conventions/op';
import { addPropagationFieldsToAttributeNames, injectPropagationContext, extractPropagationHeaders } from './MessageAttributes.js';

class SqsServiceExtension {
  requestPreSpanHook(request) {
    const queueUrl = extractQueueUrl(request.commandInput);
    const queueName = extractQueueNameFromUrl(queueUrl);
    let operation;
    let spanOp;
    const spanAttributes = {
      [MESSAGING_SYSTEM]: "aws_sqs",
      [MESSAGING_DESTINATION_NAME]: queueName,
      // oxlint-disable-next-line sdk/no-unfiltered-url-attributes -- SQS queue identifier, not an HTTP request URL
      [URL_FULL]: queueUrl,
      [SENTRY_KIND]: "client"
    };
    switch (request.commandName) {
      case "ReceiveMessage":
        {
          operation = "receive";
          spanOp = QUEUE_RECEIVE;
          spanAttributes[SENTRY_KIND] = "consumer";
          request.commandInput.MessageAttributeNames = addPropagationFieldsToAttributeNames(
            request.commandInput.MessageAttributeNames
          );
        }
        break;
      case "SendMessage":
      case "SendMessageBatch":
        operation = "send";
        spanOp = QUEUE_PUBLISH;
        spanAttributes[SENTRY_KIND] = "producer";
        break;
    }
    if (operation) {
      spanAttributes[MESSAGING_OPERATION_TYPE] = operation;
    }
    const client = getClient();
    const isStreamed = !!client && hasSpanStreamingEnabled(client);
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
          request.commandInput.MessageAttributes = injectPropagationContext(
            origMessageAttributes,
            getTraceData({ span })
          );
        }
        break;
      case "SendMessageBatch":
        {
          const entries = request.commandInput?.Entries;
          if (Array.isArray(entries)) {
            const traceData = getTraceData({ span });
            entries.forEach((messageParams) => {
              messageParams.MessageAttributes = injectPropagationContext(
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
        span.setAttribute(MESSAGING_MESSAGE_ID, response?.data?.MessageId);
        break;
      case "SendMessageBatch":
        break;
      case "ReceiveMessage": {
        const messages = response?.data?.Messages || [];
        span.setAttribute(MESSAGING_BATCH_MESSAGE_COUNT, messages.length);
        for (const message of messages) {
          linkReceivedMessageToProducer(span, message);
        }
        break;
      }
    }
  }
}
function linkReceivedMessageToProducer(span, message) {
  const headers = extractPropagationHeaders(message);
  if (!headers) {
    return;
  }
  const { parentSpanId, traceId, sampled } = propagationContextFromHeaders(headers.sentryTrace, headers.baggage);
  if (traceId && parentSpanId) {
    span.addLink({
      context: {
        traceId,
        spanId: parentSpanId,
        traceFlags: sampled ? 1 : 0
      },
      attributes: {
        [MESSAGING_MESSAGE_ID]: message.MessageId
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

export { SqsServiceExtension };
//# sourceMappingURL=sqs.js.map
