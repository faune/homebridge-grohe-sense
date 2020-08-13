import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { OndusSense } from './ondusSense';
import { OndusSensePlus } from './ondusSensePlus';
import { OndusSenseGuard } from './ondusSenseGuard';


// Ondus HTTP library
import { OndusSession } from './ondusSession';

/* TODO: When implementing notification support

// The protocol returns notification information as a {category: type}
NOTIFICATION_TYPES = { 
  {10:60} : 'Firmware update available',
  (10,460) : 'Firmware update available',
  (20,11) : 'Battery low',
  (20,12) : 'Battery empty',
  (20,20) : 'Below temperature threshold',
  (20,21) : 'Above temperature threshold',
  (20,30) : 'Below humidity threshold',
  (20,31) : 'Above humidity threshold',
  (20,40) : 'Frost warning',
  (20,80) : 'Lost wifi',
  (20,320) : 'Unusual water consumption (water shut off)',
  (20,321) : 'Unusual water consumption (water not shut off)',
  (20,330) : 'Micro leakage',
  (20,340) : 'Frost warning',
  (20,380) : 'Lost wifi',
  (30,0) : 'Flooding',
  (30,310) : 'Pipe break',
  (30,400) : 'Maximum volume reached',
  (30,430) : 'Sense detected water (water shut off)',
  (30,431) : 'Sense detected water (water not shut off)',
  }
*/

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
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
    this.log.debug('Creating Ondus service session');

    // Validate config
    if (!this.config['refresh_token'] && (!this.config['username'] || !this.config['password'])) {
      this.log.error('Must configure either refresh_token, or username and password, in "%s" section of config.json', this.config.name);
      //TODO: Additional error handling?
    } 
    
    

    // Instantiate Ondus session for handling web comms
    this.ondusSession = new OndusSession(this.log, 
      this.config['refresh_token'],
      this.config['username'],
      this.config['password']);

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
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {

    this.log.debug('Fetching Ondus devices');
    //TODO: Query Ondus web for devices and add dynamically

    await this.ondusSession.login()
      .then(response => {
        this.log.debug(`Function login() successfull - HTTP_STATUS_CODE=${response.status}`);   
      })
      .catch(err => {
        throw err;
      });
  
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
                    throw err;
                  });
              });
            })
            // Error handler for rooms
            .catch(err => {
              throw err;
            });
        });
      })
      // Error handler for locations
      .catch(err => {
        throw err;
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
        new OndusSense(this, accessory, locationID, roomID);
        break;
      case OndusSensePlus.ONDUS_TYPE:
        this.log.info(`Opening device handler "${OndusSensePlus.ONDUS_NAME}" for "${applianceInfo.name}"`);
        new OndusSensePlus(this, accessory, locationID, roomID);
        break;
      case OndusSenseGuard.ONDUS_TYPE:
        this.log.info(`Opening device handler "${OndusSenseGuard.ONDUS_NAME}" for "${applianceInfo.name}"`);
        new OndusSenseGuard(this, accessory, locationID, roomID);
        break;
      default:
        this.log.warn(`Unsupported Ondus appliance type encountered: ${applianceInfo.type} - ignoring`);
        return;
    }

  
  }
}
