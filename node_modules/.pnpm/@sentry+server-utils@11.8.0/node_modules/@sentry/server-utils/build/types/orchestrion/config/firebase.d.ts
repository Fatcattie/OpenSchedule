export declare const firebaseConfig: ({
    channelName: "add-doc" | "delete-doc" | "get-docs" | "set-doc";
    module: {
        name: string;
        versionRange: string;
        filePath: RegExp;
    };
    functionQuery: {
        functionName: "addDoc" | "deleteDoc" | "getDocs" | "setDoc";
        kind: 'Auto';
    };
} | {
    channelName: "firestore-created" | "firestore-deleted" | "firestore-updated" | "firestore-written" | "http-call" | "http-request" | "scheduler" | "storage-archived" | "storage-deleted" | "storage-finalized" | "storage-metadata-updated";
    module: {
        name: string;
        versionRange: string;
        filePath: "lib/v2/providers/firestore.js" | "lib/v2/providers/https.js" | "lib/v2/providers/scheduler.js" | "lib/v2/providers/storage.js";
    };
    functionQuery: {
        functionName: "onCall" | "onDocumentCreated" | "onDocumentCreatedWithAuthContext" | "onDocumentDeleted" | "onDocumentDeletedWithAuthContext" | "onDocumentUpdated" | "onDocumentUpdatedWithAuthContext" | "onDocumentWritten" | "onDocumentWrittenWithAuthContext" | "onObjectArchived" | "onObjectDeleted" | "onObjectFinalized" | "onObjectMetadataUpdated" | "onRequest" | "onSchedule";
        kind: 'Sync';
    };
})[];
export declare const firebaseModuleNames: string[];
export declare const firebaseChannels: {
    readonly FIREBASE_FIRESTORE_ADD_DOC: 'orchestrion:@firebase/firestore:add-doc';
    readonly FIREBASE_FIRESTORE_GET_DOCS: 'orchestrion:@firebase/firestore:get-docs';
    readonly FIREBASE_FIRESTORE_SET_DOC: 'orchestrion:@firebase/firestore:set-doc';
    readonly FIREBASE_FIRESTORE_DELETE_DOC: 'orchestrion:@firebase/firestore:delete-doc';
    readonly FIREBASE_FUNCTIONS_HTTP_REQUEST: 'orchestrion:firebase-functions:http-request';
    readonly FIREBASE_FUNCTIONS_HTTP_CALL: 'orchestrion:firebase-functions:http-call';
    readonly FIREBASE_FUNCTIONS_FIRESTORE_CREATED: 'orchestrion:firebase-functions:firestore-created';
    readonly FIREBASE_FUNCTIONS_FIRESTORE_UPDATED: 'orchestrion:firebase-functions:firestore-updated';
    readonly FIREBASE_FUNCTIONS_FIRESTORE_DELETED: 'orchestrion:firebase-functions:firestore-deleted';
    readonly FIREBASE_FUNCTIONS_FIRESTORE_WRITTEN: 'orchestrion:firebase-functions:firestore-written';
    readonly FIREBASE_FUNCTIONS_SCHEDULER: 'orchestrion:firebase-functions:scheduler';
    readonly FIREBASE_FUNCTIONS_STORAGE_FINALIZED: 'orchestrion:firebase-functions:storage-finalized';
    readonly FIREBASE_FUNCTIONS_STORAGE_ARCHIVED: 'orchestrion:firebase-functions:storage-archived';
    readonly FIREBASE_FUNCTIONS_STORAGE_DELETED: 'orchestrion:firebase-functions:storage-deleted';
    readonly FIREBASE_FUNCTIONS_STORAGE_METADATA_UPDATED: 'orchestrion:firebase-functions:storage-metadata-updated';
};
//# sourceMappingURL=firebase.d.ts.map