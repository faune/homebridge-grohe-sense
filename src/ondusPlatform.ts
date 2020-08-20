import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { OndusSense } from './ondusSense';
import { OndusSensePlus } from './ondusSensePlus';
import { OndusSenseGuard } from './ondusSenseGuard';


// Ondus HTTP library
import { OndusSession } from './ondusSession';

/* TODO: When implementing notification support
// The protocol returns notification information as a {category: type}
export interface IHash {
  [details: string] : string;
} 
const NOTIFICATION_TYPES: IHash = {};
NOTIFICATION_TYPES['(10,60)'] = 'Firmware update available';
NOTIFICATION_TYPES['(10,460)'] = 'Firmware update available';
NOTIFICATION_TYPES['(20,11)'] = 'Battery low';
NOTIFICATION_TYPES['(20,12)'] = 'Battery empty';
NOTIFICATION_TYPES['(20,20'] = 'Below temperature threshold';
NOTIFICATION_TYPES['(20,21'] = 'Above temperature threshold';
NOTIFICATION_TYPES['(20,30'] = 'Below humidity threshold';
NOTIFICATION_TYPES['(20,31'] = 'Above humidity threshold';
NOTIFICATION_TYPES['(20,40'] = 'Frost warning';
NOTIFICATION_TYPES['(20,80'] = 'Lost wifi';
NOTIFICATION_TYPES['(20,320'] = 'Unusual water consumption (water shut off)';
NOTIFICATION_TYPES['(20,321'] = 'Unusual water consumption (water not shut off)';
NOTIFICATION_TYPES['(20,330'] = 'Micro leakage';
NOTIFICATION_TYPES['(20,340'] = 'Frost warning';
NOTIFICATION_TYPES['(20,380'] = 'Lost wifi';
NOTIFICATION_TYPES['(30,0'] = 'Flooding';
NOTIFICATION_TYPES['(30,310'] = 'Pipe break';
NOTIFICATION_TYPES['(30,400'] = 'Maximum volume reached';
NOTIFICATION_TYPES['(30,430'] = 'Sense detected water (water shut off)';
NOTIFICATION_TYPES['(30,431)'] = 'Sense detected water (water not shut off)';
*/

/**
 * Ondus Platform constructor
 */
export class OndusPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public ondusSession: OndusSession;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {

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
    
    // Retrieve all locations
    await this.ondusSession.getLocations()
      .then(locations => {
        //this.log.debug('Iterating over locations: ', locations.body);
        locations.body.forEach(async location => {
          
          // Retrieve registered rooms for a location
          this.log.debug(`Processing locationID=${location.id} (${location.name})`);
          await this.ondusSession.getRooms(location.id)
            .then(rooms => {
              //this.log.debug('Iterating over rooms: ', rooms.body);
              rooms.body.forEach(async room => {

                // Retrieve registered appliances for a room
                this.log.debug(`Processing roomID=${room.id} (${room.name})`);
                await this.ondusSession.getAppliances(location.id, room.id)
                  .then(appliances => {
                    //this.log.debug('Iterating over appliances: ', appliances.body);
                    appliances.body.forEach(appliance => {
                      this.log.debug(`Found applianceID=${appliance.appliance_id} name=${appliance.name}`);
                      this.registerOndusAppliance(location.id, room.id, appliance);
                    });
                  })
                  // Error handler for appliances
                  .catch(err => {
                    const errMsg = `Error during appliances refresh: ${err}`;
                    this.log.error(errMsg);
                  });
              });
            })
            // Error handler for rooms
            .catch(err => {
              const errMsg = `Error during rooms refresh: ${err}`;
              this.log.error(errMsg);
            });
        });
      })
      // Error handler for locations
      .catch(err => {
        const errMsg = `Error during locations refresh: ${err}`;
        this.log.error(errMsg);
      });
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
        new OndusSense(this, locationID, roomID, accessory);
        break;
      case OndusSensePlus.ONDUS_TYPE:
        this.log.info(`Opening device handler "${OndusSensePlus.ONDUS_NAME}" for "${applianceInfo.name}"`);
        new OndusSensePlus(this, locationID, roomID, accessory);
        break;
      case OndusSenseGuard.ONDUS_TYPE:
        this.log.info(`Opening device handler "${OndusSenseGuard.ONDUS_NAME}" for "${applianceInfo.name}"`);
        new OndusSenseGuard(this, locationID, roomID, accessory);
        break;
      default:
        this.log.warn(`Unsupported Ondus appliance type encountered: ${applianceInfo.type} - ignoring`);
        return;
    }

  
  }
}
