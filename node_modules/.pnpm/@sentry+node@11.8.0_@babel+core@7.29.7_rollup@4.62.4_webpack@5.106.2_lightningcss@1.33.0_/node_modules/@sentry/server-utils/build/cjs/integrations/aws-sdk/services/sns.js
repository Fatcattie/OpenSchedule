Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const attributes = require('@sentry/conventions/attributes');
const op = require('@sentry/conventions/op');
const constants = require('../constants.js');
const MessageAttributes = require('./MessageAttributes.js');

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
      [attributes.MESSAGING_SYSTEM]: "aws.sns",
      [attributes.SENTRY_KIND]: "client"
    };
    if (request.commandName === "Publish") {
      spanOp = op.QUEUE_PUBLISH;
      spanAttributes[attributes.SENTRY_KIND] = "producer";
      spanAttributes[attributes.MESSAGING_DESTINATION_KIND] = constants.MESSAGING_DESTINATION_KIND_VALUE_TOPIC;
      const { TopicArn, TargetArn, PhoneNumber } = request.commandInput;
      const destinationName = extractDestinationName(TopicArn, TargetArn, PhoneNumber);
      spanAttributes[attributes.MESSAGING_DESTINATION] = destinationName;
      spanAttributes[attributes.MESSAGING_DESTINATION_NAME] = TopicArn || TargetArn || PhoneNumber || UNKNOWN_DESTINATION;
      spanAttributes[attributes.MESSAGING_OPERATION_TYPE] = SEND_OPERATION;
      const client = core.getClient();
      const isStreamed = !!client && core.hasSpanStreamingEnabled(client);
      const named = PhoneNumber ? "phone_number" : destinationName;
      const destinationForName = named === UNKNOWN_DESTINATION || isStreamed && !PhoneNumber && named.includes("/") ? void 0 : named;
      spanName = buildSpanName(SEND_OPERATION, destinationForName, isStreamed);
    }
    const topicArn = request.commandInput?.TopicArn;
    if (topicArn) {
      spanAttributes[attributes.AWS_SNS_TOPIC_ARN] = topicArn;
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
      request.commandInput.MessageAttributes = MessageAttributes.injectPropagationContext(origMessageAttributes, core.getTraceData({ span }));
    }
  }
  responseHook(response, span) {
    const topicArn = response.data?.TopicArn;
    if (topicArn) {
      span.setAttribute(attributes.AWS_SNS_TOPIC_ARN, topicArn);
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

exports.SnsServiceExtension = SnsServiceExtension;
//# sourceMappingURL=sns.js.map
