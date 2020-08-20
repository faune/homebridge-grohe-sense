import { PlatformAccessory } from 'homebridge';

import { OndusPlatform } from './ondusPlatform';
import { OndusSense } from './ondusSense';



/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class OndusSensePlus extends OndusSense {
  static ONDUS_TYPE = 102;
  static ONDUS_NAME = 'Sense Plus';

  /**
   * Ondus Sense constructor for mains powered water leakage detectors
   */
  constructor(
    public ondusPlatform: OndusPlatform,
    public locationID: number,
    public roomID: number,
    public accessory: PlatformAccessory,
  ) {
    super(ondusPlatform, locationID, roomID, accessory);
  }

}
