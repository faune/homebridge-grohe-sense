import { PlatformAccessory, Service } from 'homebridge';

import { OndusSensePlus } from './ondusSensePlus';
import { OndusPlatform } from './ondusPlatform';


/**
 * Grohe Sense Accessory for the Ondus platform
 * 
 * This accessory exposes the following services:
 * - Temperature
 * - Humidity
 * - Leakage
 * - Battery 
 * 
 * In addition the following metrics are logged, but not exposed in HomeKit:
 * - Thresholds
 * - WiFi quality
 * - Connection 
 * 
 */
export class OndusSense extends OndusSensePlus {
  static ONDUS_TYPE = 101;
  static ONDUS_NAME = 'Sense';

  // Extended sensor services
  batteryService: Service;

  // Extended sensor data properties
  currentBatteryLevel: number;
  
  /**
   * Ondus Sense constructor for battery powered water leakage detectors.
   * 
   * Inherrits everything from OndusSensePlus and adds a BatteryService
   */
  constructor(
    public ondusPlatform: OndusPlatform,
    public locationID: number,
    public roomID: number,
    public accessory: PlatformAccessory,
  ) {
    // Call parent constructor
    super(ondusPlatform, locationID, roomID, accessory);

    // Set extended sensor data to default values
    this.currentBatteryLevel = 100;

    

    // Initialize extended sensor services

    /**
     * Battery Service
     * 
     * This service will only be created for Sense type sensors, 
     * and not Sense Plus which is mains powered
     */
      
    // create handlers for battery characteristics for Battery service
    this.batteryService = this.accessory.getService(this.ondusPlatform.Service.BatteryService) || 
      this.accessory.addService(this.ondusPlatform.Service.BatteryService);
    
    // set the Battery service characteristics
    this.batteryService
      .setCharacteristic(this.ondusPlatform.Characteristic.Name, accessory.context.device.name)
      .setCharacteristic(this.ondusPlatform.Characteristic.ChargingState, this.ondusPlatform.Characteristic.ChargingState.NOT_CHARGEABLE)
      .setCharacteristic(this.ondusPlatform.Characteristic.StatusLowBattery, 
        this.ondusPlatform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);

    // create handlers for required characteristics of Battery service
    this.batteryService.getCharacteristic(this.ondusPlatform.Characteristic.BatteryLevel)
      .on('get', this.handleBatteryLevelGet.bind(this));
    this.batteryService.getCharacteristic(this.ondusPlatform.Characteristic.StatusLowBattery)
      .on('get', this.handleStatusLowBatteryGet.bind(this));
  }


  // ---- HTTP HANDLER FUNCTIONS BELOW ----

  /**
   * Handle requests to get the current value of the "Battery Level" characteristic
   */
  handleBatteryLevelGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET BatteryLevel`);
    callback(null, this.currentBatteryLevel);
  }

  /**
   * Handle requests to get the current value of the "Status Low Battery" characteristic
   */
  handleStatusLowBatteryGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET StatusLowBattery`);
    callback(null, this.currentBatteryLevel > 10 ? this.ondusPlatform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL : 
      this.ondusPlatform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
  }


  // ---- ONDUS API FUNCTIONS BELOW ----


  /**
   * Fetch Ondus Sense battery data from the Ondus API.
   */
  getStatus() {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Updating battery, WiFi quality, and connection status`);
    
    // Retrieve appliance status for this instance
    this.getApplianceStatus()
      .then(info => {
        //this.ondusPlatform.log.debug(info.body);
        info.body.forEach(infoElement => {
          if (infoElement.type === 'battery') {
            this.currentBatteryLevel = infoElement.value;
          }
          if (infoElement.type === 'wifi_quality') {
            this.currentWiFiQuality = infoElement.value;
          }
          if (infoElement.type === 'connection') {
            this.currentConnection = infoElement.value;
          }
        });
      
        this.ondusPlatform.log.info(`[${this.logPrefix}] => Battery: ${this.currentBatteryLevel}%`);
        this.ondusPlatform.log.info(`[${this.logPrefix}] => WiFi quality: ${this.currentWiFiQuality}`);
        this.ondusPlatform.log.info(`[${this.logPrefix}] => Connection: ${this.currentConnection}`);
      })
      .catch(err => {
        this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to update device status: ${err}`);
      });
  }
}
