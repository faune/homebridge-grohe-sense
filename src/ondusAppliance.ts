import { PlatformAccessory, Service } from 'homebridge';

import { OndusPlatform } from './ondusPlatform';
import { OndusThresholds } from './ondusThresholds';
import { OndusNotification, NOTIFICATION_CATEGORY_CRITICAL, NOTIFICATION_CATEGORY_WARNING} from './ondusNotification';


/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export abstract class OndusAppliance {
  static ONDUS_TYPE = 0;
  static ONDUS_PROD = 'Grohe AG'
  static ONDUS_NAME = 'Overload me';

  logPrefix: string;
  applianceID: string;

  // Common sensor services
  leakService: Service;
  temperatureService: Service;

  // Placeholders for common sensor data
  currentTimestamp: string;
  currentTemperature: number;
  leakDetected: boolean;
  thresholds: OndusThresholds;

  
  /**
   * Ondus Sense abstract class
   */
  constructor(
    public ondusPlatform: OndusPlatform,
    public locationID: number,
    public roomID: number,
    public accessory: PlatformAccessory,
  ) {
    this.logPrefix = accessory.context.device.name;
    this.applianceID = accessory.context.device.appliance_id;

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
      .setCharacteristic(this.ondusPlatform.Characteristic.StatusFault, this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);
    
    // create handlers for required characteristics of Temperature service
    this.temperatureService.getCharacteristic(this.ondusPlatform.Characteristic.CurrentTemperature)
      .on('get', this.handleCurrentTemperatureGet.bind(this));


  }

  public getLocationID() {
    return this.locationID;
  }

  public getRoomID() {
    return this.roomID;
  }

  public getApplianceID() {
    return this.applianceID;
  }

  /**
   * Utility functions
   */
  public unhexlify(str: string) {
    let result = '';
    for (let i=0, l=str.length; i<l; i+=2) {
      result += String.fromCharCode(parseInt(str.substr(i, 2), 16));
    }
    return result;
  }

  /**
   * Handle requests to get the current value of the "LeakDetected" characteristics
   * 
   * Fetch all unread notifications for this appliance from the Ondus API.
   * 
   * If one or more category 30 notification is encountered, the leakService will
   * trigger a LEAK_DETECTED. This also means that the only way to clear LEAK_DETECTED
   * events is for the user to mark the message(s) responsible for triggering the 
   * behavior as either read or delete them altogether from the Ondus API.
   * 
   * NOTE: 
   * This is the only handler for this class that must fetch and process appliance notifications 
   * directly from the Ondus API upon request, because the Sense and Guard can potentially report 
   * new notifications if a configured threshold has been exceeded within the last hours, or if 
   * a leak is detected.
   */
  handleLeakDetectedGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET LeakDetected:`);

    // Fetch buffered notifications from the Ondus API
    this.getApplianceNotifications()
      .then( res => {

        // Reset leakDetected before parsing notifications
        this.leakDetected = false;

        // Log number of pending notifications
        if (res.body.length > 0) {
          this.ondusPlatform.log.debug(`[${this.logPrefix}] Processing ${res.body.length} notifications ...`);
        } else {
          this.ondusPlatform.log.debug(`[${this.logPrefix}] No pending notifications`);
        }

        // Iterate over all notifications for this accessory
        res.body.forEach(element => {
          if (element.category === NOTIFICATION_CATEGORY_WARNING ) {
            // Check if notifications contained one or more category critical messages.
            // If this is the case a leakage has been detected
            this.leakDetected = true;
          }
          // Log each notification message regardless of category. These messages will be 
          // encountered and logged until they are marked as read in the Ondus mobile app
          const notification = new OndusNotification(element.category, element.type, element.timestamp, this).getNotification();
          this.ondusPlatform.log.warn(`[${this.logPrefix}] ${notification}`);
        });

        // Update the leakService LeakDetected characteristics
        if (this.leakDetected) {
          this.leakService.updateCharacteristic(this.ondusPlatform.Characteristic.LeakDetected, 
            this.ondusPlatform.Characteristic.LeakDetected.LEAK_DETECTED);
        } else {
          this.leakService.updateCharacteristic(this.ondusPlatform.Characteristic.LeakDetected, 
            this.ondusPlatform.Characteristic.LeakDetected.LEAK_NOT_DETECTED);
        }
        // Reset StatusFault characteristics for battery service
        this.leakService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
          this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);
    
        callback(null, this.leakDetected);

      })
      .catch( err => {
        this.ondusPlatform.log.debug(err);
        this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to process notifications: ${err}`);
        
        // Set StatusFault characteristics for leakage service
        this.leakService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
          this.ondusPlatform.Characteristic.StatusFault.GENERAL_FAULT);  
  
        callback(err, this.leakDetected);
      });
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  handleCurrentTemperatureGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET CurrentTemperature`);
    callback(null, this.currentTemperature);
  }

 
 
 
  // ---- HELPER FUNCTIONS BELOW HANDLING ONDUS IDs AUTOMATICALLY ----

  /**
   * Retrieve appliance info like appliance ID, type, and name as a JSON object 
   */
  public async getApplianceInfo() {
    return this.ondusPlatform.ondusSession.getApplianceInfo(
      this.getLocationID(),
      this.getRoomID(), 
      this.getApplianceID());
  }

  /**
   * Make sure accessory context device is updated with the latest appliance info,
   * else the last available data will not be fetched 
   */
  async updateApplianceInfo() {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Updating appliance info`);
    this.getApplianceInfo()
      .then( info => {
        //this.ondusPlatform.log.debug('info: ', info.body);
        this.accessory.context.device = info.body[0];
        this.thresholds.update();
      })
      .catch( err => {
        this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to update appliance info: ${err.text}`);
      });
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
   * Retrieve appliance measurements as a JSON object
   * 
   * @param fromDate Optional Date argument when to fetch measurements from
   */
  public async getApplianceMeasurements(fromDate?: Date) {
    return this.ondusPlatform.ondusSession.getApplianceMeasurements(
      this.getLocationID(), 
      this.getRoomID(), 
      this.getApplianceID(), 
      fromDate);
  }

  /**
   * Retrieve appliance status like wifi quality, battery, 
   * and connection status as a JSON object
   */
  public async getApplianceStatus() {
    return this.ondusPlatform.ondusSession.getApplianceStatus(
      this.getLocationID(), 
      this.getRoomID(), 
      this.getApplianceID());
  }

  /**
   * Retrieve appliance command
   */
  public async getApplianceCommand() {
    return this.ondusPlatform.ondusSession.getApplianceCommand(
      this.getLocationID(),
      this.getRoomID(),
      this.getApplianceID());
  }

  /**
   * Send new appliance command 
   * 
   * @param data JSON object containing new appliance configuration 
   */
  // eslint-disable-next-line @typescript-eslint/ban-types
  public async setApplianceCommand(data) {
    return this.ondusPlatform.ondusSession.setApplianceCommand(
      this.getLocationID(),
      this.getRoomID(),
      this.getApplianceID(),
      data,
    );
  }

}