import { PlatformAccessory, Service } from 'homebridge';
import fakegato from 'fakegato-history';

import { OndusPlatform } from './ondusPlatform';
import { OndusThresholds } from './ondusThresholds';
import { OndusNotification, NOTIFICATION_CATEGORY_CRITICAL } from './ondusNotification';
import { OndusAppliance } from './ondusAppliance';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export abstract class OndusSensor extends OndusAppliance {
  
  // Common sensor services
  leakService: Service;
  temperatureService: Service;
  historyService: fakegato.FakeGatoHistoryService;

  // Placeholders for common sensor data
  currentTimestamp: string;
  currentTemperature: number;
  leakDetected: boolean;
  thresholds: OndusThresholds;

  
  /**
   * OndusSensor abstract constructor
   */
  constructor(
    public ondusPlatform: OndusPlatform,
    public locationID: number,
    public roomID: number,
    public accessory: PlatformAccessory,
  ) {
    super(ondusPlatform, locationID, roomID, accessory);

    // Placeholders for common sensor data
    this.currentTemperature = 0;
    this.currentTimestamp = '';
    this.leakDetected = false;
    this.thresholds = new OndusThresholds(this.ondusPlatform.log, this.accessory);

    // Update configured threshold limits
    this.thresholds.update();

    // Initialize common sensor services

    /**
     * Leakage service
     */
    this.leakService = this.accessory.getService(this.ondusPlatform.Service.LeakSensor) ||
      this.accessory.addService(this.ondusPlatform.Service.LeakSensor);

    // set the Leak service characteristics
    this.leakService
      .setCharacteristic(this.ondusPlatform.Characteristic.Name, accessory.context.device.name)
      .setCharacteristic(this.ondusPlatform.Characteristic.LeakDetected, this.ondusPlatform.Characteristic.LeakDetected.LEAK_NOT_DETECTED)
      .setCharacteristic(this.ondusPlatform.Characteristic.StatusActive, this.ondusPlatform.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.ondusPlatform.Characteristic.StatusFault, this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);      
  
    // create handlers for required characteristics of Leak service
    this.leakService.getCharacteristic(this.ondusPlatform.Characteristic.LeakDetected)
      .on('get', this.handleLeakDetectedGet.bind(this));

      
    /**
     * Temperature Service
     */

    // get the Temperature service if it exists, otherwise create a new Temperature service
    this.temperatureService = this.accessory.getService(this.ondusPlatform.Service.TemperatureSensor) ||
      this.accessory.addService(this.ondusPlatform.Service.TemperatureSensor);

    // set the Temperature service characteristics
    this.temperatureService
      .setCharacteristic(this.ondusPlatform.Characteristic.Name, accessory.context.device.name)
      .setCharacteristic(this.ondusPlatform.Characteristic.StatusActive, this.ondusPlatform.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.ondusPlatform.Characteristic.StatusFault, this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);
    //.setCharacteristic(this.ondusPlatform.Characteristic.TemperatureDisplayUnits, 
    //this.ondusPlatform.Characteristic.TemperatureDisplayUnits.CELSIUS)
      
    // create handlers for required characteristics of Temperature service
    this.temperatureService.getCharacteristic(this.ondusPlatform.Characteristic.CurrentTemperature)
      .on('get', this.handleCurrentTemperatureGet.bind(this));


    /**
     * History Service
     */
    
    // Initialize FakeGatoHistoryService
    if (this.ondusPlatform.config['fakegato_support']) {
      const FakeGatoHistoryService = fakegato(this.ondusPlatform.api);
      this.historyService = new FakeGatoHistoryService('weather', this.accessory, {disableTimer: true});
      this.historyService.log = this.ondusPlatform.log;
      this.historyService.name = this.logPrefix;
      this.historyService.accessoryName = this.logPrefix;
    } else {
      this.historyService = null;
    }
    
  }

  /**
   * This function is designed to start any custom action in addition
   * to what is done in the constructor. Some child instances might
   * require a bit different code for initial data query, and this
   * will be problematic as the super constructor must be called
   * regardless before functionality can start to be overloaded
   */
  start(): void {
    return; 
  }

  /**
   * This function must be overloaded in order to reset
   * all sensor StatusFault characteristics
   */
  resetAllStatusFaults() {
    this.setLeakServiceStatusFault(false);
    this.setTemperatureServiceStatusFault(false);
  }

  // ---- CHARACTERISTICS HANDLER FUNCTIONS BELOW ----

  setLeakServiceLeakDetected(action: boolean) {
    if (action) {
      this.leakService.updateCharacteristic(this.ondusPlatform.Characteristic.LeakDetected, 
        this.ondusPlatform.Characteristic.LeakDetected.LEAK_DETECTED);
    } else {
      this.leakService.updateCharacteristic(this.ondusPlatform.Characteristic.LeakDetected, 
        this.ondusPlatform.Characteristic.LeakDetected.LEAK_NOT_DETECTED);
    }
  }

  setLeakServiceStatusActive(action: boolean) {
    if (action) {
      this.leakService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusActive, 
        this.ondusPlatform.Characteristic.Active.ACTIVE);
      this.ondusPlatform.log.debug(`[${this.logPrefix}] LEAK SERVICE ACTIVE!`);
    } else {
      this.leakService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusActive, 
        this.ondusPlatform.Characteristic.Active.INACTIVE);
      this.ondusPlatform.log.debug(`[${this.logPrefix}] LEAK SERVICE INACTIVE!`);
    }
  }

  setLeakServiceStatusFault(action: boolean) {
    if (action) {
      this.leakService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
        this.ondusPlatform.Characteristic.StatusFault.GENERAL_FAULT);
      this.ondusPlatform.log.debug(`[${this.logPrefix}] LEAK SERVICE GENERAL FAULT!`);
    } else {
      this.leakService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
        this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);
      this.ondusPlatform.log.debug(`[${this.logPrefix}] LEAK SERVICE NO FAULT!`);
    }
  }

  setTemperatureServiceStatusActive(action: boolean) {
    if (action) {
      this.temperatureService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusActive, 
        this.ondusPlatform.Characteristic.Active.ACTIVE);
      this.ondusPlatform.log.debug(`[${this.logPrefix}] TEMP SERVICE ACTIVE!`);
    } else {
      this.temperatureService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusActive, 
        this.ondusPlatform.Characteristic.Active.INACTIVE);
      this.ondusPlatform.log.debug(`[${this.logPrefix}] TEMP SERVICE INACTIVE!`);
    }
  }

  setTemperatureServiceStatusFault(action: boolean) {
    if (action) {
      this.temperatureService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
        this.ondusPlatform.Characteristic.StatusFault.GENERAL_FAULT);
      this.ondusPlatform.log.debug(`[${this.logPrefix}] TEMP SERVICE GENERAL FAULT!`);
    } else {
      this.temperatureService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
        this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);
      this.ondusPlatform.log.debug(`[${this.logPrefix}] TEMP SERVICE NO FAULT!`);
    }
  }


  // ---- HTTP HANDLER FUNCTIONS BELOW ----


  /**
   * Handle requests to get the current value of the "LeakDetected" characteristics
   * 
   * Fetch all unread notifications for this sensor from the Ondus API.
   * 
   * If one or more category 30 notification is encountered, the leakService will
   * trigger a LEAK_DETECTED. This also means that the only way to clear LEAK_DETECTED
   * events is for the user to mark the message(s) responsible for triggering the 
   * behavior as either read or delete them altogether from the Ondus API.
   * 
   * NOTE: 
   * This is the only handler for this class that must fetch and process sensor notifications 
   * directly from the Ondus API upon request, because the Sense and Guard can potentially report 
   * new notifications if a configured threshold has been exceeded within the last hours, or if 
   * a leak is detected.
   */
  handleLeakDetectedGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET LeakDetected:`);

    // Fetch buffered notifications from the Ondus API
    this.getApplianceNotifications()
      .then( res => {

        // Dump server response for debugging purpose if SHTF mode is enabled
        if (this.ondusPlatform.config['shtf_mode']) {
          const debug = JSON.stringify(res.body);
          this.ondusPlatform.log.debug(`[${this.logPrefix}] handleLeakDetectedGet().getApplianceNotifications() API RSP:\n "${debug}"`);
        }

        // Reset all status fault characteristics before parsing new notifications
        this.leakDetected = false;
        this.resetAllStatusFaults();

        // Log number of pending notifications
        if (res.body.length === 0) {
          this.ondusPlatform.log.info(`[${this.logPrefix}] No pending notifications`);
        } else {
          this.ondusPlatform.log.info(`[${this.logPrefix}] Processing ${res.body.length} notifications ...`);

          // Iterate over all notifications for this accessory
          res.body.forEach(element => {
            if (element.category === NOTIFICATION_CATEGORY_CRITICAL ) {
              // Check if notifications contained one or more category critical messages.
              // If this is the case a leakage has been detected
              this.leakDetected = true;
            }
            // Log each notification message regardless of category. These messages will be 
            // encountered and logged until they are marked as read in the Ondus mobile app
            const notification = new OndusNotification(this, element.category, element.type, element.timestamp).getNotification();
            this.ondusPlatform.log.warn(`[${this.logPrefix}] ${notification}`);
          });
        }

        // Update the leakService LeakDetected characteristics
        this.setLeakServiceLeakDetected(this.leakDetected);
        
        // Enable Active characteristics for leak service
        this.setLeakServiceStatusActive(true);
        callback(null, this.leakDetected);

      })
      .catch( err => {
        this.ondusPlatform.log.debug(err);
        this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to process notifications: ${err}`);
        
        // Disable Active characteristics for leakage service
        this.setLeakServiceStatusActive(false);  
        callback(err, this.leakDetected);
      });
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   * 
   * This function should be overloaded depending on the strategy for fetching new temperature data
   */
  handleCurrentTemperatureGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET CurrentTemperature`);
    callback(null, this.currentTemperature);
  }

 
  


}