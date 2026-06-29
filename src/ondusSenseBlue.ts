import { PlatformAccessory, Service, CharacteristicValue } from 'homebridge';

import { OndusAppliance } from './ondusAppliance.js';
import { OndusPlatform } from './ondusPlatform.js';


/**
 * Grohe Blue Accessory in the Ondus platform for filtered / carbonated drinking water.
 *
 * Covers both Blue Home (type 104) and Blue Professional (type 105).
 *
 * This accessory exposes the following services:
 * - Switch x3 (Still / Medium / Carbonated) - momentary "dispense" buttons
 * - Battery          - remaining CO2 level (%)
 * - FilterMaintenance - remaining water filter level (%)
 *
 * Dispensing works by POSTing a one-shot command containing a tap_type and a
 * tap_amount (in ml). The appliance pours the requested amount and stops on its
 * own; there is no separate "stop" command (a tap_type of 0 does NOT stop the
 * flow), which is why the dispense buttons are modelled as momentary switches.
 */

enum TapType {
  STILL = 1,
  MEDIUM = 2,
  CARBONATED = 3,
}

export class OndusSenseBlue extends OndusAppliance {
  static ONDUS_TYPE = 104;     // Blue Home
  static ONDUS_TYPE_PRO = 105; // Blue Professional
  static ONDUS_NAME = 'Blue';

  // Default dispense amount (ml) if none is configured
  static DEFAULT_AMOUNT_ML = 250;
  // How long a dispense button stays "on" before it resets itself
  static SWITCH_RESET_MS = 1500;

  // Blue services
  private stillService: Service;
  private mediumService: Service;
  private carbonatedService: Service;
  private co2Service: Service;
  private filterService: Service;

  // Ensures the verbose startup diagnostic is only emitted once per process
  private diagnosticsLogged = false;

  /**
   * Ondus Sense Blue constructor for filtered / carbonated tap water
   */
  constructor(
    public ondusPlatform: OndusPlatform,
    public locationID: number,
    public roomID: number,
    public accessory: PlatformAccessory,
  ) {
    // Call parent constructor
    super(ondusPlatform, locationID, roomID, accessory);

    // The Blue is not a leak/temperature sensor, so drop the common services
    // the base class added for the Sense/Guard appliances.
    if (this.leakService) {
      this.accessory.removeService(this.leakService);
    }
    if (this.temperatureService) {
      this.accessory.removeService(this.temperatureService);
    }

    const deviceName = accessory.context.device.name;

    /**
     * Dispense Switch services (Still / Medium / Carbonated)
     *
     * Modelled as momentary switches: turning one on triggers a dispense and the
     * switch automatically resets to off shortly after.
     */
    this.stillService = this.getOrAddSwitch('tap-still', `${deviceName} Still`);
    this.mediumService = this.getOrAddSwitch('tap-medium', `${deviceName} Medium`);
    this.carbonatedService = this.getOrAddSwitch('tap-carbonated', `${deviceName} Sparkling`);

    this.registerSwitchHandlers(this.stillService, TapType.STILL);
    this.registerSwitchHandlers(this.mediumService, TapType.MEDIUM);
    this.registerSwitchHandlers(this.carbonatedService, TapType.CARBONATED);

    // Present the appliance primarily as a (still water) tap
    this.stillService.setPrimaryService(true);
    this.accessory.category = this.ondusPlatform.api.hap.Categories.FAUCET;

    /**
     * CO2 level - exposed as a Battery service so HomeKit shows a level (%) and
     * a low-level warning when the CO2 cylinder is nearly empty.
     */
    this.co2Service = this.accessory.getService(this.ondusPlatform.Service.Battery) ||
      this.accessory.addService(this.ondusPlatform.Service.Battery);
    this.co2Service
      .setCharacteristic(this.ondusPlatform.Characteristic.Name, `${deviceName} CO2`)
      .setCharacteristic(this.ondusPlatform.Characteristic.ChargingState,
        this.ondusPlatform.Characteristic.ChargingState.NOT_CHARGEABLE)
      .setCharacteristic(this.ondusPlatform.Characteristic.StatusLowBattery,
        this.ondusPlatform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
      .setCharacteristic(this.ondusPlatform.Characteristic.BatteryLevel, 100);

    /**
     * Water filter level - exposed as a FilterMaintenance service
     */
    this.filterService = this.accessory.getService(this.ondusPlatform.Service.FilterMaintenance) ||
      this.accessory.addService(this.ondusPlatform.Service.FilterMaintenance);
    this.filterService
      .setCharacteristic(this.ondusPlatform.Characteristic.Name, `${deviceName} Filter`)
      .setCharacteristic(this.ondusPlatform.Characteristic.FilterChangeIndication,
        this.ondusPlatform.Characteristic.FilterChangeIndication.FILTER_OK)
      .setCharacteristic(this.ondusPlatform.Characteristic.FilterLifeLevel, 100);
  }

  /**
   * Kick off the initial measurement read and schedule periodic refreshes so the
   * CO2 / filter levels stay current in HomeKit.
   */
  start(): void {
    // Grohe Blue support is still being validated against real devices, so dump
    // the raw API payloads once at startup. This lets owners attach a single log
    // to a bug report without having to enable SHTF mode or restart repeatedly.
    void this.logDiagnostics().catch(() => { /* errors logged in logDiagnostics */ });

    void this.getMeasurements().catch(() => { /* errors logged in getMeasurements */ });
    setInterval(() => {
      void this.getMeasurements().catch(() => { /* errors logged in getMeasurements */ });
    }, this.getRefreshIntervalMs());
  }

  /**
   * Dump the raw appliance info once to confirm where the Blue exposes its
   * CO2 / filter levels. Logged at info level because Blue support is new.
   *
   * Do NOT probe the .../command endpoint here: it is Sense Guard specific and
   * returns 403 Forbidden for a Blue, which leaks an unhandled rejection out of
   * superagent-throttle and crashes the bridge. getApplianceInfo() already has
   * the config / state / data_latest.measurement blocks we need.
   */
  private async logDiagnostics(): Promise<void> {
    if (this.diagnosticsLogged) {
      return;
    }
    this.diagnosticsLogged = true;

    this.ondusPlatform.log.info(`[${this.logPrefix}] ===== GROHE BLUE DIAGNOSTIC (please include when reporting Blue issues) =====`);
    try {
      const response = await this.getApplianceInfo();
      // eslint-disable-next-line max-len
      this.ondusPlatform.log.info(`[${this.logPrefix}] getApplianceInfo (HTTP ${response.status}):\n${JSON.stringify(response.body, null, 2)}`);
    } catch (err) {
      this.ondusPlatform.log.info(`[${this.logPrefix}] getApplianceInfo: failed to retrieve (${err})`);
    }
    this.ondusPlatform.log.info(`[${this.logPrefix}] ============================================================================`);
  }

  // ---- HELPER FUNCTIONS BELOW ----

  private getOrAddSwitch(subType: string, name: string): Service {
    const service = this.accessory.getServiceById(this.ondusPlatform.Service.Switch, subType) ||
      this.accessory.addService(this.ondusPlatform.Service.Switch, name, subType);
    service
      .setCharacteristic(this.ondusPlatform.Characteristic.Name, name)
      .setCharacteristic(this.ondusPlatform.Characteristic.On, false);
    return service;
  }

  private registerSwitchHandlers(service: Service, tapType: TapType): void {
    service.getCharacteristic(this.ondusPlatform.Characteristic.On)
      // Momentary switch: always reports "off"
      .onGet(() => false)
      .onSet((value: CharacteristicValue) => this.handleDispenseSet(service, tapType, value));
  }

  /**
   * Resolve the configured dispense amount (ml), clamped to a sane range.
   */
  private getDispenseAmountMl(): number {
    const raw = this.ondusPlatform.config['blue_amount_ml'];
    let ml = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw);
    if (!Number.isFinite(ml) || ml <= 0) {
      ml = OndusSenseBlue.DEFAULT_AMOUNT_ML;
    }
    return Math.min(2000, Math.max(50, Math.round(ml)));
  }

  // ---- HTTP HANDLER FUNCTIONS BELOW ----

  /**
   * Handle a press on one of the dispense switches. Fires the dispense command
   * (when blue_control is enabled) and resets the switch back to off shortly
   * after so it behaves like a momentary button.
   */
  private handleDispenseSet(service: Service, tapType: TapType, value: CharacteristicValue): void {
    // Ignore the implicit "off" we push ourselves when resetting the switch
    if (value !== true) {
      return;
    }

    // Reset the switch back to off so it behaves like a momentary button
    setTimeout(() => {
      service.updateCharacteristic(this.ondusPlatform.Characteristic.On, false);
    }, OndusSenseBlue.SWITCH_RESET_MS);

    // blue_control defaults to enabled; only an explicit false disables dispensing
    if (this.ondusPlatform.config['blue_control'] === false) {
      // eslint-disable-next-line max-len
      this.ondusPlatform.log.warn(`[${this.logPrefix}] Ignoring dispense request - enable "blue_control" in the plugin settings to dispense water from HomeKit`);
      return;
    }

    void this.dispense(tapType).catch(() => { /* errors logged in dispense */ });
  }

  // ---- ONDUS API FUNCTIONS BELOW ----

  /**
   * Dispense water of the given tap type. The appliance pours tap_amount (ml)
   * and then stops by itself.
   */
  private async dispense(tapType: TapType): Promise<void> {
    const tapAmount = this.getDispenseAmountMl();
    const typeName = TapType[tapType];
    this.ondusPlatform.log.info(`[${this.logPrefix}] Dispensing ${tapAmount}ml of ${typeName.toLowerCase()} water`);

    // Body shape mirrors what the Grohe Ondus app sends (status / data_latest
    // are intentionally omitted, as the app strips them before posting).
    const data = {
      'type': this.accessory.context.device.type,
      'command': {
        'co2_status_reset': false,
        'tap_type': tapType,
        'cleaning_mode': false,
        'filter_status_reset': false,
        'get_current_measurement': true,
        'tap_amount': tapAmount,
        'factory_reset': false,
        'revoke_flush_confirmation': false,
        'exec_auto_flush': false,
      },
    };

    this.ondusPlatform.log.debug(`[${this.logPrefix}] Dispense request: ${JSON.stringify(data)}`);
    try {
      const response = await this.setApplianceCommand(data);
      // Log the API response so a silently-rejected dispense is visible without
      // requiring shtf_mode (the appliance often echoes its command/state back).
      this.ondusPlatform.log.info(`[${this.logPrefix}] Dispense response (HTTP ${response.status}): ${JSON.stringify(response.body)}`);
    } catch (err) {
      this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to dispense water: ${err}`);
      throw err;
    }
  }

  /**
   * Fetch the latest CO2 / filter consumable levels and push them to HomeKit.
   *
   * The consumable levels live in the appliance's data_latest.measurement block;
   * the coarse low/empty flags live in the appliance state block.
   */
  async getMeasurements(): Promise<void> {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Updating CO2 and filter levels`);

    try {
      const info = await this.getApplianceInfo();

      // Dump server response for debugging purpose if SHTF mode is enabled
      if (this.ondusPlatform.config['shtf_mode']) {
        const debug = JSON.stringify(info.body);
        this.ondusPlatform.log.debug(`[${this.logPrefix}] getMeasurements().getApplianceInfo() API RSP:\n"${debug}"`);
      }

      const appliance = Array.isArray(info.body) ? info.body[0] : info.body;
      const measurement = appliance?.data_latest?.measurement;
      const state = appliance?.state;

      if (measurement) {
        if (typeof measurement.remaining_co2 === 'number') {
          this.setCo2Level(measurement.remaining_co2);
        }
        if (typeof measurement.remaining_filter === 'number') {
          this.setFilterLife(measurement.remaining_filter);
        }
        this.ondusPlatform.log.info(
          // eslint-disable-next-line max-len
          `[${this.logPrefix}] => CO2: ${measurement.remaining_co2}% (${measurement.remaining_co2_liters}L), Filter: ${measurement.remaining_filter}% (${measurement.remaining_filter_liters}L)`);
      } else {
        // Escalate to a warning (with the keys we *did* get) so we can tell from
        // a user's normal log whether the levels live somewhere else entirely.
        const keys = appliance && typeof appliance === 'object' ? Object.keys(appliance).join(', ') : 'none';
        // eslint-disable-next-line max-len
        this.ondusPlatform.log.warn(`[${this.logPrefix}] No data_latest.measurement in appliance info - CO2/filter levels not updated. Available keys: [${keys}]. Please report this (see the GROHE BLUE DIAGNOSTIC dump at startup).`);
      }

      if (state) {
        this.setCo2Low(state.co2_empty === true || state.co2_20l_reached === true);
        this.setFilterChange(state.filter_empty === true || state.filter_20l_reached === true);
        if (state.cleaning_needed === true) {
          this.ondusPlatform.log.warn(`[${this.logPrefix}] Cleaning is needed`);
        }
      }
    } catch (err) {
      this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to update CO2 and filter levels: ${err}`);
      throw err;
    }
  }

  // ---- CHARACTERISTICS HANDLER FUNCTIONS BELOW ----

  private setCo2Level(percent: number): void {
    const level = Math.min(100, Math.max(0, Math.round(percent)));
    this.co2Service.updateCharacteristic(this.ondusPlatform.Characteristic.BatteryLevel, level);
  }

  private setCo2Low(low: boolean): void {
    this.co2Service.updateCharacteristic(this.ondusPlatform.Characteristic.StatusLowBattery,
      low
        ? this.ondusPlatform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
        : this.ondusPlatform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
  }

  private setFilterLife(percent: number): void {
    const level = Math.min(100, Math.max(0, Math.round(percent)));
    this.filterService.updateCharacteristic(this.ondusPlatform.Characteristic.FilterLifeLevel, level);
  }

  private setFilterChange(change: boolean): void {
    this.filterService.updateCharacteristic(this.ondusPlatform.Characteristic.FilterChangeIndication,
      change
        ? this.ondusPlatform.Characteristic.FilterChangeIndication.CHANGE_FILTER
        : this.ondusPlatform.Characteristic.FilterChangeIndication.FILTER_OK);
  }
}
