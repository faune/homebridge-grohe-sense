import { Service, PlatformAccessory } from 'homebridge';

import { OndusPlatform } from './ondusPlatform';
import { OndusAppliance } from './ondusAppliance';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class OndusSenseGuard extends OndusAppliance {
  static ONDUS_TYPE = 103;
  static ONDUS_NAME = 'Sense Guard';

  public tempService: Service;
  public valveService: Service;

  /**
   * Ondus Sense Guard constructor for mains powered water control valve
   */
  constructor(
    public ondusPlatform: OndusPlatform,
    public accessory: PlatformAccessory,
    public locationID: number,
    public roomID: number,
  ) {
    super(ondusPlatform, accessory, locationID, roomID);

    // set accessory information
    this.accessory.getService(this.ondusPlatform.Service.AccessoryInformation)!
      .setCharacteristic(this.ondusPlatform.Characteristic.Manufacturer, OndusSenseGuard.ONDUS_PROD)
      .setCharacteristic(this.ondusPlatform.Characteristic.Model, OndusSenseGuard.ONDUS_NAME)
      .setCharacteristic(this.ondusPlatform.Characteristic.HardwareRevision, accessory.context.device.type)
      .setCharacteristic(this.ondusPlatform.Characteristic.SerialNumber, accessory.context.device.serial_number)
      .setCharacteristic(this.ondusPlatform.Characteristic.FirmwareRevision, accessory.context.device.version)
      .setCharacteristic(this.ondusPlatform.Characteristic.AppMatchingIdentifier, '1451814256');


    /**
     * TEMPERATURE service
     */
    // get the Temperature service if it exists, otherwise create a new Temperature service
    this.tempService = this.accessory.getService(this.ondusPlatform.Service.TemperatureSensor) || 
      this.accessory.addService(this.ondusPlatform.Service.TemperatureSensor);

    // set the Temperature service name, this is what is displayed as the default name on the Home app
    this.tempService.setCharacteristic(this.ondusPlatform.Characteristic.Name, accessory.context.device.name);

    // register handlers for required temperature characteristics
    this.tempService.getCharacteristic(this.ondusPlatform.Characteristic.CurrentTemperature)
      .on('get', this.getMeasurements.bind(this));               // GET - bind to the `getOn` method below

    /**
     * VALVE service
     */
    // get the Valve service if it exists, otherwise create a new Valve service
    this.valveService = this.accessory.getService(this.ondusPlatform.Service.Valve) ||
      this.accessory.addService(this.ondusPlatform.Service.Valve);

    // set the Valve service name, this is what is displayed as the default name on the Home app
    this.valveService
      .setCharacteristic(this.ondusPlatform.Characteristic.Name, accessory.context.device.name)
      .setCharacteristic(this.ondusPlatform.Characteristic.ValveType, 'GENERIC_VALVE');

    // register handlers for required valve characteristics
    this.valveService.getCharacteristic(this.ondusPlatform.Characteristic.Active)
      //.on('set', this.setOn.bind(this))                // SET - bind to the `setOn` method below
      .on('get', this.getValveState.bind(this));               // GET - bind to the `getOn` method below

    // Fetch updated values from Ondus API on startup
    //this.updateTemperature();
    //this.getValveState();   

    /* TODO: For valve control
    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .on('set', this.setOn.bind(this))                // SET - bind to the `setOn` method below
      .on('get', this.getOn.bind(this));               // GET - bind to the `getOn` method below
    */

    /*

    // Start timer for fetching updated values from Ondus API once every refresh_interval from now on
    let refreshInterval = this.ondusPlatform.config['refresh_interval'] * 10000;
    if (!refreshInterval) {
      this.ondusPlatform.log.warn('Refresh interval incorrectly configured in config.json - using default value of 3600000');
      refreshInterval = 3600000;
    }
    setInterval( () => {
      this.accessory.reachable = true; // Reset state to reachable before fetching new data
      this.updateTemperature();
    }, refreshInterval);
    */
  }


  /**
  *  Fetch Ondus Sense Guard measurement data
  */
  getMeasurements(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Updating temperature`);

    // Fetch appliance measurements using current timestamp
    // If no measurements are present, the following is returned {"code":404,"message":"Not found"}

    // Use last update timestamp from service for querying latest measurements
    const fromDate = new Date(Date.now());

    // Get fromDate measurements
    this.getApplianceMeasurements(fromDate)
      .then( measurement => {
        //this.ondusPlatform.log.debug('res: ', measurement);
        const measurementArray = measurement.body.data.measurement;
        if (!Array.isArray(measurementArray)) {
          this.ondusPlatform.log.debug(`[${this.logPrefix}] Unknown response ${measurementArray}`);
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
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Last measured temperature level: ${lastMeasurement.temperature_guard}`);
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Last measured flowrate level: ${lastMeasurement.flowrate}`);
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Last measured pressure level: ${lastMeasurement.pressure}`);

        callback(null, lastMeasurement.temperature_guard);
        
      })
      .catch( err => {
        this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to update temperature: ${err}`);
        this.accessory.reachable = false;
        callback(null);
      });
  }

  /**
   * Retrieve Sense Guard valve state
   */
  getValveState(callback) {

    this.ondusPlatform.log.debug(`[${this.logPrefix}] Retrieving valve state`);

    this.getApplianceCommand()
      .then(command=> {
        if (command.body.command.valve_open) {
          this.ondusPlatform.log.debug(`[${this.logPrefix}] Valve is open`);
        } else {
          this.ondusPlatform.log.debug(`[${this.logPrefix}] Valve is closed`);
        }
        callback(null, command.body.command.valve_open);
      })
      .catch(err => {
        this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to retrieve valve state: ${err.text}`);
        callback(null);
      });
  }

}
