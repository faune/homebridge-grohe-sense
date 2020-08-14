import { Service, PlatformAccessory } from 'homebridge';

import { OndusPlatform } from './ondusPlatform';
import { OndusAppliance } from './ondusAppliance';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class OndusSense extends OndusAppliance {
  static ONDUS_TYPE = 101;
  static ONDUS_NAME = 'Sense';

  humidityService: Service;
  tempService: Service;

  /**
   * Ondus Sense constructor for battery powered water leakage detectors
   */
  constructor(
    public ondusPlatform: OndusPlatform,
    public accessory: PlatformAccessory,
    public locationID: number,
    public roomID: number,
  ) {
    // Call parent constructor
    super(ondusPlatform, accessory, locationID, roomID);

    // set accessory information
    this.accessory.getService(this.ondusPlatform.Service.AccessoryInformation)!
      .setCharacteristic(this.ondusPlatform.Characteristic.Manufacturer, OndusSense.ONDUS_PROD)
      .setCharacteristic(this.ondusPlatform.Characteristic.Model, OndusSense.ONDUS_NAME)
      .setCharacteristic(this.ondusPlatform.Characteristic.HardwareRevision, accessory.context.device.type)
      .setCharacteristic(this.ondusPlatform.Characteristic.SerialNumber, accessory.context.device.serial_number)
      .setCharacteristic(this.ondusPlatform.Characteristic.FirmwareRevision, accessory.context.device.version)
      .setCharacteristic(this.ondusPlatform.Characteristic.AppMatchingIdentifier, '1451814256');

    // get the Humidity service if it exists, otherwise create a new Humidity service
    this.humidityService = this.accessory.getService(this.ondusPlatform.Service.HumiditySensor) || 
      this.accessory.addService(this.ondusPlatform.Service.HumiditySensor);

    // get the Temperature service if it exists, otherwise create a new Temperature service
    this.tempService = this.accessory.getService(this.ondusPlatform.Service.TemperatureSensor) || 
      this.accessory.addService(this.ondusPlatform.Service.TemperatureSensor);

    // This will add a separate accessory icon for battery level, so instead we add battery status 
    // directly to the accessory characteristics
    //this.batteryService = this.accessory.getService(this.ondusPlatform.Service.BatteryService) ||
    //  this.accessory.addService(this.ondusPlatform.Service.BatteryService);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.humidityService.setCharacteristic(this.ondusPlatform.Characteristic.Name, accessory.context.device.name);
    this.tempService.setCharacteristic(this.ondusPlatform.Characteristic.Name, accessory.context.device.name);    

    // Fetch updated values from Ondus API on startup
    this.updateTemperatureAndHumidity();
    this.updateBatteryLevel();

    // Start timer for fetching updated values from Ondus API once every refresh_interval from now on
    // The reason is that sensors only report new data once every day, so no point in querying often
    let refreshInterval = this.ondusPlatform.config['refresh_interval'] * 10000;
    if (!refreshInterval) {
      this.ondusPlatform.log.warn(`[${this.logPrefix}] 
      Refresh interval incorrectly configured in config.json - using default value of 3600`);
      refreshInterval = 3600000;
    }
    setInterval( () => {
      this.accessory.reachable = true; // Reset state to reachable before fetching new data
      this.updateApplianceInfo(); // Make sure accessory context device has the latest appliance info
      this.updateTemperatureAndHumidity();
      this.updateBatteryLevel();
    }, refreshInterval);

  }

  
  /**
   * Fetch Ondus Sense measurement data
   */
  updateTemperatureAndHumidity() {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Updating temperature and humidity level`);

    // Fetch appliance measurements using current timestamp
    // If no measurements are present, the following is returned {"code":404,"message":"Not found"}

    // Use last update timestamp from service for querying latest measurements
    const todayDate = new Date(Date.now());
    const fromDate = new Date(this.accessory.context.device.tdt);
    const diffSeconds = todayDate.getSeconds() - fromDate.getSeconds();
    let warning = '';
    if (diffSeconds > 86400) {
      const days = Math.round(diffSeconds / 86400);
      warning = `[${this.logPrefix}] Retrieved data is ${days} day(s) old!`;
      this.ondusPlatform.log.warn(warning);
      this.accessory.reachable = false;
    }
    // Get fromDate measurements
    this.getApplianceMeasurements(fromDate)
      .then( measurement => {
        const measurementArray = measurement.body.data.measurement;
        if (!Array.isArray(measurementArray)) {
          this.ondusPlatform.log.debug(`[${this.logPrefix}] Unknown response: ${measurementArray}`);
          this.accessory.reachable = false;
        }
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Retrieved ${measurementArray.length}: measurements - picking last one`);
        measurementArray.sort((a, b) => {
          const a_ts = new Date(a.timestamp).getSeconds();
          const b_ts = new Date(b.timestamp).getSeconds();
          if(a_ts > b_ts) {
            return 1;
          } else if(a_ts < b_ts) {
            return -1;
          } else {
            return 0;
          }
        });

        const lastMeasurement = measurementArray.slice(-1)[0];
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Last measured timestamp: ${lastMeasurement.timestamp}`);
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Last measured temperature level: ${lastMeasurement.temperature}`);
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Last measured humidity level: ${lastMeasurement.humidity}%`);

        // Update temperature and humidity values
        this.tempService.updateCharacteristic(this.ondusPlatform.Characteristic.CurrentTemperature, lastMeasurement.temperature);
        this.humidityService.updateCharacteristic(this.ondusPlatform.Characteristic.CurrentRelativeHumidity, lastMeasurement.humidity);
      })
      .catch( err => {
        this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to update temperature and humidity: ${err.text}`);
        this.accessory.reachable = false;
      });
  }

  /**
   * Handle requests to get the current value of the "Current Relative Humidity" characteristic
   */
  updateBatteryLevel() {
    // Only update battery level for OndusSense instances
    if (!(this instanceof OndusSense)) {
      return;
    }

    // Fetch appliance status which contain battery level
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Updating battery level`);
    this.getApplianceStatus()
      .then(info => {
        info.body.forEach(infoElement => {
          if (infoElement.type === 'battery') {
            const batteryLevel = infoElement.value;
            this.ondusPlatform.log.debug(`[${this.logPrefix}] Last measured battery level: ${batteryLevel}%`);

            // Update battery level
            this.humidityService.updateCharacteristic(this.ondusPlatform.Characteristic.BatteryLevel, batteryLevel);
            this.tempService.updateCharacteristic(this.ondusPlatform.Characteristic.BatteryLevel, batteryLevel);

            // If batteryLevel is below 10% set the StatusLowBattery characteristic for both services
            this.humidityService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusLowBattery, (batteryLevel > 10) ? 0 : 1);
            this.tempService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusLowBattery, (batteryLevel > 10) ? 0 : 1);
          }
        });
      })
      .catch(err => {
        this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to update battery level: ${err.text}`);
        this.accessory.reachable = false;
      });
  }
}
