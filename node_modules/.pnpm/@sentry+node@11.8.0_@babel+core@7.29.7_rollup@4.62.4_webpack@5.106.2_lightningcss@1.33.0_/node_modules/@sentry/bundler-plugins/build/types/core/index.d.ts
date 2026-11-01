import { CodeInjection } from './utils';
/**
 * Checks if a file is a JavaScript file based on its extension.
 * Handles query strings and hashes in the filename.
 */
export declare function isJsFile(fileName: string): boolean;
/**
 * Checks if a chunk should be skipped for code injection
 *
 * This is necessary to handle Vite's MPA (multi-page application) mode where
 * HTML entry points create "facade" chunks that should not contain injected code.
 * See: https://github.com/getsentry/sentry-javascript-bundler-plugins/issues/829
 *
 * However, in SPA mode, the main bundle also has an HTML facade but contains
 * substantial application code. We should NOT skip injection for these bundles.
 *
 * @param code - The chunk's code content
 * @param facadeModuleId - The facade module ID (if any) - HTML files create facade chunks
 * @returns true if the chunk should be skipped
 */
export declare function shouldSkipCodeInjection(code: string, facadeModuleId: string | null | undefined): boolean;
export { globFiles } from './glob';
export { getCodeInjectionPosition } from './get-code-injection-position';
export { createComponentNameAnnotateHooks } from './component-annotate-hooks';
export declare function getDebugIdSnippet(debugId: string): CodeInjection;
export type { Logger } from './logger';
export type { Options, SentrySDKBuildFlags } from './types';
export { CodeInjection, replaceBooleanFlagsInCode, stringToUUID, generateReleaseInjectorCode, generateModuleMetadataInjectorCode, } from './utils';
export { createSentryBuildPluginManager } from './build-plugin-manager';
export { createDebugIdUploadFunction, addDebugIdToEmittedArtifacts, stampDebugId } from './debug-id-upload';
//# sourceMappingURL=index.d.ts.map