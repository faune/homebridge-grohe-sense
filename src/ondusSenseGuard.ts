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

  static VALVE_OPEN = 1;
  static VALVE_CLOSED = 0;

  temperatureService: Service;
  valveService: Service;

  private currentTemperature: number;
  private currentValveState: number = OndusSenseGuard.VALVE_OPEN | OndusSenseGuard.VALVE_CLOSED;
  private currentFlowRate: number;
  private currentPressure: number;
  private currentTimestamp: string;

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

    // Placeholders for sensor data
    this.currentTemperature = 0;
    this.currentValveState = OndusSenseGuard.VALVE_OPEN;
    this.currentFlowRate = 0;
    this.currentPressure = 0;
    this.currentTimestamp = '';

    // set accessory information
    this.accessory.getService(this.ondusPlatform.Service.AccessoryInformation)!
      .setCharacteristic(this.ondusPlatform.Characteristic.Manufacturer, OndusSenseGuard.ONDUS_PROD)
      .setCharacteristic(this.ondusPlatform.Characteristic.Model, OndusSenseGuard.ONDUS_NAME)
      .setCharacteristic(this.ondusPlatform.Characteristic.HardwareRevision, accessory.context.device.type)
      .setCharacteristic(this.ondusPlatform.Characteristic.SerialNumber, accessory.context.device.serial_number)
      .setCharacteristic(this.ondusPlatform.Characteristic.FirmwareRevision, accessory.context.device.version)
      .setCharacteristic(this.ondusPlatform.Characteristic.AppMatchingIdentifier, '1451814256');


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
     * Valve service
     */
    // get the Valve service if it exists, otherwise create a new Valve service
    this.valveService = this.accessory.getService(this.ondusPlatform.Service.Valve) ||
      this.accessory.addService(this.ondusPlatform.Service.Valve);

    // set the Valve service name, this is what is displayed as the default name on the Home app
    this.valveService
      .setCharacteristic(this.ondusPlatform.Characteristic.Name, accessory.context.device.name)
      .setCharacteristic(this.ondusPlatform.Characteristic.ValveType, this.ondusPlatform.Characteristic.ValveType.GENERIC_VALVE);

    // register handlers for mandatory valve characteristics
    this.valveService.getCharacteristic(this.ondusPlatform.Characteristic.Active)
      .on('get', this.handleActiveGet.bind(this))
      .on('set', this.handleActiveSet.bind(this));

    this.valveService.getCharacteristic(this.ondusPlatform.Characteristic.InUse)
      .on('get', this.handleInUseGet.bind(this));

    this.valveService.getCharacteristic(this.ondusPlatform.Characteristic.ValveType)
      .on('get', this.handleValveTypeGet.bind(this));

  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  handleCurrentTemperatureGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET CurrentTemperature`);
    callback(null, this.currentTemperature);
  }

  /**
   * Handle requests to get the current value of the "Active" characteristic
   */
  handleActiveGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET Active`);
    callback(null, this.currentValveState);
  }

  /**
   * Handle requests to set the "Active" characteristic
   */
  handleActiveSet(value, callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered SET Active: ${value}`);
    // eslint-disable-next-line max-len
    this.ondusPlatform.log.debug(`[${this.logPrefix}] If you really, really, REALLY want to control your main inlet valve through HomeKit, please enable this feature in the plugin settings`);
    
    // Logic
    this.currentValveState = value;
    if (this.currentValveState > 0) {
      this.currentFlowRate = 1;
    } else {
      this.currentFlowRate = 0;
    }
    callback(null);
  }

  /**
   * Handle requests to get the current value of the "In Use" characteristic
   */
  handleInUseGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET InUse`);
    callback(null, (this.currentFlowRate > 0 ? this.ondusPlatform.Characteristic.InUse.IN_USE : 
      this.ondusPlatform.Characteristic.InUse.NOT_IN_USE));
  
  }


  /**
   * Handle requests to get the current value of the "Valve Type" characteristic
   */
  handleValveTypeGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET ValveType`);
    callback(null, this.valveService.getCharacteristic(this.ondusPlatform.Characteristic.ValveType));
  }




  /**
  *  Fetch Ondus Sense Guard measurement data
  */
  getMeasurements() {
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
        this.currentTimestamp = lastMeasurement.timestamp;
        this.currentTemperature = lastMeasurement.temperature_guard;
        this.currentFlowRate = lastMeasurement.flowrate;
        this.currentPressure = lastMeasurement.pressure;
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Last measured timestamp: ${this.currentTimestamp}`);
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Last measured temperature level: ${this.currentTemperature}`);
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Last measured flowrate level: ${this.currentFlowRate}`);
        this.ondusPlatform.log.debug(`[${this.logPrefix}] Last measured pressure level: ${this.currentPressure}`);        
      })
      .catch( err => {
        this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to update temperature: ${err}`);
        
        // Set StatusFault characteristics
        this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
          this.ondusPlatform.Characteristic.StatusFault.GENERAL_FAULT);
      });
  }

  /**
   * Retrieve Sense Guard valve state
   */
  getValveState() {

    this.ondusPlatform.log.debug(`[${this.logPrefix}] Retrieving valve state`);

    this.getApplianceCommand()
      .then(command => {
        this.currentValveState = command.body.command.valve_open;
        if (this.currentValveState) {
          this.ondusPlatform.log.debug(`[${this.logPrefix}] Valve is open`);
        } else {
          this.ondusPlatform.log.debug(`[${this.logPrefix}] Valve is closed`);
        }
      })
      .catch(err => {
        this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to retrieve valve state: ${err.text}`);

        // Set StatusFault characteristics
        this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
          this.ondusPlatform.Characteristic.StatusFault.GENERAL_FAULT);
      });
  }

}
