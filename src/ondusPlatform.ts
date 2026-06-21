import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { OndusSession } from './ondusSession.js'; // Ondus HTTP library
import { OndusSense } from './ondusSense.js';
import { OndusSensePlus } from './ondusSensePlus.js';
import { OndusSenseGuard } from './ondusSenseGuard.js';
//import { OndusSenseBlue } from './ondusSenseBlue.js';
//import { OndusSenseRed } from './ondusSenseRed.js';

/**
 * Ondus Platform constructor
 */
export class OndusPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public ondusSession: OndusSession;


  /**
    * OndusPlatform constructor
    */
  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {

    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    // Dump config in SHTF mode
    if (this.config['shtf_mode']) {
      const restricted = ['username', 'password', 'refresh_token'];
      this.log.debug('Config settings:');
      for (const key in this.config) {
        let value = this.config[key];
        if (restricted.includes(key)) {
          value = '<hidden>';
        }
        this.log.debug(`\t${key} : ${value}`);
      }
    }

    // Validate config
    if (!this.config['refresh_token'] && (!this.config['username'] || !this.config['password'])) {
      const err = `Must configure either refresh_token, or username and password, in "${this.config.name}" section of config.json`;
      this.log.error(err);
      throw new Error(err);
    } 

    // Instantiate Ondus session for handling HTTP communication with Ondus API
    this.log.info('Initializing Ondus API session');
    this.ondusSession = new OndusSession(this.log, this.config);
    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * Discover and configure all Ondus appliances that have been 
   * registered for this account. 
   */
  async discoverDevices() {

    this.log.debug('Fetching Ondus devices');
 
    // Query Ondus web for devices and dynamically add discovered devices
    await this.ondusSession.login()
      .then(loginStatus => {
        if (loginStatus) {
          this.log.info('Ondus API login() successful');
        } else {
          this.log.error('Ondus API login() failed');
        }
      })
      .catch(err => {
        this.log.error(`Function login() failed: ${err}`);
      });

    if (!this.ondusSession.loggedIn) {
      // No point in continuing if login() failed
      return;
    }
    
    // Dump dashboard info for debugging purpose if SHTF mode is enabled
    if (this.config['shtf_mode']) {
      await this.ondusSession.getDashboard()
        .then(dashboard => {
          const debug = JSON.stringify(dashboard.body, null, ' ');
          this.log.debug(`discoverDevices().getDashboard() API RSP:\n${debug}`);
        });
    }

    let locations;
    try {
      locations = await this.ondusSession.getLocations();
    } catch (err) {
      this.log.error(`Error during locations refresh: ${err}`);
      return;
    }

    for (const location of locations.body) {
      this.log.debug(`Processing locationID=${location.id} (${location.name})`);
      let rooms;
      try {
        rooms = await this.ondusSession.getRooms(location.id);
      } catch (err) {
        this.log.error(`Error during rooms refresh: ${err}`);
        continue;
      }

      for (const room of rooms.body) {
        this.log.debug(`Processing roomID=${room.id} (${room.name})`);
        let appliances;
        try {
          appliances = await this.ondusSession.getAppliances(location.id, room.id);
        } catch (err) {
          this.log.error(`Error during appliances refresh: ${err}`);
          continue;
        }

        for (const appliance of appliances.body) {
          this.log.debug(`Found applianceID=${appliance.appliance_id} name=${appliance.name}`);
          this.registerOndusAppliance(location.id, room.id, appliance);
        }
      }
    }
  }

  
  private registerOndusAppliance(locationID, roomID, applianceInfo) {

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    let accessory = this.accessories.find(accessory => accessory.UUID === applianceInfo.appliance_id);

    if (!accessory) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new Ondus appliance: ${applianceInfo.name}`);

      // create a new accessory
      accessory = new this.api.platformAccessory(applianceInfo.name, applianceInfo.appliance_id);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
    
    // store a copy of the device object in the `accessory.context`
    // the `context` property can be used to store any data about the accessory you may need
    accessory.context.device = applianceInfo; 


    // create the accessory handler for the accessory
    switch(applianceInfo.type) {
      case OndusSense.ONDUS_TYPE:
        this.log.info(`Opening device handler "${OndusSense.ONDUS_NAME}" for "${applianceInfo.name}"`);
        new OndusSense(this, locationID, roomID, accessory).start();
        break;
      case OndusSensePlus.ONDUS_TYPE:
        this.log.info(`Opening device handler "${OndusSensePlus.ONDUS_NAME}" for "${applianceInfo.name}"`);
        new OndusSensePlus(this, locationID, roomID, accessory).start();
        break;
      case OndusSenseGuard.ONDUS_TYPE:
        this.log.info(`Opening device handler "${OndusSenseGuard.ONDUS_NAME}" for "${applianceInfo.name}"`);
        new OndusSenseGuard(this, locationID, roomID, accessory).start();
        break;
      /*  
      case OndusSenseBlue.ONDUS_TYPE:
        this.log.info(`Opening device handler "${OndusSenseBlue.ONDUS_NAME}" for "${applianceInfo.name}"`);
        new OndusSenseBlue(this, locationID, roomID, accessory).start();
        break;
      case OndusSenseRed.ONDUS_TYPE:
        this.log.info(`Opening device handler "${OndusSenseRed.ONDUS_NAME}" for "${applianceInfo.name}"`);
        new OndusSenseRed(this, locationID, roomID, accessory).start();
        break;
      */
      default:
        this.log.warn(`Unsupported Ondus appliance type encountered: ${applianceInfo.type} - ignoring`);
        this.logUnsupportedAppliance(locationID, roomID, applianceInfo)
          .catch(err => this.log.debug(`Failed to gather diagnostics for unsupported appliance: ${err}`));
        return;
    }
  }

  /**
   * Gather and log the raw Ondus API payloads for an appliance type this plugin
   * does not yet support (e.g. GROHE Blue/Red). The output is intended to be
   * copied verbatim into a GitHub issue so support can be implemented without
   * the maintainer needing physical access to the device.
   */
  private async logUnsupportedAppliance(locationID, roomID, applianceInfo) {
    const applianceID = applianceInfo.appliance_id;
    this.log.warn('==================== UNSUPPORTED GROHE APPLIANCE ====================');
    this.log.warn(`Please share the following with a GitHub issue at ${PLUGIN_NAME} to help add support:`);
    this.log.warn('https://github.com/faune/homebridge-grohe-sense/issues/new');
    this.log.warn(`appliance (from getAppliances):\n${JSON.stringify(applianceInfo, null, 2)}`);

    const dumps: [string, Promise<{ body: unknown }>][] = [
      ['getApplianceInfo', this.ondusSession.getApplianceInfo(locationID, roomID, applianceID)],
      ['getApplianceStatus', this.ondusSession.getApplianceStatus(locationID, roomID, applianceID)],
      ['getApplianceCommand', this.ondusSession.getApplianceCommand(locationID, roomID, applianceID)],
      ['getApplianceNotifications', this.ondusSession.getApplianceNotifications(locationID, roomID, applianceID)],
    ];

    for (const [label, request] of dumps) {
      try {
        const response = await request;
        this.log.warn(`${label}:\n${JSON.stringify(response.body, null, 2)}`);
      } catch (err) {
        this.log.warn(`${label}: failed to retrieve (${err})`);
      }
    }
    this.log.warn('=====================================================================');
  }
}
