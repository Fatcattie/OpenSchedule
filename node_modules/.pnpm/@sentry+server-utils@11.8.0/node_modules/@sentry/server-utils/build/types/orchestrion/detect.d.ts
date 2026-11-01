/**
 * The module names (e.g. `mysql`, `@hapi/hapi`) orchestrion has already injected
 * into this process — from the runtime `--import` hook (`runtime`) and/or the
 * snippets a bundler transform spliced into each transformed module (`bundler`).
 * Channel-based integrations use it to decide whether to subscribe now (their
 * module is already loaded) or wait for the module-injected event.
 *
 * The `instanceof Set` guard is runtime safety, not typing: a banner from
 * another SDK copy or version may have written a non-Set flag here.
 */
export declare function getOrchestrionInjectedModules(): string[];
/**
 * Verifies that the diagnostics channels have been injected either by the
 * runtime `--import` hook (or init-time registration), a bundler plugin, or
 * both, and warns if not. When at least one injector is active, logs for each
 * mechanism whether it hooked (a defined list, even empty, means it did) and
 * which libraries it injected. For the bundler path, the entry banner ensures
 * an empty `Set` at boot; module names arrive as each transformed module is
 * evaluated, so an empty set can also just mean none has loaded yet.
 *
 * Both injectors being active at once is fine: they operate on disjoint module
 * sets (a module is either loaded through Node's loader and transformed by the
 * runtime hook, or inlined by the bundler and transformed by the plugin), so
 * a single module can't be double-wrapped. A hybrid setup, with some deps
 * external and runtime-instrumented, others bundled and plugin-instrumented,
 * is fine.
 */
export declare function detectOrchestrionSetup(): void;
//# sourceMappingURL=detect.d.ts.map