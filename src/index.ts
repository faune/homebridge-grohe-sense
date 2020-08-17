import { API } from 'homebridge';

import { PLUGIN_NAME } from './settings';
import { PLATFORM_NAME } from './settings';
import { OndusPlatform } from './ondusPlatform'; 

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, OndusPlatform);
}
