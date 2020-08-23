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

  static VALVE_OPEN = true;
  static VALVE_CLOSED = false;

  // Extended sensor services
  valveService: Service;

  // Extended sensor data properties
  private currentValveState: boolean = OndusSenseGuard.VALVE_OPEN || OndusSenseGuard.VALVE_CLOSED;
  private currentFlowRate: number;
  private currentPressure: number;
 
  /**
   * Ondus Sense Guard constructor for mains powered water control valve
   */
  constructor(
    public ondusPlatform: OndusPlatform,
    public locationID: number,
    public roomID: number,
    public accessory: PlatformAccessory,
  ) {
    super(ondusPlatform, locationID, roomID, accessory);

    // Set extended sensor data to default values
    this.currentValveState = OndusSenseGuard.VALVE_OPEN;
    this.currentFlowRate = 0;
    this.currentPressure = 0;

    // set accessory information
    this.accessory.getService(this.ondusPlatform.Service.AccessoryInformation)!
      .setCharacteristic(this.ondusPlatform.Characteristic.Manufacturer, OndusSenseGuard.ONDUS_PROD)
      .setCharacteristic(this.ondusPlatform.Characteristic.Model, OndusSenseGuard.ONDUS_NAME)
      .setCharacteristic(this.ondusPlatform.Characteristic.HardwareRevision, accessory.context.device.type)
      .setCharacteristic(this.ondusPlatform.Characteristic.SerialNumber, this.unhexlify(accessory.context.device.serial_number))
      .setCharacteristic(this.ondusPlatform.Characteristic.FirmwareRevision, accessory.context.device.version)
      .setCharacteristic(this.ondusPlatform.Characteristic.AppMatchingIdentifier, '1451814256');
      
    // Initialize extended sensor services

    /**
     * Valve service
     * 
     * A short summary for Active / InUse - Logic:
     * Active=0, InUse=0 -> Off
     * Active=1, InUse=0 -> Waiting [Starting, Activated but no water flowing (yet)]
     * Active=1, InUse=1 -> Running
     * Active=0, InUse=1 -> Stopping
     */
    
    // get the Valve service if it exists, otherwise create a new Valve service
    this.valveService = this.accessory.getService(this.ondusPlatform.Service.Valve) ||
      this.accessory.addService(this.ondusPlatform.Service.Valve);
    
    // set the Valve service characteristics
    this.valveService
      .setCharacteristic(this.ondusPlatform.Characteristic.Name, accessory.context.device.name)
      .setCharacteristic(this.ondusPlatform.Characteristic.Active, this.ondusPlatform.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.ondusPlatform.Characteristic.InUse, this.ondusPlatform.Characteristic.InUse.IN_USE)
      .setCharacteristic(this.ondusPlatform.Characteristic.ValveType, this.ondusPlatform.Characteristic.ValveType.GENERIC_VALVE)
      .setCharacteristic(this.ondusPlatform.Characteristic.StatusFault, this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);
      
    // register handlers for required characteristics of Valve service
    this.valveService.getCharacteristic(this.ondusPlatform.Characteristic.Active)
      .on('get', this.handleActiveGet.bind(this))
      .on('set', this.handleActiveSet.bind(this));


  }
  
  // ---- HTTP HANDLER FUNCTIONS BELOW ----

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  handleCurrentTemperatureGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET CurrentTemperature`);
    this.getMeasurements()
      .then ( () => {
        callback(null, this.currentTemperature);
      })
      .catch( err => {
        callback(err, this.currentTemperature);
      });
  }

  /**
   * Handle requests to get the current value of the "Active" characteristic
   */
  handleActiveGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET Active`);
    //this.ondusPlatform.log.debug('GET reporting: ', this.currentValveState);
    this.getValveState()
      .then( () => {
        callback(null, this.currentValveState);
      })
      .catch( err => {
        callback(err, this.currentValveState);
      });
    
  }

  /**
   * Handle requests to set the "Active" characteristic
   */
  handleActiveSet(value, callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered SET Active: ${value}`);
    
    if (!this.ondusPlatform.config['valve_control']) {
      // eslint-disable-next-line max-len
      this.ondusPlatform.log.warn(`[${this.logPrefix}] If you really, really, REALLY want to control your main water inlet valve through HomeKit, please enable this feature in the plugin settings`);
      callback(null);
    } else {
      // Set valve state to value
      //this.ondusPlatform.log.debug('before state is: ', this.currentValveState);
      this.setValveState(value === 1 ? true: false)
        .then( () => {
          //this.ondusPlatform.log.debug(`after state is ${this.currentValveState} ${res}`);
          callback(null);
        })
        .catch( err => {
          // An error occured, so indicate this to the callback handler
          callback(err);
        });
    }
  }

  /**
   * Handle requests to get the current value of the "In Use" characteristic
   * 
   * This does not return InUse characteristics in real-time, but depends on the
   * getCurrentTemperatureGet() method, which - in addition to temperature - 
   * also extracts the flowrate and water pressure. 
   * 
   * Current assumption is that the getCurrentTemperatureGet() method will most 
   * likely be triggered when handleInUseGet() is triggered.
   */
  handleInUseGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET InUse`);
    callback(null, (this.currentFlowRate > 0 ? this.ondusPlatform.Characteristic.InUse.IN_USE : 
      this.ondusPlatform.Characteristic.InUse.NOT_IN_USE));
  
  }

  // ---- ONDUS API FUNCTIONS BELOW ----


  /**
  * Fetch Ondus Sense Guard measurement data. Returns a promise that will be resolved
   * once measurement data has been queried from the Ondus API.
  */
  getMeasurements() {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Updating temperature, flowrate, and pressure readings`);

    // Fetch appliance measurements using current timestamp
    // If no measurements are present, the following is returned {"code":404,"message":"Not found"}

    // Use last update timestamp from service for querying latest measurements

    // Return new promise to caller before calling into async function, and resolve 
    // this promise when getApplianceCommand promise has been resolved and result processed.
    // This will prevent handleActiveGet() function returning incorrect value for currentValveState
    return new Promise<number>((resolve, reject) => {
        
      // Get fromDate measurements
      const fromDate = new Date(Date.now());

      // Retrieve latest Sense Guard measurement metrics
      this.getApplianceMeasurements(fromDate)
        .then( measurement => {
        //this.ondusPlatform.log.debug('res: ', measurement);
          const measurementArray = measurement.body.data.measurement;
          if (!Array.isArray(measurementArray)) {
            this.ondusPlatform.log.debug(`[${this.logPrefix}] Unknown response ${measurement.body}`);
          }
          this.ondusPlatform.log.debug(`[${this.logPrefix}] Retrieved ${measurementArray.length} measurements - picking last one`);
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
          this.currentFlowRate = lastMeasurement.flowrate;
          this.currentPressure = lastMeasurement.pressure;
          this.currentTemperature = lastMeasurement.temperature_guard;
          const valveState = this.currentValveState === OndusSenseGuard.VALVE_OPEN? 'Open': 'Closed';
          this.ondusPlatform.log.info(`[${this.logPrefix}] Timestamp: ${this.currentTimestamp}`);          
          this.ondusPlatform.log.info(`[${this.logPrefix}] => Valve: ${valveState}`);
          this.ondusPlatform.log.info(`[${this.logPrefix}] => Flowrate: ${this.currentFlowRate}`);
          this.ondusPlatform.log.info(`[${this.logPrefix}] => Pressure: ${this.currentPressure} bar`);
          this.ondusPlatform.log.info(`[${this.logPrefix}] => Temperature: ${this.currentTemperature}˚C`);

          // Reset StatusFault characteristics for temperature service
          this.temperatureService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
            this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);
          
          // Resolve promise to handleCurrentTemperatureGet()
          resolve(this.currentTemperature);
        })
        .catch( err => {
          this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to update temperature: ${err}`);
        
          // Set StatusFault characteristics for temperature service
          this.temperatureService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
            this.ondusPlatform.Characteristic.StatusFault.GENERAL_FAULT);

          // Reject promise to handleCurrentTemperatureGet() and return last known temperature
          reject(this.currentTemperature);
        });
    });
  }

  /**
   * Retrieve Sense Guard valve state. Returns a promise that will be resolved
   * once valve state has been queried from the Ondus API.
   */
  getValveState() {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Retrieving main water inlet valve state`);

    // Return new promise to caller before calling into async function, and resolve 
    // this promise when getApplianceCommand promise has been resolved and result processed.
    // This will prevent handleActiveGet() function returning incorrect value for currentValveState
    return new Promise<boolean>((resolve, reject) => {
      this.getApplianceCommand()
        .then(res => {
          this.currentValveState = res.body.command.valve_open;
          if (this.currentValveState) {
            this.ondusPlatform.log.debug(`[${this.logPrefix}] Main water inlet valve is open`);
            this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.Active, 
              this.ondusPlatform.Characteristic.Active.ACTIVE);
            this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.InUse, 
              this.ondusPlatform.Characteristic.InUse.IN_USE);
          } else {
            this.ondusPlatform.log.debug(`[${this.logPrefix}] Main water inlet valve is closed`);
            this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.Active, 
              this.ondusPlatform.Characteristic.Active.INACTIVE);
            this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.InUse, 
              this.ondusPlatform.Characteristic.InUse.NOT_IN_USE);
          }

          // Reset StatusFault characteristics for valve service
          this.temperatureService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
            this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);
          this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
            this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);
                
          // Resolve promise to handleActiveGet()
          resolve(this.currentValveState);
        })
        .catch(err => {
          this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to retrieve main water inlet valve state: ${err}`);

          // Set StatusFault characteristics for temperature and valve service
          this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
            this.ondusPlatform.Characteristic.StatusFault.GENERAL_FAULT);
          
          // Resolve promise to handleActiveGet() and return last known valve state
          reject(this.currentValveState);
        });
    });
  }

  /**
   * Control the Ondus Sense Guard valve. Returns a promise that will be resolved
   * once valve state has been configured through Ondus API.
   *  
   * @param valveState true if valve is to be opened, false if valve is to be closed
   */
  setValveState(valveState: boolean) {

    // Log input
    if (valveState === OndusSenseGuard.VALVE_OPEN) {
      this.ondusPlatform.log.warn(`[${this.logPrefix}] Opening main water inlet valve`);
      this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.Active, 
        this.ondusPlatform.Characteristic.Active.ACTIVE);
    } else {
      this.ondusPlatform.log.warn(`[${this.logPrefix}] Closing main water inlet valve`);
      this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.Active, 
        this.ondusPlatform.Characteristic.Active.INACTIVE);
    }

    // Construct payload for controlling valve state
    const data = {'type': OndusSenseGuard.ONDUS_TYPE, 'command' : { 'valve_open': valveState } };

    // Return new promise to caller before calling into async function, and resolve 
    // this promise when setApplianceCommand promise has been resolved and result processed.
    // This will prevent handleActiveSet() function returning incorrect value for currentValveState
    return new Promise<boolean>((resolve, reject) => {
      this.setApplianceCommand(data)
        .then(res => {
          //this.ondusPlatform.log.debug('res: ', res.body);
          this.currentValveState = res.body.command.valve_open;
          if (this.currentValveState) {
            this.ondusPlatform.log.warn(`[${this.logPrefix}] Main water inlet valve has been opened`);
            this.currentValveState = OndusSenseGuard.VALVE_OPEN;
            this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.InUse, 
              this.ondusPlatform.Characteristic.InUse.IN_USE);
          } else {
            this.ondusPlatform.log.warn(`[${this.logPrefix}] Main water inlet valve has been closed`);
            this.currentValveState = OndusSenseGuard.VALVE_CLOSED;
            this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.InUse, 
              this.ondusPlatform.Characteristic.InUse.NOT_IN_USE);
          }

          // Reset StatusFault characteristics for valve service
          this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
            this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);

          // Resolve promise to handleActiveSet()
          resolve(this.currentValveState);
        })
        .catch(err => {
          //this.ondusPlatform.log.debug('err:', err);
          this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to retrieve valve state: ${err}`);

          // Set StatusFault characteristics for valve service
          this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
            this.ondusPlatform.Characteristic.StatusFault.GENERAL_FAULT);

          // Reject promise to handleActiveSet() and return last known valve state
          reject(this.currentValveState);
        });
    });
  }

}
