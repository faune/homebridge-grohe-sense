import { Logger } from 'homebridge';
import superagent from 'superagent';

export class OndusSession {

  log: Logger;
  refreshToken = '';
  accessToken = '';
  username = '';
  password = '';

  // Ondus URLs
  BASE_URL = 'https://idp-apigw.cloud.grohe.com/v3/iot'
  LOGIN_URL = this.BASE_URL + '/oidc/login';
  REFRESH_URL = this.BASE_URL + '/oidc/refresh';

  constructor(
    log: Logger,
    refreshToken?: string,
    username?: string, 
    password?: string,
  
  ) {
    this.log = log;
    if (refreshToken) {
      this.log.debug('Got refreshToken: ', refreshToken);
      this.refreshToken = refreshToken;
    }
    if (username) {
      this.log.debug('Got username: ', username);
      this.username = username;
    }
    if (password) {
      this.log.debug('Got password: ', password);
      this.password = password;
    }
  }

  public async login() {
    // Retrieve refresh token, if neccessary
    if (!this.refreshToken) {
      this.getRefreshToken();
    }
    // Retrieve access token
    return this.getAccessToken();
    
  }

  private getRefreshToken() {
    this.log.debug('Using username/password to retrieve new refresh token');
    throw new Error('Support for username/password login is not implemented yet');
  }

  /**
  * Assumes that refreshToken is already set on instance 
  */
  private async getAccessToken() {
    this.log.debug('Using refresh token to retrieve access token');

    return new Promise<superagent.Response>((resolve, reject) => {
      superagent
        .post(this.REFRESH_URL)
        .set('Content-Type', 'application/json')
        .set('accept', 'json')
        .send({'refresh_token': this.refreshToken})
        .end((err, res) => {
          if (!err) {
            if (!res.body['access_token']) {
              this.log.error('Unable to refresh OAuth access token: ', err);
            } else {
              this.log.debug('OAuth access token successfully refreshed');
              this.accessToken = res.body['access_token'];
              resolve(res);
            }
          } else {
            this.log.error('Unexpected server response: ', err);
            reject(err);
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
    this.log.debug('getURL(): Fetching: ', url);
    
    return new Promise<superagent.Response>((resolve, reject) => {
      superagent
        .get(url)
        .set('Content-Type', 'application/json')
        .set('Authorization', 'Bearer ' + this.accessToken)
        .set('accept', 'json')
        .end((err, res) => {
          if (!err) {
            resolve(res);
          } else {
            this.log.error('getURL(): Unexpected server response: ', err);
            reject(err);
          }
        });
    });
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
  public async getApplianceInfo(locationID: number, roomID: number, applianceID: number) {
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
  public async getApplianceNotifications(locationID: number, roomID: number, applianceID: number) {
    this.log.debug(`getApplianceInfo(): Retrieving info about locationID=${locationID} roomID=${roomID} applianceID=${applianceID}`);
    return this.getURL(`${this.BASE_URL}/locations/${locationID}/rooms/${roomID}/appliances/${applianceID}/notifications`);
  }

  /**
   * Retrieve info about a specific appliance as a JSON object
   * 
   * @param locationID Number representing the locationID for appliance
   * @param roomID Number representing the roomID for appliance
   * @param applianceID Number representing the applianceID
   */
  public async getApplianceMeasurements(locationID: number, roomID: number, applianceID: number, fromDate: Date) {
    this.log.debug(`getApplianceInfo(): Retrieving info about locationID=${locationID} roomID=${roomID} applianceID=${applianceID}`);
    return this.getURL(`${this.BASE_URL}/locations/${locationID}/rooms/${roomID}/appliances/${applianceID}/data?from=${fromDate}`);
  }
}