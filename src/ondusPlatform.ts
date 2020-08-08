import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { OndusSenseAccessory } from './ondusSense';

// Ondus HTTP library
import { OndusSession } from './ondusSession';



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

  private ondusSession: OndusSession;

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


    

    

    /*
    (await this.ondusSession.getLocations()).forEach(async (location) => {
      this.log.debug('Discovered location: ', location);
      (await this.ondusSession.getRooms(location)).forEach(async (room) => {
        this.log.debug('Discovered room: ', room);
        (await this.ondusSession.getAppliances(room)).forEach(async (appliance) => {
          this.log.debug('Discovered appliance: ', appliance);
        });
      });
    });
*/

    const senseDevice = {
      name: 'Sense',
      serial_number: '50FA', 
    };


    // generate a unique id for the accessory this should be generated from
    // something globally unique, but constant, for example, the device serial
    // number or MAC address
    const uuid = this.api.hap.uuid.generate(senseDevice.serial_number);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

      // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
      // existingAccessory.context.device = device;
      // this.api.updatePlatformAccessories([existingAccessory]);

      // create the accessory handler for the restored accessory
      // this is imported from `platformAccessory.ts`
      new OndusSenseAccessory(this, existingAccessory);

    } else {

      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new Ondus Sense leakage detector:', senseDevice.name);

      // create a new accessory
      const accessory = new this.api.platformAccessory(senseDevice.name, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = senseDevice;

      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new OndusSenseAccessory(this, accessory);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    /*
    // EXAMPLE ONLY
    // A real plugin you would discover accessories from the local network, cloud services
    // or a user-defined array in the platform config.
    const exampleDevices = [
        {
        exampleUniqueId: 'ABCD',
        exampleDisplayName: 'Bedroom',
      },
      {
        exampleUniqueId: 'EFGH',
        exampleDisplayName: 'Kitchen',
      },
    ];

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of exampleDevices) {

      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(device.exampleUniqueId);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        // existingAccessory.context.device = device;
        // this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new ExamplePlatformAccessory(this, existingAccessory);

      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.exampleDisplayName);

        // create a new accessory
        const accessory = new this.api.platformAccessory(device.exampleDisplayName, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device;

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        new ExamplePlatformAccessory(this, accessory);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }

      // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
      // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

      */
  }
}
