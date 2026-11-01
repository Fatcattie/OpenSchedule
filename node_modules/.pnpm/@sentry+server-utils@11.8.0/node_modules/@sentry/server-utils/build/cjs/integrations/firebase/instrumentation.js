Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const diagnosticsChannel = require('../../utils/diagnosticsChannel.js');
const channels = require('../../orchestrion/channels.js');
const tracingChannel = require('../../tracing-channel.js');
const firestore = require('./firestore.js');
const functions = require('./functions.js');

const FIRESTORE_OPERATIONS = [
  { channel: channels.CHANNELS.FIREBASE_FIRESTORE_ADD_DOC, spanName: "addDoc", useParent: false },
  { channel: channels.CHANNELS.FIREBASE_FIRESTORE_GET_DOCS, spanName: "getDocs", useParent: false },
  { channel: channels.CHANNELS.FIREBASE_FIRESTORE_SET_DOC, spanName: "setDoc", useParent: true },
  { channel: channels.CHANNELS.FIREBASE_FIRESTORE_DELETE_DOC, spanName: "deleteDoc", useParent: true }
];
const FUNCTIONS_TRIGGERS = [
  { channel: channels.CHANNELS.FIREBASE_FUNCTIONS_HTTP_REQUEST, triggerType: "http.request" },
  { channel: channels.CHANNELS.FIREBASE_FUNCTIONS_HTTP_CALL, triggerType: "http.call" },
  { channel: channels.CHANNELS.FIREBASE_FUNCTIONS_FIRESTORE_CREATED, triggerType: "firestore.document.created" },
  { channel: channels.CHANNELS.FIREBASE_FUNCTIONS_FIRESTORE_UPDATED, triggerType: "firestore.document.updated" },
  { channel: channels.CHANNELS.FIREBASE_FUNCTIONS_FIRESTORE_DELETED, triggerType: "firestore.document.deleted" },
  { channel: channels.CHANNELS.FIREBASE_FUNCTIONS_FIRESTORE_WRITTEN, triggerType: "firestore.document.written" },
  { channel: channels.CHANNELS.FIREBASE_FUNCTIONS_SCHEDULER, triggerType: "scheduler.scheduled" },
  { channel: channels.CHANNELS.FIREBASE_FUNCTIONS_STORAGE_FINALIZED, triggerType: "storage.object.finalized" },
  { channel: channels.CHANNELS.FIREBASE_FUNCTIONS_STORAGE_ARCHIVED, triggerType: "storage.object.archived" },
  { channel: channels.CHANNELS.FIREBASE_FUNCTIONS_STORAGE_DELETED, triggerType: "storage.object.deleted" },
  { channel: channels.CHANNELS.FIREBASE_FUNCTIONS_STORAGE_METADATA_UPDATED, triggerType: "storage.object.metadataUpdated" }
];
const NOOP = () => {
};
function instrumentFirebase() {
  for (const { channel, spanName, useParent } of FIRESTORE_OPERATIONS) {
    tracingChannel.bindTracingChannelToSpan(
      diagnosticsChannel.tracingChannel(channel),
      (data) => tracingChannel.safeChannelCallback(() => {
        const reference = data.arguments[0];
        if (!reference) {
          return void 0;
        }
        const spanReference = useParent ? reference.parent || reference : reference;
        return firestore.startFirestoreSpan(spanName, spanReference);
      })
    );
  }
  for (const { channel, triggerType } of FUNCTIONS_TRIGGERS) {
    diagnosticsChannel.tracingChannel(channel).subscribe({
      start: (data) => tracingChannel.safeChannelCallback(() => functions.wrapFunctionsRegistration(data, triggerType)),
      end: NOOP,
      asyncStart: NOOP,
      asyncEnd: NOOP,
      error: NOOP
    });
  }
}

exports.instrumentFirebase = instrumentFirebase;
//# sourceMappingURL=instrumentation.js.map
