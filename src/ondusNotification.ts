import { OndusAppliance } from './ondusAppliance';
import { OndusThresholds } from './ondusThresholds';


export const NOTIFICATION_CATEGORY_FIRMWARE = 10;
export const NOTIFICATION_CATEGORY_WARNING = 20;
export const NOTIFICATION_CATEGORY_CRITICAL = 30;


/**
 * Transform an appliance notification from the Ondus API into a 
 * human-readable format. The constructed notification message will
 * also including the relevant appliance metrics depending on the
 * sensor state.
 */
export class OndusNotification {
  private NOTIFICATION_MAP;

  thresholds: OndusThresholds;


  /**
    * OndusNotification constructor
    */
  constructor(
    private appliance: OndusAppliance,
    private category: number,
    private type: number,
    private date: string,
  ) {
    this.category = category;
    this.type = type;
    this.date = date;
    this.appliance = appliance;
    this.thresholds = this.appliance.thresholds;

    // The Ondus API returns notification information as a {category: type}
    this.NOTIFICATION_MAP = {
      'category' : {
        // NOTIFICATION_CATEGORY_FIRMWARE
        10 : {
          'type'  : {
            10  : 'Sense integration successful',
            60  : 'Sense firmware update available',
            410 : 'Guard integration successful',
            460 : 'Guard firmware update available',
            555 : 'Blue auto-flush active',
            556 : 'Blue auto-flush inactive',
            557 : 'Blue empty CO2 cartridge',
            559 : 'Blue cleaning completed',
            560 : 'Blue firmware update available',
          },  
        },

        // NOTIFICATION_CATEGORY_WARNING
        20 : {
          'type' : {
            11  : `Battery is at critical level: ${this.appliance['currentBatteryLevel']}%`,
            12  : 'Battery is empty and must be changed',
            20  : `Temperature levels have dropped below the minimum configured limit of ${this.thresholds.getLowTempLimit()}˚C`,
            21  : `Temperature levels have exceeded the maximum configured limit of ${this.thresholds.getHighTempLimit()}˚C`,
            30  : `Humidity levels have dropped below the minimum configured limit of ${this.thresholds.getLowHumidLimit()}% RF`,
            31  : `Humidity levels have exceeded the maximum configured limit of ${this.thresholds.getHighHumidLimit()}% RF`,
            40  : `Frost warning! Current temperature is ${this.appliance.currentTemperature}˚C`,
            80  : 'Guard lost WiFi connection',
            320 : 'Unusual water consumption detected - water has been SHUT OFF',
            321 : 'Unusual water consumption detected - water still ON',
            330 : 'Micro leakage detected',
            332 : 'Micro leakage detected over several days', // Unsure if this is correct?
            340 : `Frost warning! Current temperature is ${this.appliance.currentTemperature}˚C`,
            380 : 'Sense lost WiFi connection',
            420 : 'Repeated pressure problems detected over the last several hours - water has been SHUT OFF',
            421 : 'Repeated pressure problems detected over the last several hours - water still ON',
            550 : 'Blue filter low',
            551 : 'Blue CO2 low',
            552 : 'Blue filter empty',
            553 : 'Blue CO2 empty',
            564 : 'Blue filter stock is empty',
            565 : 'Blue CO2 stock is empty',
            558 : 'Blue cleaning needed',
            580 : 'Blue lost WiFi connection',
          },
        },
        // NOTIFICATION_CATEGORY_CRITICAL
        /* Notifications in this category will always trigger leakServices */
        30 : {
          'type' : {
            0   : 'Flooding detected - water has been SHUT OFF',
            310 : 'Pipe break - water has been SHUT OFF',
            400 : 'Maximum water volume reached - water has been SHUT OFF',
            430 : 'Water detected by Sense - water has been SHUT OFF',
            431 : 'Water detected by Sense - water still ON',
          },
        },
      },
    };

    switch(this.category) {
      case NOTIFICATION_CATEGORY_CRITICAL:
        this.appliance.leakDetected = true;
        break;
      case NOTIFICATION_CATEGORY_WARNING:
        switch(this.type) {
          case 20:
          case 21:
            this.appliance.setTemperatureServiceStatusFault(true);
            break;
          case 30:
          case 31:
            if (this.appliance['setHumidityServiceStatusFault']) {
              this.appliance['setHumidityServiceStatusFault'](true);
            }
            break;
          case 40:
          case 340:
            this.appliance.setTemperatureServiceStatusFault(true);
            break;
          case 320:
          case 321:
          case 330:
          case 332:
          case 420:
          case 421:
            this.appliance.leakDetected = true;
            break;
        }
        break;
    }
  }
  
  /**
   * Generate a formatted string for this Ondus appliance instance where correct
   * instance data is inserted into the returned message
   */
  getNotification() {
    let notification = this.NOTIFICATION_MAP.category[this.category].type[this.type];
    if (!notification) {
      notification = `Unknown notification category=${this.category} type=${this.type}`;
    }
    const message = `${this.date} => ${notification}`;
    return message;

  }
}


