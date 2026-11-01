import { tracingChannel } from '../../utils/diagnosticsChannel.js';
import { CHANNELS } from '../../orchestrion/channels.js';
import { bindTracingChannelToSpan, safeChannelCallback } from '../../tracing-channel.js';
import { startFirestoreSpan } from './firestore.js';
import { wrapFunctionsRegistration } from './functions.js';

const FIRESTORE_OPERATIONS = [
  { channel: CHANNELS.FIREBASE_FIRESTORE_ADD_DOC, spanName: "addDoc", useParent: false },
  { channel: CHANNELS.FIREBASE_FIRESTORE_GET_DOCS, spanName: "getDocs", useParent: false },
  { channel: CHANNELS.FIREBASE_FIRESTORE_SET_DOC, spanName: "setDoc", useParent: true },
  { channel: CHANNELS.FIREBASE_FIRESTORE_DELETE_DOC, spanName: "deleteDoc", useParent: true }
];
const FUNCTIONS_TRIGGERS = [
  { channel: CHANNELS.FIREBASE_FUNCTIONS_HTTP_REQUEST, triggerType: "http.request" },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_HTTP_CALL, triggerType: "http.call" },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_FIRESTORE_CREATED, triggerType: "firestore.document.created" },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_FIRESTORE_UPDATED, triggerType: "firestore.document.updated" },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_FIRESTORE_DELETED, triggerType: "firestore.document.deleted" },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_FIRESTORE_WRITTEN, triggerType: "firestore.document.written" },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_SCHEDULER, triggerType: "scheduler.scheduled" },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_STORAGE_FINALIZED, triggerType: "storage.object.finalized" },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_STORAGE_ARCHIVED, triggerType: "storage.object.archived" },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_STORAGE_DELETED, triggerType: "storage.object.deleted" },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_STORAGE_METADATA_UPDATED, triggerType: "storage.object.metadataUpdated" }
];
const NOOP = () => {
};
function instrumentFirebase() {
  for (const { channel, spanName, useParent } of FIRESTORE_OPERATIONS) {
    bindTracingChannelToSpan(
      tracingChannel(channel),
      (data) => safeChannelCallback(() => {
        const reference = data.arguments[0];
        if (!reference) {
          return void 0;
        }
        const spanReference = useParent ? reference.parent || reference : reference;
        return startFirestoreSpan(spanName, spanReference);
      })
    );
  }
  for (const { channel, triggerType } of FUNCTIONS_TRIGGERS) {
    tracingChannel(channel).subscribe({
      start: (data) => safeChannelCallback(() => wrapFunctionsRegistration(data, triggerType)),
      end: NOOP,
      asyncStart: NOOP,
      asyncEnd: NOOP,
      error: NOOP
    });
  }
}

export { instrumentFirebase };
//# sourceMappingURL=instrumentation.js.map
