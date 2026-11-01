import { getClient, hasSpanStreamingEnabled, getTraceData } from '@sentry/core';
import { SENTRY_KIND, MESSAGING_DESTINATION_KIND, MESSAGING_DESTINATION, MESSAGING_DESTINATION_NAME, MESSAGING_OPERATION_TYPE, AWS_SNS_TOPIC_ARN, MESSAGING_SYSTEM } from '@sentry/conventions/attributes';
import { QUEUE_PUBLISH } from '@sentry/conventions/op';
import { MESSAGING_DESTINATION_KIND_VALUE_TOPIC } from '../constants.js';
import { injectPropagationContext } from './MessageAttributes.js';

const UNKNOWN_DESTINATION = "unknown";
const SEND_OPERATION = "send";
function buildSpanName(operation, destination, isStreamed) {
  if (!destination) {
    return operation;
  }
  return isStreamed ? `${operation} ${destination}` : `${destination} ${operation}`;
}
class SnsServiceExtension {
  requestPreSpanHook(request) {
    let spanName = `SNS ${request.commandName}`;
    let spanOp;
    const spanAttributes = {
      [MESSAGING_SYSTEM]: "aws.sns",
      [SENTRY_KIND]: "client"
    };
    if (request.commandName === "Publish") {
      spanOp = QUEUE_PUBLISH;
      spanAttributes[SENTRY_KIND] = "producer";
      spanAttributes[MESSAGING_DESTINATION_KIND] = MESSAGING_DESTINATION_KIND_VALUE_TOPIC;
      const { TopicArn, TargetArn, PhoneNumber } = request.commandInput;
      const destinationName = extractDestinationName(TopicArn, TargetArn, PhoneNumber);
      spanAttributes[MESSAGING_DESTINATION] = destinationName;
      spanAttributes[MESSAGING_DESTINATION_NAME] = TopicArn || TargetArn || PhoneNumber || UNKNOWN_DESTINATION;
      spanAttributes[MESSAGING_OPERATION_TYPE] = SEND_OPERATION;
      const client = getClient();
      const isStreamed = !!client && hasSpanStreamingEnabled(client);
      const named = PhoneNumber ? "phone_number" : destinationName;
      const destinationForName = named === UNKNOWN_DESTINATION || isStreamed && !PhoneNumber && named.includes("/") ? void 0 : named;
      spanName = buildSpanName(SEND_OPERATION, destinationForName, isStreamed);
    }
    const topicArn = request.commandInput?.TopicArn;
    if (topicArn) {
      spanAttributes[AWS_SNS_TOPIC_ARN] = topicArn;
    }
    return {
      spanAttributes,
      spanName,
      spanOp
    };
  }
  requestPostSpanHook(request, span) {
    if (request.commandName === "Publish") {
      const origMessageAttributes = request.commandInput.MessageAttributes ?? {};
      request.commandInput.MessageAttributes = injectPropagationContext(origMessageAttributes, getTraceData({ span }));
    }
  }
  responseHook(response, span) {
    const topicArn = response.data?.TopicArn;
    if (topicArn) {
      span.setAttribute(AWS_SNS_TOPIC_ARN, topicArn);
    }
  }
}
function extractDestinationName(topicArn, targetArn, phoneNumber) {
  if (topicArn || targetArn) {
    const arn = topicArn ?? targetArn;
    try {
      return arn.substring(arn.lastIndexOf(":") + 1);
    } catch {
      return arn;
    }
  } else if (phoneNumber) {
    return phoneNumber;
  } else {
    return UNKNOWN_DESTINATION;
  }
}

export { SnsServiceExtension };
//# sourceMappingURL=sns.js.map
