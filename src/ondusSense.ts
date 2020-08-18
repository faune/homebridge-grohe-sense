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
  temperatureService: Service;
  batteryService: Service;

  private currentTemperature: number;
  private currentHumidity: number;
  private currentBatteryLevel: number;
  private currentTimestamp: string;

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

    // Placeholders for sensor data
    this.currentTemperature = 0;
    this.currentHumidity = 0;
    this.currentBatteryLevel = 0;
    this.currentTimestamp = '';

    // set accessory information
    this.accessory.getService(this.ondusPlatform.Service.AccessoryInformation)!
      .setCharacteristic(this.ondusPlatform.Characteristic.Manufacturer, OndusSense.ONDUS_PROD)
      .setCharacteristic(this.ondusPlatform.Characteristic.Model, OndusSense.ONDUS_NAME)
      .setCharacteristic(this.ondusPlatform.Characteristic.Name, accessory.context.device.name)
      .setCharacteristic(this.ondusPlatform.Characteristic.HardwareRevision, accessory.context.device.type)
      .setCharacteristic(this.ondusPlatform.Characteristic.SerialNumber, accessory.context.device.serial_number)
      .setCharacteristic(this.ondusPlatform.Characteristic.FirmwareRevision, accessory.context.device.version)
      .setCharacteristic(this.ondusPlatform.Characteristic.AppMatchingIdentifier, '1451814256');

    // Initialize services

    /**
     * Temperature Service
     */
    // get the Temperature service if it exists, otherwise create a new Temperature service
    this.temperatureService = this.accessory.getService(this.ondusPlatform.Service.TemperatureSensor) || 
       this.accessory.addService(this.ondusPlatform.Service.TemperatureSensor);
    // set the Temperature service name, this is what is displayed as the default name on the Home app
    this.temperatureService.setCharacteristic(this.ondusPlatform.Characteristic.Name, accessory.context.device.name);
    // create handlers for required characteristics for Temperature service
    this.temperatureService.getCharacteristic(this.ondusPlatform.Characteristic.CurrentTemperature)
      .on('get', this.handleCurrentTemperatureGet.bind(this));

    /**
     * Humidity Service
     */
    // get the Humidity service if it exists, otherwise create a new Humidity service
    this.humidityService = this.accessory.getService(this.ondusPlatform.Service.HumiditySensor) || 
       this.accessory.addService(this.ondusPlatform.Service.HumiditySensor);
    // set the Humidity service name, this is what is displayed as the default name on the Home app
    this.humidityService.setCharacteristic(this.ondusPlatform.Characteristic.Name, accessory.context.device.name);
    // create handlers for required characteristics for Humidity service
    this.humidityService.getCharacteristic(this.ondusPlatform.Characteristic.CurrentRelativeHumidity)
      .on('get', this.handleCurrentRelativeHumidityGet.bind(this));
   
    /**
     * Battery Service
     * 
     * We dont create a separate battery service, since that will show up as a standalone accessory in HomeKit.
     * Instead we set the BatteryLevel and StatusLowBattery characteristics for the Temperature and Humidity service.
     */
    // create handlers for battery characteristics for Temperature and Humidity service
    this.batteryService = this.accessory.getService(this.ondusPlatform.Service.BatteryService) || 
       this.accessory.addService(this.ondusPlatform.Service.BatteryService);
    // create handlers for required characteristics
    this.batteryService.getCharacteristic(this.ondusPlatform.Characteristic.BatteryLevel)
      .on('get', this.handleBatteryLevelGet.bind(this));

    this.batteryService.getCharacteristic(this.ondusPlatform.Characteristic.ChargingState)
      .on('get', this.handleChargingStateGet.bind(this));

    this.batteryService.getCharacteristic(this.ondusPlatform.Characteristic.StatusLowBattery)
      .on('get', this.handleStatusLowBatteryGet.bind(this));
    /*
    this.temperatureService.getCharacteristic(this.ondusPlatform.Characteristic.BatteryLevel)
      .on('get', this.handleBatteryLevelGet.bind(this));
    this.temperatureService.getCharacteristic(this.ondusPlatform.Characteristic.StatusLowBattery)
      .on('get', this.handleStatusLowBatteryGet.bind(this));
    this.humidityService.getCharacteristic(this.ondusPlatform.Characteristic.BatteryLevel)
      .on('get', this.handleBatteryLevelGet.bind(this));
    this.humidityService.getCharacteristic(this.ondusPlatform.Characteristic.StatusLowBattery)
      .on('get', this.handleStatusLowBatteryGet.bind(this));
    */

    /**
     * Fetch sensor data from Ondus API
     */
    //this.updateTemperatureAndHumidity();
    //this.updateBatteryLevel();

    
    /*
    // Start timer for fetching updated values from Ondus API once every refresh_interval from now on
    // The reason is that sensors only report new data once every day, so no point in querying Ondus API often
    let refreshInterval = this.ondusPlatform.config['refresh_interval'] * 10000;
    if (!refreshInterval) {
      this.ondusPlatform.log.warn(`[${this.logPrefix}] 
      Refresh interval incorrectly configured in config.json - using default value of 3600`);
      refreshInterval = 3600000;
    }
    setInterval( () => { 
      
      // Reset StatusFault characteristics
      [this.humidityService, this.tempService].forEach( service => {
        service.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
          this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);
      });
      // Fetch new data
      this.ondusPlatform.onduSession.refreshAccessToken(); // Refresh in case access token has expired
      this.updateApplianceInfo(); // Make sure accessory context device has the latest appliance info
      this.updateTemperatureAndHumidity();
      this.updateBatteryLevel();
    }, refreshInterval);
*/
  }

  
  
  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  handleCurrentTemperatureGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET CurrentTemperature`);
    callback(null, this.currentTemperature);
  }

  /**
   * Handle requests to get the current value of the "Current Relative Humidity" characteristic
   */
  handleCurrentRelativeHumidityGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET CurrentRelativeHumidity`);
    callback(null, this.currentHumidity);
  }

  /**
   * Handle requests to get the current value of the "Battery Level" characteristic
   */
  handleBatteryLevelGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET BatteryLevel`);
    callback(null, this.currentBatteryLevel);
  }


  /**
   * Handle requests to get the current value of the "Charging State" characteristic
   */
  handleChargingStateGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET ChargingState`);
    callback(null, this.ondusPlatform.Characteristic.ChargingState.NOT_CHARGEABLE);
  }


  /**
   * Handle requests to get the current value of the "Status Low Battery" characteristic
   */
  handleStatusLowBatteryGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET StatusLowBattery`);
    callback(null, (this.currentBatteryLevel > 10 ? this.ondusPlatform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL : 
      this.ondusPlatform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW));
  }



  /**
   * Fetch Ondus Sense measurement data
   */
  updateTemperatureAndHumidity() {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Updating temperature and humidity levels`);

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
    }
    // Get fromDate measurements
    this.getApplianceMeasurements(fromDate)
      .then( measurement => {
        const measurementArray = measurement.body.data.measurement;
        if (!Array.isArray(measurementArray)) {
          throw Error(`Unknown response: ${measurementArray}`);
        }
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Retrieved ${measurementArray.length}: measurements - picking latest one`);
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
        this.currentTimestamp = lastMeasurement.timestamp;
        this.currentTemperature = lastMeasurement.temperature;
        this.currentHumidity = lastMeasurement.humidity;
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Last measured timestamp: ${this.currentTimestamp}`);
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Last measured temperature level: ${this.currentTemperature}`);
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Last measured humidity level: ${this.currentHumidity}%`);
      })
      .catch( err => {
        this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to update temperature and humidity: ${err.text}`);

        // Set StatusFault characteristics
        [this.temperatureService, this.humidityService].forEach( service => {
          service.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
            this.ondusPlatform.Characteristic.StatusFault.GENERAL_FAULT);
        });
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
            this.currentBatteryLevel = infoElement.value;
            this.ondusPlatform.log.debug(`[${this.logPrefix}] Last measured battery level: ${this.currentBatteryLevel}%`);
          }
        });
      })
      .catch(err => {
        this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to update battery level: ${err.text}`);
        
        // Set StatusFault characteristics
        [this.temperatureService, this.humidityService].forEach( service => {
          service.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
            this.ondusPlatform.Characteristic.StatusFault.GENERAL_FAULT);
        });
      });
  }
}
