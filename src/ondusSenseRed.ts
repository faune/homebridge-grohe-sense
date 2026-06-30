import { PlatformAccessory, Service, CharacteristicValue } from 'homebridge';

import { OndusAppliance } from './ondusAppliance.js';
import { OndusPlatform } from './ondusPlatform.js';


/**
 * Grohe Red Accessory in the Ondus platform for instant boiling / hot drinking water.
 *
 * ============================ EXPERIMENTAL / UNTESTED ============================
 * There are currently no real Grohe Red API logs available, and no community
 * project (Home Assistant, ioBroker, grohe-ondus-api-java) implements Red. As a
 * result BOTH the appliance type id used below AND the dispense command shape are
 * best-effort guesses modelled on the Grohe Blue. This handler is intentionally
 * minimal and isolated so it cannot disrupt the Sense / Guard / Blue handlers.
 *
 * If 106 turns out not to be the Red type id, no appliance will match this case
 * and it falls through to the existing unsupported-appliance diagnostic logger.
 *
 * Owners of a Grohe Red: please share the debug logs via a GitHub issue so this
 * can be implemented and verified properly.
 * ================================================================================
 *
 * This accessory exposes the following services:
 * - Switch           - momentary "dispense hot water" button
 * - FilterMaintenance - remaining water filter level (%)
 */

enum TapType {
  // NOTE: unconfirmed - mirrors the Blue command structure.
  HOT = 1,
}

export class OndusSenseRed extends OndusAppliance {
  // UNCONFIRMED appliance type id - 101/102/103 are Sense/Plus/Guard and
  // 104/105 are Blue Home/Professional, so Red is assumed to be the next id.
  static ONDUS_TYPE = 106;
  static ONDUS_NAME = 'Red (experimental)';

  // Default dispense amount (ml) if none is configured
  static DEFAULT_AMOUNT_ML = 250;
  // How long a dispense button stays "on" before it resets itself
  static SWITCH_RESET_MS = 1500;

  // Red services
  private hotService: Service;
  private filterService: Service;

  // Ensures the verbose startup diagnostic is only emitted once per process
  private diagnosticsLogged = false;

  /**
   * Ondus Sense Red constructor for hot / boiling tap water
   */
  constructor(
    public ondusPlatform: OndusPlatform,
    public locationID: number,
    public roomID: number,
    public accessory: PlatformAccessory,
  ) {
    // Call parent constructor
    super(ondusPlatform, locationID, roomID, accessory);

    // eslint-disable-next-line max-len
    this.ondusPlatform.log.warn(`[${this.logPrefix}] Grohe Red support is EXPERIMENTAL and UNTESTED - please share debug logs at https://github.com/faune/homebridge-grohe-sense/issues to help verify it`);

    // The Red is not a leak/temperature sensor, so drop the common services the
    // base class added for the Sense/Guard appliances.
    if (this.leakService) {
      this.accessory.removeService(this.leakService);
    }
    if (this.temperatureService) {
      this.accessory.removeService(this.temperatureService);
    }

    const deviceName = accessory.context.device.name;

    /**
     * Dispense Switch service (momentary "hot water" button)
     */
    const switchSubType = 'tap-hot';
    this.hotService = this.accessory.getServiceById(this.ondusPlatform.Service.Switch, switchSubType) ||
      this.accessory.addService(this.ondusPlatform.Service.Switch, `${deviceName} Hot Water`, switchSubType);
    this.hotService
      .setCharacteristic(this.ondusPlatform.Characteristic.Name, `${deviceName} Hot Water`)
      .setCharacteristic(this.ondusPlatform.Characteristic.On, false);
    this.hotService.getCharacteristic(this.ondusPlatform.Characteristic.On)
      .onGet(() => false)
      .onSet((value: CharacteristicValue) => this.handleDispenseSet(this.hotService, TapType.HOT, value));

    this.hotService.setPrimaryService(true);
    this.accessory.category = this.ondusPlatform.api.hap.Categories.FAUCET;

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
   * Schedule periodic refreshes so the filter level stays current in HomeKit.
   */
  start(): void {
    // Dump the raw dashboard payload once at startup when shtf_mode is enabled,
    // so Red issues can be diagnosed without code changes or extra restarts.
    void this.logDiagnostics().catch(() => { /* errors logged in logDiagnostics */ });

    void this.getMeasurements().catch(() => { /* errors logged in getMeasurements */ });
    setInterval(() => {
      void this.getMeasurements().catch(() => { /* errors logged in getMeasurements */ });
    }, this.getRefreshIntervalMs());
  }

  /**
   * Dump this appliance's dashboard object once, gated behind shtf_mode, to help
   * diagnose Red issues (Red is experimental, so real logs are especially
   * valuable). The dashboard is where the Blue/Red data_latest.measurement block
   * lives - the per-appliance endpoint omits it.
   */
  private async logDiagnostics(): Promise<void> {
    if (!this.ondusPlatform.config['shtf_mode'] || this.diagnosticsLogged) {
      return;
    }
    this.diagnosticsLogged = true;

    this.ondusPlatform.log.info(`[${this.logPrefix}] ===== GROHE RED DIAGNOSTIC (please include when reporting Red issues) =====`);
    try {
      const dashboard = await this.ondusPlatform.ondusSession.getDashboard();
      const appliance = this.findApplianceInDashboard(dashboard.body) ?? '<appliance not found in dashboard>';
      // eslint-disable-next-line max-len
      this.ondusPlatform.log.info(`[${this.logPrefix}] dashboard appliance (HTTP ${dashboard.status}):\n${JSON.stringify(appliance, null, 2)}`);
    } catch (err) {
      this.ondusPlatform.log.info(`[${this.logPrefix}] dashboard: failed to retrieve (${err})`);
    }
    this.ondusPlatform.log.info(`[${this.logPrefix}] ============================================================================`);
  }

  // ---- HELPER FUNCTIONS BELOW ----

  private getDispenseAmountMl(): number {
    const raw = this.ondusPlatform.config['red_amount_ml'] ?? this.ondusPlatform.config['blue_amount_ml'];
    let ml = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw);
    if (!Number.isFinite(ml) || ml <= 0) {
      ml = OndusSenseRed.DEFAULT_AMOUNT_ML;
    }
    return Math.min(2000, Math.max(50, Math.round(ml)));
  }

  // ---- HTTP HANDLER FUNCTIONS BELOW ----

  private handleDispenseSet(service: Service, tapType: TapType, value: CharacteristicValue): void {
    if (value !== true) {
      return;
    }

    // Reset the switch back to off so it behaves like a momentary button
    setTimeout(() => {
      service.updateCharacteristic(this.ondusPlatform.Characteristic.On, false);
    }, OndusSenseRed.SWITCH_RESET_MS);

    // Gated behind the same control flag as the Blue; defaults to enabled
    if (this.ondusPlatform.config['blue_control'] === false) {
      // eslint-disable-next-line max-len
      this.ondusPlatform.log.warn(`[${this.logPrefix}] Ignoring dispense request - enable "blue_control" in the plugin settings to dispense water from HomeKit`);
      return;
    }

    void this.dispense(tapType).catch(() => { /* errors logged in dispense */ });
  }

  // ---- ONDUS API FUNCTIONS BELOW ----

  /**
   * Dispense hot water. UNCONFIRMED command shape - modelled on the Grohe Blue.
   */
  private async dispense(tapType: TapType): Promise<void> {
    const tapAmount = this.getDispenseAmountMl();
    this.ondusPlatform.log.info(`[${this.logPrefix}] Dispensing ${tapAmount}ml of hot water (experimental)`);

    const data = {
      'type': this.accessory.context.device.type,
      'command': {
        'tap_type': tapType,
        'get_current_measurement': true,
        'tap_amount': tapAmount,
      },
    };

    this.ondusPlatform.log.debug(`[${this.logPrefix}] Dispense request: ${JSON.stringify(data)}`);
    try {
      const response = await this.setApplianceCommand(data);
      this.ondusPlatform.log.debug(`[${this.logPrefix}] Dispense response (HTTP ${response.status}): ${JSON.stringify(response.body)}`);
    } catch (err) {
      this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to dispense hot water: ${err}`);
      throw err;
    }
  }

  /**
   * Fetch the latest filter level and push it to HomeKit. UNCONFIRMED data
   * shape - modelled on the Grohe Blue, whose data_latest.measurement block is
   * only returned by the dashboard endpoint (not the per-appliance endpoint).
   */
  async getMeasurements(): Promise<void> {
    this.ondusPlatform.log.debug(`[${this.logPrefix}] Updating filter level (experimental)`);

    try {
      const dashboard = await this.ondusPlatform.ondusSession.getDashboard();

      if (this.ondusPlatform.config['shtf_mode']) {
        const debug = JSON.stringify(dashboard.body);
        this.ondusPlatform.log.debug(`[${this.logPrefix}] getMeasurements().getDashboard() API RSP:\n"${debug}"`);
      }

      const appliance = this.findApplianceInDashboard(dashboard.body);
      if (!appliance) {
        this.ondusPlatform.log.warn(`[${this.logPrefix}] Appliance not found in dashboard - filter level not updated`);
        return;
      }

      const measurement = appliance.data_latest?.measurement;
      const state = appliance.state;

      if (measurement && typeof measurement.remaining_filter === 'number') {
        this.setFilterLife(measurement.remaining_filter);
        // eslint-disable-next-line max-len
        this.ondusPlatform.log.info(`[${this.logPrefix}] => Filter: ${measurement.remaining_filter}% (${measurement.remaining_filter_liters}L)`);
      }
      if (state) {
        this.setFilterChange(state.filter_empty === true || state.filter_20l_reached === true);
      }
    } catch (err) {
      this.ondusPlatform.log.error(`[${this.logPrefix}] Unable to update filter level: ${err}`);
      throw err;
    }
  }

  /**
   * Locate this appliance within a dashboard response by walking
   * locations -> rooms -> appliances and matching on appliance_id.
   */
  private findApplianceInDashboard(body: any): any | undefined {
    const locations = body?.locations;
    if (!Array.isArray(locations)) {
      return undefined;
    }
    for (const location of locations) {
      if (!Array.isArray(location?.rooms)) {
        continue;
      }
      for (const room of location.rooms) {
        if (!Array.isArray(room?.appliances)) {
          continue;
        }
        const match = room.appliances.find(a => a?.appliance_id === this.getApplianceID());
        if (match) {
          return match;
        }
      }
    }
    return undefined;
  }

  // ---- CHARACTERISTICS HANDLER FUNCTIONS BELOW ----

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
