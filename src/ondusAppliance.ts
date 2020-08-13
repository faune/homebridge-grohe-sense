import { PlatformAccessory } from 'homebridge';

import { OndusPlatform } from './ondusPlatform';


/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class OndusAppliance {
  static ONDUS_TYPE = 0;
  static ONDUS_PROD = 'Grohe'
  static ONDUS_NAME = 'Overload me';

  /**
   * Ondus Sense virtual class
   */
  constructor(
    public ondusPlatform: OndusPlatform,
    public accessory: PlatformAccessory,
    public locationID: number,
    public roomID: number,
  ) {
      
  }

  public getLocationID() {
    return this.locationID;
  }

  public getRoomID() {
    return this.roomID;
  }

  public getApplianceID() {
    return this.accessory.context.device.appliance_id;
  }

  /**
   * Retrieve appliance info as a JSON object 
   */
  public async getApplianceInfo() {
    return this.ondusPlatform.ondusSession.getApplianceInfo(
      this.getLocationID(),
      this.getRoomID(), 
      this.getApplianceID());
  }

  /**
   * Retrieve appliance notifications as a JSON object.
   * 
   * Will only return data if messages are marked as unread on the web service
   */
  public async getApplianceNotifications() {
    return this.ondusPlatform.ondusSession.getApplianceNotifications(
      this.getLocationID(), 
      this.getRoomID(), 
      this.getApplianceID());
  }

  /**
   * Retrieve info about a specific appliance as a JSON object
   */
  public async getApplianceMeasurements(fromDate?: Date) {
    return this.ondusPlatform.ondusSession.getApplianceMeasurements(
      this.getLocationID(), 
      this.getRoomID(), 
      this.getApplianceID(), 
      fromDate);
  }

  /**
   * Retrieve info about a specific appliance as a JSON object
   */
  public async getApplianceStatus() {
    return this.ondusPlatform.ondusSession.getApplianceStatus(
      this.getLocationID(), 
      this.getRoomID(), 
      this.getApplianceID());
  }
}