import { OndusSensor } from './ondusSensor';
import { OndusThresholds } from './ondusThresholds';


export const NOTIFICATION_CATEGORY_FIRMWARE = 10;
export const NOTIFICATION_CATEGORY_WARNING = 20;
export const NOTIFICATION_CATEGORY_CRITICAL = 30;


/**
 * Transform a sensor notification from the Ondus API into a 
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
    private sensor: OndusSensor,
    private category: number,
    private type: number,
    private timestamp: string,
  ) {
    this.category = category;
    this.type = type;
    this.timestamp = timestamp;
    this.sensor = sensor;
    this.thresholds = this.sensor.thresholds;

    // The Ondus API returns notification information as a {category: type}
    this.NOTIFICATION_MAP = {
      'category' : {
        // NOTIFICATION_CATEGORY_FIRMWARE
        10 : {
          'type'  : {
            60  : 'Firmware update available',
            460 : 'Firmware update available',
          },  
        },
        // NOTIFICATION_CATEGORY_WARNING
        20 : {
          'type' : {
            11  : `Battery is at critical level: ${this.sensor['currentBatteryLevel']}%`,
            12  : 'Battery is empty and must be changed',
            20  : `Temperature levels have dropped below the minimum configured limit of ${this.thresholds.getLowTempLimit()}˚C`,
            21  : `Temperature levels have exceeded the maximum configured limit of ${this.thresholds.getHighTempLimit()}˚C`,
            30  : `Humidity levels have dropped below the minimum configured limit of ${this.thresholds.getLowHumidLimit()}% RF`,
            31  : `Humidity levels have exceeded the maximum configured limit of ${this.thresholds.getHighHumidLimit()}% RF`,
            40  : `Frost warning! Current temperature is ${this.sensor.currentTemperature}˚C`,
            80  : 'Lost WiFi',
            320 : 'Unusual water consumption detected - water has been SHUT OFF',
            321 : 'Unusual water consumption detected - water still ON',
            330 : 'Micro leakage detected',
            332 : 'Micro leakage detected over several days', // Unsure if this is correct?
            340 : `Frost warning! Current temperature is ${this.sensor.currentTemperature}˚C`,
            380 : 'Lost WiFi',
          },
        },
        // NOTIFICATION_CATEGORY_CRITICAL
        /* Notifications in this category will always trigger leakServices */
        30 : {
          'type' : {
            0   : 'Flooding detected - water has been SHUT OFF',
            310 : 'Pipe break - water has been SHUT OFF',
            400 : 'Maximum water volume reached - water has been SHUT OFF',
            430 : 'Water detected - water has been SHUT OFF',
            431 : 'Water detected - water still ON',
          },
        },
      },
    };

    switch(this.category) {
      case NOTIFICATION_CATEGORY_CRITICAL:
        this.sensor.setLeakServiceLeakDetected(true);
        break;
      case NOTIFICATION_CATEGORY_WARNING:
        switch(this.type) {
          case 20:
          case 21:
            this.sensor.setTemperatureServiceStatusFault(true);
            break;
          case 30:
          case 31:
            if (this.sensor['setHumidityServiceStatusFault']) {
              // Sense Guard does not contain humidity service 
              // so we must check if property is present
              this.sensor['setHumidityServiceStatusFault'](true);
            }
            break;
          case 40:
          case 80:
            this.sensor.setTemperatureServiceStatusFault(true);
            this.sensor.setTemperatureServiceStatusActive(false);
            this.sensor.setLeakServiceStatusFault(true);
            this.sensor.setLeakServiceStatusActive(false);
            break;
          case 340:
            this.sensor.setTemperatureServiceStatusFault(true);
            break;
          case 320:
          case 321:
          case 330:
          case 332:
            this.sensor.setLeakServiceStatusFault(true);
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
    const message = `${this.timestamp} => ${notification}`;
    return message;

  }
}


