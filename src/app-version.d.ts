/** The app version from package.json, injected by vite.config.ts at build time. */
declare const __APP_VERSION__: string;

/** "test <commit> <MM-DD HH:mm>" in a test build (`npm run build:test`), "" otherwise. See src/lib/build-label.ts. */
declare const __APP_BUILD_LABEL__: string;
