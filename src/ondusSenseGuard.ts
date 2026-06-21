import moment from 'moment';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { OndusPlatform } from './ondusPlatform.js';
import { OndusAppliance } from './ondusAppliance.js';


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
  // Optional companion switch so the valve can be used in Home app automations
  switchService?: Service;

  // Extended sensor data properties
  private currentValveState: boolean = OndusSenseGuard.VALVE_OPEN || OndusSenseGuard.VALVE_CLOSED;
  private currentFlowRate: number;
  private currentPressure: number;

  // De-duplicates concurrent valve state refreshes triggered by HomeKit polling
  private valveStateInFlight?: Promise<boolean>;
  // After a command, ignore (potentially stale) API reads until the cloud catches up
  private suppressValveRefreshUntil = 0;
 
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
     * Active=0, InUse=0 -> Closed
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
      .onGet(this.handleValveServiceActiveGet.bind(this))
      .onSet(this.handleValveServiceActiveSet.bind(this));

    // Present the Guard primarily as a controllable valve. This accessory also
    // exposes leak/temperature sensors, so without designating a primary service
    // and category the Home app may classify the whole accessory as a sensor.
    this.valveService.setPrimaryService(true);
    this.accessory.category = this.ondusPlatform.api.hap.Categories.FAUCET;

    /**
     * Optional companion Switch service
     *
     * Apple's Home app does not expose Valve services to its automation engine
     * (they can be controlled manually but are not selectable as automation
     * actions or triggers). Whenever valve control is enabled we therefore also
     * expose a Switch that mirrors the valve (On = open) and drives the same
     * command, so the valve can be used in Home app automations such as
     * "turn water off when last to leave". The switch is implicit with
     * valve_control - without valve control there is nothing to automate.
     */
    const switchSubType = 'valve-control-switch';
    if (this.ondusPlatform.config['valve_control']) {
      const switchName = `${accessory.context.device.name} Water`;
      this.switchService = this.accessory.getServiceById(this.ondusPlatform.Service.Switch, switchSubType) ||
        this.accessory.addService(this.ondusPlatform.Service.Switch, switchName, switchSubType);
      this.switchService.setCharacteristic(this.ondusPlatform.Characteristic.Name, switchName);
      this.switchService.getCharacteristic(this.ondusPlatform.Characteristic.On)
        .onGet(this.handleValveSwitchGet.bind(this))
        .onSet(this.handleValveSwitchSet.bind(this));
    } else {
      // Remove a previously created companion switch if the option was disabled
      const staleSwitch = this.accessory.getServiceById(this.ondusPlatform.Service.Switch, switchSubType);
      if (staleSwitch) {
        this.accessory.removeService(staleSwitch);
      }
    }
  }


  start() {
    if (this.historyService) {
      this.getHistoricalMeasurements();
    } else {
      void this.getLastMeasurements().catch(() => { /* errors logged in getLastMeasurements */ });
    }

    // Always fetch the current valve state at startup so HomeKit reflects it
    // (this previously never ran when Eve history support was enabled)
    void this.getValveState().catch(() => { /* errors logged in getValveState */ });

    // Periodically refresh the valve state so changes made outside HomeKit
    // (e.g. the Grohe app) eventually propagate to the Home app
    setInterval(() => {
      void this.getValveState().catch(() => { /* errors logged in getValveState */ });
    }, this.getRefreshIntervalMs());

    // Poll notifications so LeakDetected changes are pushed to HomeKit automations
    this.startLeakNotificationPolling();
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

  /**
   * Push a single valve state to every HomeKit representation at once: the
   * Valve service (Active + InUse) and the optional companion Switch. InUse is
   * kept identical to Active because a main shut-off valve has no meaningful
   * "open but not flowing" state - decoupling them is what makes the Home app
   * render a permanent "Waiting..." animation.
   */
  private applyValveState(open: boolean) {
    this.setValveServiceActive(open);
    this.setValveServiceInUse(open);
    this.setValveSwitchOn(open);
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
  async handleCurrentTemperatureGet(): Promise<CharacteristicValue> {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET CurrentTemperature`);
    try {
      await this.getLastMeasurements();
    } catch {
      throw new this.ondusPlatform.api.hap.HapStatusError(this.ondusPlatform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    return this.currentTemperature;
  }

  /**
   * Handle requests to get the current value of the "Active" characteristic.
   *
   * Returns the last known state immediately to avoid blocking HomeKit on a
   * network round-trip (which caused UI lag and, right after a command, stale
   * reads that reverted the valve). A background refresh pushes any updated
   * state via updateCharacteristic when it arrives.
   */
  handleValveServiceActiveGet(): CharacteristicValue {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET Active (cached=${this.currentValveState})`);
    void this.getValveState().catch(() => { /* errors logged in getValveState */ });
    return this.currentValveState;
  }

  /**
   * Handle requests to set the "Active" characteristic.
   *
   * Returns immediately so the Home app does not display a "Waiting..." spinner
   * for the whole (potentially many-second) Ondus valve actuation + cloud round
   * trip. The optimistic UI update happens synchronously inside setValveState
   * and the command is fired in the background, reverting on failure.
   */
  handleValveServiceActiveSet(value: CharacteristicValue): void {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered SET Active: ${value}`);

    if (!this.ondusPlatform.config['valve_control']) {
      // eslint-disable-next-line max-len
      this.ondusPlatform.log.warn(`[${this.logPrefix}] If you really, really, REALLY want to control your main water inlet valve through HomeKit, please enable this feature in the plugin settings`);
      // Snap the tile back to the actual state immediately instead of leaving it
      // stuck on "Waiting..." while a network read completes.
      this.applyValveState(this.currentValveState);
      return;
    }

    // Fire-and-forget: setValveState updates the UI optimistically and reverts
    // every representation itself if the command ultimately fails.
    void this.setValveState(value === 1).catch(() => { /* reverted inside setValveState */ });
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
  handleInUseGet(): CharacteristicValue {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET InUse`);
    return this.currentFlowRate > 0 ? this.ondusPlatform.Characteristic.InUse.IN_USE :
      this.ondusPlatform.Characteristic.InUse.NOT_IN_USE;
  }

  /**
   * Handle requests to get the current value of the companion Switch "On"
   * characteristic. On reflects the valve being open.
   */
  handleValveSwitchGet(): CharacteristicValue {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered GET Valve Switch On (cached=${this.currentValveState})`);
    void this.getValveState().catch(() => { /* errors logged in getValveState */ });
    return this.currentValveState;
  }

  /**
   * Handle requests to set the companion Switch "On" characteristic. The switch
   * only exists when valve_control is enabled, so it always drives the valve.
   *
   * Returns immediately (fire-and-forget) for the same reason as the valve's
   * Active setter - awaiting the slow Ondus command makes the Home app spin.
   */
  handleValveSwitchSet(value: CharacteristicValue): void {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Triggered SET Valve Switch On: ${value}`);
    void this.setValveState(value === true).catch(() => { /* reverted inside setValveState */ });
  }

  /**
   * Keep the optional companion Switch in sync with the actual valve state
   */
  setValveSwitchOn(on: boolean) {
    if (this.switchService) {
      this.switchService.updateCharacteristic(this.ondusPlatform.Characteristic.On, on);
    }
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
          const measurementArray = measurement.body.data?.measurement;
          if (!Array.isArray(measurementArray)) {
            this.ondusPlatform.log.debug(`[${this.logPrefix}] Unknown response ${JSON.stringify(measurement.body)}`);
            this.setTemperatureServiceStatusActive(false);
            reject(new Error('No measurement array in API response'));
            return;
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

          if (measurementArray.length === 0) {
            this.setTemperatureServiceStatusActive(false);
            reject(new Error('Empty measurement array'));
            return;
          }

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
  getValveState(): Promise<boolean> {
    // Coalesce concurrent refreshes (HomeKit may poll Active and the Switch at
    // the same time) into a single API request.
    if (this.valveStateInFlight) {
      return this.valveStateInFlight;
    }

    this.ondusPlatform.log.debug(`[${this.logPrefix}] Retrieving main water inlet valve state`);
    this.valveStateInFlight = new Promise<boolean>((resolve, reject) => {
      this.getApplianceCommand()
        .then(res => {
          this.valveStateInFlight = undefined;

          // Ignore reads that may not yet reflect a command we just sent, since
          // the Ondus cloud can briefly keep reporting the previous valve state.
          if (Date.now() < this.suppressValveRefreshUntil) {
            this.ondusPlatform.log.debug(`[${this.logPrefix}] Ignoring valve state read during command settle window`);
            this.setValveServiceStatusActive(true);
            resolve(this.currentValveState);
            return;
          }

          this.currentValveState = res.body.command.valve_open;
          this.ondusPlatform.log.debug(`[${this.logPrefix}] Main water inlet valve is ${this.currentValveState ? 'open' : 'closed'}`);
          this.applyValveState(this.currentValveState);

          // Resolve promise to handleActiveGet()
          this.setValveServiceStatusActive(true);
          resolve(this.currentValveState);
        })
        .catch(err => {
          this.valveStateInFlight = undefined;
          this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to retrieve main water inlet valve state: ${err}`);

          // Resolve promise to handleActiveGet() and return last known valve state
          this.setValveServiceStatusActive(false);
          reject(this.currentValveState);
        });
    });
    return this.valveStateInFlight;
  }

  /**
   * Control the Ondus Sense Guard valve. Returns a promise that will be resolved
   * once valve state has been configured through Ondus API.
   *  
   * @param valveState true if valve is to be opened, false if valve is to be closed
   */
  setValveState(valveState: boolean): Promise<boolean> {
    const previousState = this.currentValveState;
    this.ondusPlatform.log.warn(`[${this.logPrefix}] ${valveState ? 'Opening' : 'Closing'} main water inlet valve`);

    // Optimistically reflect the requested state across the Valve and Switch
    // immediately so both tiles update in sync without lag or a "Waiting..."
    // animation. Suppress background reads briefly so a not-yet-propagated cloud
    // state cannot revert this before the command takes effect.
    this.currentValveState = valveState;
    this.suppressValveRefreshUntil = Date.now() + 15000;
    this.applyValveState(valveState);

    // Construct payload for controlling valve state
    const data = {'type': OndusSenseGuard.ONDUS_TYPE, 'command' : { 'valve_open': valveState } };

    return new Promise<boolean>((resolve, reject) => {
      this.setApplianceCommand(data)
        .then(() => {
          // The Ondus API does not reliably echo the updated valve_open state in
          // the command response, so trust the state we just commanded.
          this.ondusPlatform.log.warn(`[${this.logPrefix}] Main water inlet valve has been ${valveState ? 'opened' : 'closed'}`);
          this.currentValveState = valveState;
          this.applyValveState(valveState);
          this.setValveServiceStatusActive(true);
          resolve(valveState);
        })
        .catch(err => {
          this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to set main water inlet valve state: ${err}`);

          // Command failed - revert the optimistic update on every representation
          this.suppressValveRefreshUntil = 0;
          this.currentValveState = previousState;
          this.applyValveState(previousState);
          this.setValveServiceStatusActive(false);
          reject(previousState);
        });
    });
  }

}
