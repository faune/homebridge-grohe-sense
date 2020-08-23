import { PlatformAccessory, Logger } from 'homebridge';


/**
 * Extract and provide getter interfaces for any configured 
 * appliance thresholds for an OndusAppliance instance 
 */
export class OndusThresholds {

  logPrefix: string;

  // Threshold limits
  highTempLimit: number;
  lowTempLimit: number;
  highHumidLimit: number;
  lowHumidLimit: number;
  highFlowLimit: number;
  lowFlowLimit: number;
  highPressureLimit: number;
  lowPressureLimit: number;

  // If action is to be taken if threshold limits are exceeded
  highTempLimitEn: boolean;
  lowTempLimitEn: boolean;
  highHumidLimitEn: boolean;
  lowHumidLimitEn: boolean;
  highFlowLimitEn: boolean;
  lowFlowLimitEn: boolean;
  highPressureLimitEn: boolean;
  lowPressureLimitEn: boolean;  

  constructor(
        private log: Logger,
        public accessory: PlatformAccessory,
  ) {

    this.log = log;
    this.logPrefix = '';
    this.accessory = accessory;

    // Set all threshold limits to default value
    this.highTempLimit = 0;
    this.lowTempLimit = 0;
    this.highHumidLimit = 0;
    this.lowHumidLimit = 0;
    this.highFlowLimit = 0;
    this.lowFlowLimit = 0;
    this.highPressureLimit = 0;
    this.lowPressureLimit = 0;

    // Disable all threshold actions by default
    this.highTempLimitEn = false;
    this.lowTempLimitEn = false;
    this.highHumidLimitEn = false;
    this.lowHumidLimitEn = false;
    this.highFlowLimitEn = false;
    this.lowFlowLimitEn = false;
    this.highPressureLimitEn = false;
    this.lowPressureLimitEn = false;  

  }

  /**
   * Parse the accessory context and extract all min/max 
   * thresholds configured for this appliance.
   */
  public update() {
    
    // Use the name of the accessory being processed as log prefix
    this.logPrefix = this.accessory.context.device.name;

    // Find threshold limits
    this.log.info(`[${this.logPrefix}] Configured threshold limits:`);

    this.accessory.context.device.config['thresholds'].forEach(element => {
      if ((element.quantity === 'temperature') || (element.quantity === 'temperature_guard')) {
        if (element.type === 'min') {
          this.lowTempLimit = element.value;
          this.lowTempLimitEn = element.enabled;
          this.log.info(`[${this.logPrefix}] [${element.enabled ? '*':' '}] Temperature low: ${this.lowTempLimit}˚C`);  
        }
        if (element.type === 'max') {
          this.highTempLimit = element.value;
          this.highFlowLimitEn = element.enabled;
          this.log.info(`[${this.logPrefix}] [${element.enabled ? '*':' '}] Temperature high: ${this.highTempLimit}˚C`);
        }
      }
      if (element.quantity === 'humidity') {
        if (element.type === 'min') {
          this.lowHumidLimit = element.value;
          this.lowHumidLimitEn = element.enabled;
          this.log.info(`[${this.logPrefix}] [${element.enabled ? '*':' '}] Humidity low: ${this.lowHumidLimit}% RF`);
        }
        if (element.type === 'max') {
          this.highHumidLimit = element.value;
          this.highHumidLimitEn = element.enabled;
          this.log.info(`[${this.logPrefix}] [${element.enabled ? '*':' '}] Humidity high: ${this.highHumidLimit}% RF`);
        }
      }
      if (element.quantity === 'flowrate') {
        if (element.type === 'min') {
          this.lowFlowLimit = element.value;
          this.lowFlowLimitEn = element.enabled;
          this.log.info(`[${this.logPrefix}] [${element.enabled ? '*':' '}] Flowrate low: ${this.lowFlowLimit}`);
        }
        if (element.type === 'max') {
          this.highFlowLimit = element.value;
          this.highFlowLimitEn = element.enabled;
          this.log.info(`[${this.logPrefix}] [${element.enabled ? '*':' '}] Flowrate high: ${this.highFlowLimit}`);
        }
      }
      if (element.quantity === 'pressure') {
        if (element.type === 'min') {
          this.lowPressureLimit = element.value;
          this.lowPressureLimitEn = element.enabled;
          this.log.info(`[${this.logPrefix}] [${element.enabled ? '*':' '}] Pressure low: ${this.lowPressureLimit} bar`);
        }
        if (element.type === 'max') {
          this.highPressureLimit = element.value;
          this.highPressureLimitEn = element.enabled;  
          this.log.info(`[${this.logPrefix}] [${element.enabled ? '*':' '}] Pressure high: ${this.highPressureLimit} bar`);
        }
      }
    });
  }

  isHighTempLimitEnabled() {
    return this.highTempLimitEn;
  }

  getHighTempLimit() {
    return this.highTempLimit; 
  }

  isLowTempLimitEnabled() {
    return this.lowTempLimitEn;
  }

  getLowTempLimit() {
    return this.lowTempLimit; 
  }

  isHighHumidLimitEnabled() {
    return this.highHumidLimitEn;
  }

  getHighHumidLimit() {
    return this.highHumidLimit; 
  }

  isLowHumidLimitEnabled() {
    return this.lowHumidLimitEn;
  }

  getLowHumidLimit() {
    return this.lowHumidLimit; 
  }

  isHighFlowLimitEnabled() {
    return this.highFlowLimitEn;
  }

  getHighFlowLimit() {
    return this.highFlowLimit; 
  }

  isLowFlowLimitEnabled() {
    return this.lowFlowLimitEn;
  }

  getLowFlowLimit() {
    return this.lowFlowLimit;
  }

  isHighPressureLimitEnabled() {
    return this.highPressureLimitEn;
  }

  getHighPressureLimit() {
    return this.highPressureLimit; 
  }

  isLowPressureLimitEnabled() {
    return this.lowPressureLimitEn;
  }

  getLowPressureLimit() {
    return this.lowPressureLimit; 
  }

}