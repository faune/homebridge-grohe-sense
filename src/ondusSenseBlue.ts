import { PlatformAccessory, Service } from 'homebridge';

import { OndusAppliance } from './ondusAppliance';
import { OndusPlatform } from './ondusPlatform';


/**
 * Grohe Sense Blue Accessory in the Ondus platform for carbonating drinking water 
 * 
 * This accessory exposes the following services:
 * - Switch
 *
 * In addition the following metrics are logged, but not exposed in HomeKit:
 * - TBD
 * 
 */

enum TapType {
  STILL = 0,
  MEDIUM = 1,
  CARBONATED = 2,
}

export class OndusSenseBlue extends OndusAppliance {
  static ONDUS_TYPE = 104;
  static ONDUS_NAME = 'Sense Blue';

  // Sense Blue services
  switchService: Service;

  // Sense Blue properties
  tapType: TapType;
  flowRateStill: number;
  flowRateMedium: number;
  flowRateCarbonated: number;

  /**
   * Ondus Sense Blue constructor for carbonated tap water
   */
  constructor(
    public ondusPlatform: OndusPlatform,
    public locationID: number,
    public roomID: number,
    public accessory: PlatformAccessory,
  ) {
    // Call parent constructor
    super(ondusPlatform, locationID, roomID, accessory);

    // Set Blue properties to default values
    this.tapType = 0;
    this.flowRateStill = 0;
    this.flowRateMedium = 0;
    this.flowRateCarbonated = 0;

    /**
     * Switch Service
     */

    // get the Switch service if it exists, otherwise create a new Switch service
    this.switchService = this.accessory.getService(this.ondusPlatform.Service.Switch) || 
       this.accessory.addService(this.ondusPlatform.Service.Switch);

    // set the Switch service characteristics
    this.switchService
      .setCharacteristic(this.ondusPlatform.Characteristic.Name, accessory.context.device.name)
      .setCharacteristic(this.ondusPlatform.Characteristic.StatusActive, this.ondusPlatform.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.ondusPlatform.Characteristic.StatusFault, this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);
  }


  // ---- HTTP HANDLER FUNCTIONS BELOW ----



  // ---- ONDUS API FUNCTIONS BELOW ----

  /**
   * Fetch Ondus Sense Blue status from the Ondus API.
   */
  getParams() {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Fetch params: NOT IMPLEMENTED`);
    //this.getApplianceParams()
  }

  getConfig() {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Fetch config: NOT IMPLEMENTED`);
    //this.getApplianceConfig()
  }

  getState() {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Fetch state: NOT IMPLEMENTED`);
    //this.getApplianceState()
  }
}
