import { PlatformAccessory, Service } from 'homebridge';

import { OndusAppliance } from './ondusAppliance';
import { OndusPlatform } from './ondusPlatform';


/**
 * Grohe Sense Red Accessory in the Ondus platform for hot drinking water 
 * 
 * This accessory exposes the following services:
 * - Switch
 *
 * In addition the following metrics are logged, but not exposed in HomeKit:
 * - TBD
 * 
 */

enum TapType {
  COLD = 0,
  HOT = 1,
}

export class OndusSenseRed extends OndusAppliance {
  static ONDUS_TYPE = 105;
  static ONDUS_NAME = 'Sense Red';

  // Sense Red services
  switchService: Service;

  // Sense Red properties
  tapType: TapType;

  /**
   * Ondus Sense Red constructor for carbonated tap water
   */
  constructor(
    public ondusPlatform: OndusPlatform,
    public locationID: number,
    public roomID: number,
    public accessory: PlatformAccessory,
  ) {
    // Call parent constructor
    super(ondusPlatform, locationID, roomID, accessory);

    // Set Red properties to default values
    this.tapType = 0;
  
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
   * Fetch Ondus Sense Red status from the Ondus API.
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
