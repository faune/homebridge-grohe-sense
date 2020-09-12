import moment from 'moment';
import { PlatformAccessory, Service } from 'homebridge';

import { OndusAppliance } from './ondusAppliance';
import { OndusPlatform } from './ondusPlatform';


/**
 * Grohe Sense Plus Accessory for the Ondus platform
 * 
 * This accessory exposes the following services:
 * - Temperature
 * - Humidity
 * - Leakage
 *
 * In addition the following metrics are logged, but not exposed in HomeKit:
 * - Thresholds
 * - WiFi quality
 * - Connection 
 * 
 */

export class OndusSensePlus extends OndusAppliance {
  static ONDUS_TYPE = 102;
  static ONDUS_NAME = 'Sense Plus';

  // Extended sensor services
  humidityService: Service;

  // Extended sensor data properties
  currentHumidity: number;
  currentWiFiQuality: number;
  currentConnection: number;
  
  /**
   * Ondus Sense constructor for battery powered water leakage detectors
   * 
   * Inherrits all common sensor handling from OndusAppliance
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
    this.currentHumidity = 0;
    this.currentWiFiQuality = 0;
    this.currentConnection = 0;


    // Initialize extended sensor services

    /**
     * Humidity Service
     */

    // get the Humidity service if it exists, otherwise create a new Humidity service
    this.humidityService = this.accessory.getService(this.ondusPlatform.Service.HumiditySensor) || 
       this.accessory.addService(this.ondusPlatform.Service.HumiditySensor);

    // set the Humidity service characteristics
    this.humidityService
      .setCharacteristic(this.ondusPlatform.Characteristic.Name, accessory.context.device.name)
      .setCharacteristic(this.ondusPlatform.Characteristic.StatusActive, this.ondusPlatform.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.ondusPlatform.Characteristic.StatusFault, this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);

    // create handlers for required characteristics for Humidity service
    this.humidityService.getCharacteristic(this.ondusPlatform.Characteristic.CurrentRelativeHumidity)
      .on('get', this.handleCurrentRelativeHumidityGet.bind(this));

  }

  start() {
    // Fetch initial sensor data from Ondus API on startup
    if (this.historyService) {
      this.getHistoricalMeasurements();
    } else {
      this.getLastMeasurements();
    }
    this.getStatus();
    
    // Start timer for fetching updated values from Ondus API once every refresh_interval from now on
    // The reason is that sensors only report new data once every day, so no point in querying Ondus API often
    let refreshInterval = this.ondusPlatform.config['refresh_interval'] * 1000;
    if (!refreshInterval) {
      // eslint-disable-next-line max-len
      this.ondusPlatform.log.warn(`[${this.logPrefix}] Refresh interval incorrectly configured in config.json - using default value of 3600 seconds`);
      refreshInterval = 3600000;
    }
    setInterval( () => { 
      // Make sure accessory context device has the latest appliance info
      this.updateApplianceInfo(); 
      // Fetch new data
      this.getLastMeasurements();
      this.getStatus();
    }, refreshInterval);
  }

  resetAllStatusFaults() {
    this.setLeakServiceStatusFault(false);
    this.setTemperatureServiceStatusFault(false);
    this.setHumidityServiceStatusFault(false);
  }

  // ---- CHARACTERISTICS HANDLER FUNCTIONS BELOW ----


  setHumidityServiceStatusActive(action: boolean) {
    if (action) {
      this.humidityService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusActive, 
        this.ondusPlatform.Characteristic.Active.ACTIVE);
    } else {
      this.humidityService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusActive, 
        this.ondusPlatform.Characteristic.Active.INACTIVE);      
    }
  }

  setHumidityServiceStatusFault(action: boolean) {
    if (action) {
      this.humidityService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
        this.ondusPlatform.Characteristic.StatusFault.GENERAL_FAULT);
    } else {
      this.humidityService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
        this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);      
    }
  }


  // ---- HTTP HANDLER FUNCTIONS BELOW ----


  /**
   * Handle requests to get the current value of the "Current Relative Humidity" characteristic
   */
  handleCurrentRelativeHumidityGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET CurrentRelativeHumidity`);
    callback(null, this.currentHumidity);
  }


  // ---- ONDUS API FUNCTIONS BELOW ----


  /**
   * Fetch Ondus Sense historical measurement data from the Ondus API.
   */
  getHistoricalMeasurements() {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Fetching historical temperature and humidity levels`);

    // Fetch all registered appliance measurements
    // If no measurements are present, the following is returned {"code":404,"message":"Not found"}
    this.getApplianceMeasurements()
      .then( measurement => {
        const measurementArray = measurement.body.data.measurement;
        if (!Array.isArray(measurementArray)) {
          throw Error(`Unknown response: ${measurementArray}`);
        }

        // Sort historical measurements
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Retrieved ${measurementArray.length} historical measurements`);
        measurementArray.sort((a, b) => {
          const a_ts = new Date(a.timestamp).getTime();
          const b_ts = new Date(b.timestamp).getTime();
          if(a_ts > b_ts) {
            return 1;
          } else if(a_ts < b_ts) {
            return -1;
          } else {
            return 0;
          }
        });

        // Add historical measurements to fakegato
        measurementArray.forEach( value => {
          this.historyService.addEntry({time: moment(value.timestamp).unix(), 
            temp: value.temperature, humidity: value.humidity});
        });

        // Extract latest sensor data
        const lastMeasurement = measurementArray.slice(-1)[0];
        this.currentTimestamp = lastMeasurement.timestamp;
        this.currentTemperature = lastMeasurement.temperature;
        this.currentHumidity = lastMeasurement.humidity;
        this.ondusPlatform.log.info(`[${this.logPrefix}] Timestamp: ${this.currentTimestamp}`);
        this.ondusPlatform.log.info(`[${this.logPrefix}] => Temperature: ${this.currentTemperature}˚C`);
        this.ondusPlatform.log.info(`[${this.logPrefix}] => Humidity: ${this.currentHumidity}% RF`);

        // Enable Active characteristics for temperature and humidity service
        this.setTemperatureServiceStatusActive(true);
        this.setHumidityServiceStatusActive(true);
        
      })
      .catch( err => {
        this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to retrieve historical temperature and humidity: ${err}`);

        // Disable Active characteristics for temperature and humidity service
        this.setTemperatureServiceStatusActive(false);
        this.setHumidityServiceStatusActive(false);
      });
  }




  /**
   * Fetch latest Ondus Sense measurement data from the Ondus API
   */
  getLastMeasurements() {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Updating temperature and humidity levels`);

    // Fetch appliance measurements using current timestamp
    // If no measurements are present, the following is returned {"code":404,"message":"Not found"}

    // Use last update timestamp from service for querying latest measurements
    const todayDate = new Date(Date.now());
    const fromDate = new Date(this.accessory.context.device.tdt);
    const diffMsec = todayDate.getTime() - fromDate.getTime();
    let warning = '';
    if (diffMsec > 86400000) {
      const days = Math.round(diffMsec / 86400000);
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
        
        // Add retrieved measurements from last day if historyService is enabled
        if (this.historyService) {
          measurementArray.forEach( value => {
            this.historyService.addEntry({time: moment(value.timestamp).unix(), 
              temp: value.temperature, humidity: value.humidity});
          });
        }

        // Sort and retrieve last measurement
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Retrieved ${measurementArray.length} measurements - picking latest one`);
        measurementArray.sort((a, b) => {
          const a_ts = new Date(a.timestamp).getTime();
          const b_ts = new Date(b.timestamp).getTime();
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
        this.ondusPlatform.log.info(`[${this.logPrefix}] Timestamp: ${this.currentTimestamp}`);
        this.ondusPlatform.log.info(`[${this.logPrefix}] => Temperature: ${this.currentTemperature}˚C`);
        this.ondusPlatform.log.info(`[${this.logPrefix}] => Humidity: ${this.currentHumidity}% RF`);

        // Enable Active characteristics for temperature and humidity service
        this.setTemperatureServiceStatusActive(true);
        this.setHumidityServiceStatusActive(true);
      })
      .catch( err => {
        this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to update temperature and humidity: ${err}`);

        // Disable Active characteristics for temperature and humidity service
        this.setTemperatureServiceStatusActive(false);
        this.setHumidityServiceStatusActive(false);
      });
  }

  /**
   * Fetch Ondus Sense Plus WiFi quality and connection status from the Ondus API.
   */
  getStatus() {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Updating WiFi quality, and connection status`);
 
    // Retrieve appliance status for this instance
    this.getApplianceStatus()
      .then(info => {
        //this.ondusPlatform.log.debug(info.body);
        info.body.forEach(infoElement => {
          if (infoElement.type === 'wifi_quality') {
            this.currentWiFiQuality = infoElement.value;
          }
          if (infoElement.type === 'connection') {
            this.currentConnection = infoElement.value;
          }
        });
      
        this.ondusPlatform.log.info(`[${this.logPrefix}] => WiFi quality: ${this.currentWiFiQuality}`);
        this.ondusPlatform.log.info(`[${this.logPrefix}] => Connection: ${this.currentConnection}`);
      })
      .catch(err => {
        this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to update device status: ${err}`);
      });
  }
}
