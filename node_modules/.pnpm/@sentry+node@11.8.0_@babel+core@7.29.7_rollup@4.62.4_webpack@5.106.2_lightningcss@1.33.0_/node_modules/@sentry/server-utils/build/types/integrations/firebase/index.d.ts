/**
 * Diagnostics-channel-based firebase integration.
 *
 * Subscribes to the `orchestrion:@firebase/firestore:*` and `orchestrion:firebase-functions:*`
 * diagnostics_channels Sentry's code transform injects into firestore's `addDoc`/`getDocs`/
 * `setDoc`/`deleteDoc` and firebase-functions' `onX` registration functions, emitting spans identical
 * to the OTel integration. Requires the Sentry runtime hook or bundler plugin.
 */
export declare const firebaseIntegration: () => import("@sentry/core").Integration & {
    name: "Firebase";
};
//# sourceMappingURL=index.d.ts.map