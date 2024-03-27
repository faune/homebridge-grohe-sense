import { Logger, PlatformConfig } from 'homebridge';

import superagent from 'superagent';
import Throttle from 'superagent-throttle';
import cheerio from 'cheerio';


/**
 * One instance of this class is created by OndusPlatform and shared between
 * all Ondus appliance instances in order to communicate with the Ondus API.
 * 
 * In general methods in this instance contain no logic for data query.
 * This logic is rather applied in the Ondus appliance instances instead
 * and the OndusSession instance provide helper methods for performing the 
 * neccessary queries.
 */
export class OndusSession {

  log: Logger;
  config: PlatformConfig;
  refreshToken: string;
  refreshTokenExpireIn = 15552000; // Default 180 days
  accessToken: string;
  accessTokenExpireIn = 3600; // Default 1 hour
  username: string;
  password: string;
  sessionCookie: string;
  loggedIn: boolean;
  throttle: Throttle;

  // Ondus URLs
  BASE_URL = 'https://idp2-apigw.cloud.grohe.com/v3/iot'
  LOGIN_URL = this.BASE_URL + '/oidc/login';
  REFRESH_URL = this.BASE_URL + '/oidc/refresh';
  ACTION_URL = '';
  TOKEN_URL = ''

  constructor(
    log: Logger,
    config: PlatformConfig,
  ) {
    this.log = log;
    this.config = config;
    this.loggedIn = false;

    // Initialize OAuth properties to empty strings
    this.refreshToken = '';
    this.accessToken = '';
    this.username = '';
    this.password = '';
    this.sessionCookie = '';

    // Parse config
    if (config['refresh_token'] && (config['refresh_token'] !== '<Paste refresh token here>')) {
      this.log.debug('refreshToken: ', '<secret>');
      this.refreshToken = config['refresh_token'];
    }
    if (config['username']) {
      this.log.debug('username: ', config['username']);
      this.username = config['username'];
    }
    if (this.config['password']) {
      this.log.debug('password: ', '<secret>');
      this.password = this.config['password'];
    }

    // Throttling support for HTTP requests
    this.throttle = new Throttle({
      'active': this.config['throttle_support'],        // set false to pause queue
      'rate': this.config['throttle_rate'],             // how many requests can be sent every `ratePer`
      'ratePer': this.config['throttle_rateper'],       // number of ms in which `rate` requests may be sent
      'concurrent': this.config['throttle_concurrent'], // how many requests can be sent concurrently
    });
  }

  /**
   * The login procedure will perform the following actions:
   * 
   * 1a) Acquire a refresh token using username/password (if provided in config.json)
   * 1b) Use provided refresh token from config.json
   * 2) Acquire or refresh an access token if a refresh token is already set
   *
   * It seems that the access token will expire after a while, so it will be neccessary
   * to call refreshAccessToken() (or simply call login() again) from time to time.
   */
  public async login() {

    // Reset loggedIn status
    this.loggedIn = false; 

    // Retrieve refresh token, if neccessary
    if (!this.refreshToken) {
      // Use username/password for acquiring access token
      await this.getActionURL();
      await this.getTokenURL();
      await this.getRefreshToken()
        .then( response => {       
          this.log.debug(`Function getRefreshToken() successfull: HTTP_STATUS_CODE=${response.status}`);
          this.loggedIn = true;
        });
    } else {
      // Refresh access token using existing refresh token from config.json
      await this.refreshAccessToken()
        .then( response => {
          this.log.debug(`Function refreshAccessToken() successfull: HTTP_STATUS_CODE=${response.status}`);
          this.loggedIn = true;
        });
    }

    // Make sure we refresh the access token once it expires
    this.log.info(`Scheduling access token refresh in ${this.accessTokenExpireIn} seconds`);
    setInterval( async () => { 
      this.log.info('Access token has expired - refreshing ...');
      await this.refreshAccessToken()
        .then( () => {
          this.loggedIn = true;
        })
        .catch( err => {
          this.log.error(`Unable to refresh access token after ${this.accessTokenExpireIn} seconds: ${err}`);
          this.loggedIn = false;
        });
    }, this.accessTokenExpireIn * 1000);

    return this.loggedIn;
  }

  /**
   * Get action URL for authenticating user
   */
  private async getActionURL() {
    this.log.debug('Fetching action URL');

    return new Promise<superagent.Response>((resolve, reject) => {
      // Retrieve action URL from Ondus web form login page
      superagent
        .get(this.LOGIN_URL)
        .end( (err, res) => {
          if (!res.header['set-cookie']) {
            const errMsg = 'Unable to retrieve session cookies';            
            this.log.error(errMsg);
            reject(errMsg);
          }
          this.log.debug('Storing session cookies');
          this.sessionCookie = res.header['set-cookie'];

          // Parse HTML looking for action URL
          const $ = cheerio.load(res.text);
          this.ACTION_URL = $('form').attr()['action'];
          if (this.ACTION_URL.length > 0) {
            this.log.debug(`Found action URL for posting login credentials: ${this.ACTION_URL}`);
            resolve(res);
          } else {
            this.log.error('Unable to find action URL for posting login credentials');
            reject(err.response);
          }
        });
    });
  }

  /**
   * Authenticate against action URL and retrieve token URL for fetching refresh token
   */
  private async getTokenURL() {
    
    this.log.debug('Using username/password to retrieve new refresh token');
    this.log.debug(`Authenticating against ACTION_URL=${this.ACTION_URL}`);
    return new Promise<superagent.Response>((resolve, reject) => {  
      //this.log.debug('Cookie:', this.sessionCookie);
      superagent
        .post(this.ACTION_URL)
        .set('Cookie', this.sessionCookie)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('referer', this.ACTION_URL)
        .set('origin', this.LOGIN_URL)
        .send(`username=${this.username}&password=${this.password}`)
        .buffer(false)
        .redirects(0) // Dont follow weird ondus:// address
        .end((err, res) => {
          if (res && res.header.location) {
            this.log.debug(`Token URL redirect successfull: HTTP_STATUS_CODE=${res.status}`);
            this.log.debug('Found token URL: ', res.header.location);
            this.TOKEN_URL = res.header.location.replace('ondus://', 'https://');
            resolve(res);
          } else {
            reject('Unable to acquiring access token from redirect URL');
          }
        });
    });
  }

  /**
   * Fetch refresh token from token URL
   */
  private async getRefreshToken() {
    this.log.debug('Fetching refresh token from redirect URL');
  
    return new Promise<superagent.Response>((resolve, reject) => {  
      superagent
        .get(this.TOKEN_URL)
        .set('Cookie', this.sessionCookie)
        .end( (err, res) => {
          if (res) {
            if (res.body.access_token && res.body.refresh_token) {
              this.accessToken = res.body.access_token;
              this.accessTokenExpireIn = res.body.expires_in;
              this.refreshToken = res.body.refresh_token;
              this.refreshTokenExpireIn = res.body.refresh_expires_in;
              this.log.info(`OAuth access token successfully retrieved - token will expire in ${this.accessTokenExpireIn} seconds`);
              resolve(res);
            
              // Other unused header fields:
              //res.body.token_type;
              //res.body.id_token;
            
              // TODO: Can this be done?
              //this.log.info('Saving refresh token to config.json');
              //this.config['refresh_token'] = this.refreshToken;
            } else {
              const errMsg = `No refresh token in server response: ${res}`;
              this.log.error(errMsg);
              reject(res);
            }
          } else {
            reject(err);
          }
        });
    });
  }


  
  
  /**
   * Refresh access token. This function assumes that a refreshToken 
   * is already set on instance 
   */
  private async refreshAccessToken() {
    this.log.debug('Using refresh token to retrieve access token');

    return new Promise<superagent.Response>((resolve, reject) => {
      superagent
        .post(this.REFRESH_URL)
        .set('Content-Type', 'application/json')
        .set('accept', 'json')
        .send({'refresh_token': this.refreshToken})
        .end((err, res) => {
          if (err) {
            this.log.error(`refreshAccessToken(): Unexpected server response: ${err}`);
            reject(err);
          } else {
            //this.log.debug(res.body);
            if (res.body.access_token && res.body.expires_in) {
              this.accessToken = res.body.access_token;
              this.accessTokenExpireIn = res.body.expires_in;
              this.log.info(`OAuth access token successfully refreshed - token will expire in ${this.accessTokenExpireIn} seconds`);
              resolve(res);
            } else {
              const errMsg = `Unable to refresh OAuth access token: ${res}`;
              this.log.error(errMsg);
              reject(errMsg);              
            }
          }
        });
    });
  }
  
  /**
   * Private helper method to re-use Promise together with superagent query.
   * This function must only be called after a successful login() has been
   * performed, as it depends on a valid access token.
   * 
   * @param url URL address to perform a GET against
   */
  private async getURL(url: string) {
    if (!this.accessToken) {
      this.log.error('getURL(): Cannot call getURL() before an access token has been acquired');
    }
    this.log.debug('getURL(): GET: ', url);
    
    return new Promise<superagent.Response>((resolve, reject) => {
      superagent
        .get(url)
        .use(this.throttle.plugin())
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${this.accessToken}`)
        .set('accept', 'json')
        .end((err, res) => {
          if (err) {
            const errMsg = `getURL(): Unexpected server response: ${err}`;
            reject(errMsg);
          } else {
            resolve(res);
          }
        });
    });
  }

  /**
   * Private helper method to re-use Promise together with superagent query.
   * This function must only be called after a successful login() has been
   * performed, as it depends on a valid access token.
   * 
   * @param url URL address to perform a POST against
   */
  private async postURL(url: string, data) {
    if (!this.accessToken) {
      this.log.error('postURL(): Cannot call postURL() before an access token has been acquired');
    }
    this.log.debug('postURL(): POST: ', url);
    
    return new Promise<superagent.Response>((resolve, reject) => {
      superagent
        .post(url)
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${this.accessToken}`)
        .set('accept', 'json')
        .send(data)
        .end((err, res) => {
          if (err) {
            const errMsg = `postURL(): Unexpected server response: ${err}`;
            reject(errMsg);
          } else {
            resolve(res);
          }
        });
    });
  }

  /**
   * Retrieve all dashboard information as a JSON object
   */
  public async getDashboard() {
    this.log.debug('getDashboard(): Retrieving dashboard information');
    return this.getURL(`${this.BASE_URL}/dashboard`);
  }

  /**
   * Retrieve all registered locations for the acquired access token as a JSON object
   */
  public async getLocations() {
    this.log.debug('getLocations(): Retrieving locations');    
    return this.getURL(`${this.BASE_URL}/locations`);
  }

  /**
   * Retrieve all registered rooms for a locationID as a JSON object
   * 
   * @param locationID Number representing the locationID for querying rooms
   */
  public async getRooms(locationID: number) {
    this.log.debug(`getRooms(): Retrieving rooms for locationID=${locationID}`);
    return this.getURL(`${this.BASE_URL}/locations/${locationID}/rooms`);
  } 

  /**
   * Retrieve all registered appliances for a locationID and roomID as a JSON object
   * 
   * @param locationID Number representing the locationID for appliances
   * @param roomID Number representing the roomID for appliances
   */
  public async getAppliances(locationID: number, roomID: number) {
    this.log.debug(`getAppliances(): Retrieving appliances for roomID=${roomID}`);
    return this.getURL(`${this.BASE_URL}/locations/${locationID}/rooms/${roomID}/appliances`);
  }

  /**
   * Retrieve info about a specific appliance as a JSON object
   * 
   * @param locationID Number representing the locationID for appliance
   * @param roomID Number representing the roomID for appliance
   * @param applianceID Number representing the applianceID
   */
  public async getApplianceInfo(locationID: number, roomID: number, applianceID: string) {
    this.log.debug(`getApplianceInfo(): Retrieving info about locationID=${locationID} roomID=${roomID} applianceID=${applianceID}`);
    return this.getURL(`${this.BASE_URL}/locations/${locationID}/rooms/${roomID}/appliances/${applianceID}`);
  }

  /**
   * Retrieve appliance notifications as a JSON object
   * 
   * @param locationID Number representing the locationID for appliance
   * @param roomID Number representing the roomID for appliance
   * @param applianceID Number representing the applianceID
   */
  public async getApplianceNotifications(locationID: number, roomID: number, applianceID: string) {
    this.log.debug(`getApplianceInfo(): Retrieving info about locationID=${locationID} roomID=${roomID} applianceID=${applianceID}`);
    return this.getURL(`${this.BASE_URL}/locations/${locationID}/rooms/${roomID}/appliances/${applianceID}/notifications`);
  }

  /**
   * Retrieve measurements performed by a specific appliance as a JSON object.
   * fromDate and toDate can be specified to limit the response metrics
   * 
   * @param locationID Number representing the locationID for appliance
   * @param roomID Number representing the roomID for appliance
   * @param applianceID Number representing the applianceID
   */
  public async getApplianceMeasurements(locationID: number, roomID: number, applianceID: string, fromDate?: Date, toDate?: Date) {
    this.log.debug(`getApplianceInfo(): Retrieving info about locationID=${locationID} roomID=${roomID} applianceID=${applianceID}`);

    let url = `${this.BASE_URL}/locations/${locationID}/rooms/${roomID}/appliances/${applianceID}/data/aggregated`;
    if (fromDate) {
      const fromStr = fromDate.toISOString().split('T')[0];
      url += `?from=${fromStr}`;
    }
    if (toDate) {
      const toStr = toDate.toISOString().split('T')[0];
      url += `&to=${toStr}`;
    }
    return this.getURL(url);
  }


  /** 
   * Retrieve appliance status like battery level, type of connection and WiFi quality.
   * Not sure what type of connection and WiFi quality is in use by the service.
   * 
   * @param locationID Number representing the locationID for appliance
   * @param roomID Number representing the roomID for appliance
   * @param applianceID Number representing the applianceID
  */
  public async getApplianceStatus(locationID: number, roomID: number, applianceID: string) {
    return this.getURL(`${this.BASE_URL}/locations/${locationID}/rooms/${roomID}/appliances/${applianceID}/status`);
  }

  /**
   * Retrieve appliance command. Examples of supported accessory commands:
   * - Sense Guard : current valve state
   * - Sense : unknown
   *  
   * @param locationID Number representing the locationID for appliance
   * @param roomID Number representing the roomID for appliance
   * @param applianceID Number representing the applianceID
   */
  public async getApplianceCommand(locationID: number, roomID: number, applianceID: string) {
    return this.getURL(`${this.BASE_URL}/locations/${locationID}/rooms/${roomID}/appliances/${applianceID}/command`);
  }

  /**
   * Set appliance command. Examples of supported accessory commands:
   * - Sense guard: Open or close valve
   * - Sense: unknown
   *  
   * @param locationID Number representing the locationID for appliance
   * @param roomID Number representing the roomID for appliance
   * @param applianceID Number representing the applianceID
   * @param data Data structure to POST
   */
  public async setApplianceCommand(locationID: number, roomID: number, applianceID: string, data) {
    return this.postURL(`${this.BASE_URL}/locations/${locationID}/rooms/${roomID}/appliances/${applianceID}/command`, data);
  }
}
