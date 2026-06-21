/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = 'Ondus';

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME = 'homebridge-grohe-sense';

// Resolved from package.json next to dist/ after build (single source of truth for releases).
import { createRequire } from 'module';
const requireFromHere = createRequire(import.meta.url);
const pkg = requireFromHere('../package.json') as { version: string };
export const PLUGIN_VERSION: string = pkg.version;
