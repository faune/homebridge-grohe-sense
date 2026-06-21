import { API } from 'homebridge';

import { PLUGIN_NAME, PLATFORM_NAME } from './settings.js';
import { OndusPlatform } from './ondusPlatform.js';

/**
 * This method registers the platform with Homebridge
 */
export default (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, OndusPlatform);
};
