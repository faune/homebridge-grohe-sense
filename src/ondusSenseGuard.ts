import moment from 'moment';
import { Service, PlatformAccessory } from 'homebridge';

import { OndusPlatform } from './ondusPlatform';
import { OndusAppliance } from './ondusAppliance';


/**
 * Grohe Sense Guard Accessory for the Ondus platform
 * 
 * This accessory exposes the following services:
 * - Temperature
 * - Leakage
 * - Valve 
 * 
 * In addition the following metrics are logged, but not exposed in HomeKit:
 * - Water pressure
 * - Water flowrate 
 * 
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
   * 
   * Inherrits all common sensor handling from OndusAppliance
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
      .setCharacteristic(this.ondusPlatform.Characteristic.ValveType, this.ondusPlatform.Characteristic.ValveType.GENERIC_VALVE)
      .setCharacteristic(this.ondusPlatform.Characteristic.Active, this.ondusPlatform.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.ondusPlatform.Characteristic.InUse, this.ondusPlatform.Characteristic.InUse.IN_USE)
      .setCharacteristic(this.ondusPlatform.Characteristic.StatusActive, this.ondusPlatform.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.ondusPlatform.Characteristic.StatusFault, this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);
      
    // register handlers for required characteristics of Valve service
    this.valveService.getCharacteristic(this.ondusPlatform.Characteristic.Active)
      .on('get', this.handleValveServiceActiveGet.bind(this))
      .on('set', this.handleValveServiceActiveSet.bind(this));
  }


  start() {
    if (this.historyService) {
      this.getHistoricalMeasurements();
    }
  }


  resetAllStatusFaults() {
    this.setLeakServiceStatusFault(false);
    this.setTemperatureServiceStatusFault(false);
    this.setValveServiceStatusFault(false);
  }

  // ---- CHARACTERISTICS HANDLER FUNCTIONS BELOW ----

  setValveServiceActive(action: boolean) {
    if (action) {
      this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.Active, 
        this.ondusPlatform.Characteristic.Active.ACTIVE);
    } else {
      this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.Active, 
        this.ondusPlatform.Characteristic.Active.INACTIVE);
    }
  }

  setValveServiceInUse(action: boolean) {
    if (action) {
      this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.InUse, 
        this.ondusPlatform.Characteristic.InUse.IN_USE);
    } else {
      this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.InUse, 
        this.ondusPlatform.Characteristic.InUse.NOT_IN_USE);
    }
  }

  setValveServiceStatusActive(action: boolean) {
    if (action) {
      this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusActive, 
        this.ondusPlatform.Characteristic.Active.ACTIVE);
    } else {
      this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusActive, 
        this.ondusPlatform.Characteristic.Active.INACTIVE);
    }
  }

  setValveServiceStatusFault(action: boolean) {
    if (action) {
      this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
        this.ondusPlatform.Characteristic.StatusFault.GENERAL_FAULT);
    } else {
      this.valveService.updateCharacteristic(this.ondusPlatform.Characteristic.StatusFault, 
        this.ondusPlatform.Characteristic.StatusFault.NO_FAULT);
    }
  }

  


  // ---- HTTP HANDLER FUNCTIONS BELOW ----

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  handleCurrentTemperatureGet(callback) {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET CurrentTemperature`);
    this.getLastMeasurements()
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
  handleValveServiceActiveGet(callback) {
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
  handleValveServiceActiveSet(value, callback) {
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
   * Fetch Ondus Sense historical measurement data from the Ondus API. Returns a promise that will be resolved
   * once measurement data has been queried from the Ondus API.
  */
  getHistoricalMeasurements() {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Fetching historical temperature, flowrate, and pressure levels`);
    // Fetch all registered appliance measurements
    // If no measurements are present, the following is returned {"code":404,"message":"Not found"}

    this.getApplianceMeasurements()
      .then( measurement => {

        // Dump server response for debugging purpose if SHTF mode is enabled
        if (this.ondusPlatform.config['shtf_mode']) {
          const debug = JSON.stringify(measurement.body);
          this.ondusPlatform.log.debug(`[${this.logPrefix}] getHistoricalMeasurements().getApplianceMeasurements() API RSP:\n"${debug}"`);
        }

        if ((measurement.body.data !== undefined) && (Array.isArray(measurement.body.data.measurement))) {
          const measurementArray = measurement.body.data.measurement;
          this.ondusPlatform.log.debug(`[${this.logPrefix}] Retrieved ${measurementArray.length} historical measurements`);
          measurementArray.sort((a, b) => {
            const a_ts = new Date(a.date).getTime();
            const b_ts = new Date(b.date).getTime();
            if(a_ts > b_ts) {
              return 1;
            } else if(a_ts < b_ts) {
              return -1;
            } else {
              return 0;
            }
          });

          // Add historical measurements to historyService
          if (this.historyService) {
            measurementArray.forEach( value => {
              this.historyService.addEntry({time: moment(value.date).unix(), 
                temp: value.temperature_guard});
            });
          }
        } else {
          this.ondusPlatform.log.debug(`[${this.logPrefix}] No historical data returned`);
        }
      })
      .catch( err => {
        this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to retrieve historical temperature, flowrate, and pressure: ${err}`);
      });
  }


  /**
  * Fetch Ondus Sense Guard measurement data. Returns a promise that will be resolved
   * once measurement data has been queried from the Ondus API.
  */
  getLastMeasurements() {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Updating temperature, flowrate, and pressure levels`);

    // Fetch appliance measurements using current date
    // If no measurements are present, the following is returned {"code":404,"message":"Not found"}

    // Use last update date from service for querying latest measurements

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
            const a_ts = new Date(a.date).getTime();
            const b_ts = new Date(b.date).getTime();
            if(a_ts > b_ts) {
              return 1;
            } else if(a_ts < b_ts) {
              return -1;
            } else {
              return 0;
            }
          });

          // Add last measurements to historyService
          if (this.historyService) {
            measurementArray.forEach( value => {
              this.historyService.addEntry({time: moment(value.date).unix(), 
                temp: value.temperature_guard});
            });
          }

          // Extract latest sensor data
          const lastMeasurement = measurementArray.slice(-1)[0];
          this.currentDate = lastMeasurement.date;    
          this.currentFlowRate = lastMeasurement.flowrate;
          this.currentPressure = lastMeasurement.pressure;
          this.currentTemperature = lastMeasurement.temperature_guard;
          const valveState = this.currentValveState === OndusSenseGuard.VALVE_OPEN? 'Open': 'Closed';
          this.ondusPlatform.log.info(`[${this.logPrefix}] Date: ${this.currentDate}`);          
          this.ondusPlatform.log.info(`[${this.logPrefix}] => Valve: ${valveState}`);
          this.ondusPlatform.log.info(`[${this.logPrefix}] => Flowrate: ${this.currentFlowRate}`);
          this.ondusPlatform.log.info(`[${this.logPrefix}] => Pressure: ${this.currentPressure} bar`);
          this.ondusPlatform.log.info(`[${this.logPrefix}] => Temperature: ${this.currentTemperature}˚C`);

          // Enable StatusActive characteristics for temperature service
          this.setTemperatureServiceStatusActive(true);
        
          // Resolve promise to handleCurrentTemperatureGet()
          resolve(this.currentTemperature);
        })
        .catch( err => {
          this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to update temperature: ${err}`);
      
          // Disable StatusActive characteristics for temperature service
          this.setTemperatureServiceStatusActive(false);
        
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
            this.setValveServiceActive(true);
            this.setValveServiceInUse(true);
          } else {
            this.ondusPlatform.log.debug(`[${this.logPrefix}] Main water inlet valve is closed`);
            this.setValveServiceInUse(false);
            this.setValveServiceActive(false);
          }

          // Resolve promise to handleActiveGet()
          this.setValveServiceStatusActive(true);
          resolve(this.currentValveState);
        })
        .catch(err => {
          this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to retrieve main water inlet valve state: ${err}`);

          // Resolve promise to handleActiveGet() and return last known valve state
          this.setValveServiceStatusActive(false);
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
      this.setValveServiceActive(true);
    } else {
      this.ondusPlatform.log.warn(`[${this.logPrefix}] Closing main water inlet valve`);
      this.setValveServiceActive(false);
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
            this.setValveServiceInUse(true);
          } else {
            this.ondusPlatform.log.warn(`[${this.logPrefix}] Main water inlet valve has been closed`);
            this.currentValveState = OndusSenseGuard.VALVE_CLOSED;
            this.setValveServiceInUse(false);
          }

          // Resolve promise to handleActiveSet()
          this.setValveServiceStatusActive(true);
          resolve(this.currentValveState);
        })
        .catch(err => {
          //this.ondusPlatform.log.debug('err:', err);
          this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to retrieve valve state: ${err}`);

          // Reject promise to handleActiveSet() and return last known valve state
          this.setValveServiceStatusActive(false);
          reject(this.currentValveState);
        });
    });
  }

}
