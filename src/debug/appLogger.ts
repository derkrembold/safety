import { createDebugLogger } from './logger';

// One shared instance for all editors and calculations.
export const appLogger = createDebugLogger({
  appVersion: __APP_VERSION__,
  commitId: __COMMIT_ID__,
});
