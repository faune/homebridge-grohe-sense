import { Logger } from 'homebridge';
import { HttpClient } from 'homebridge-lib';
import superagent from 'superagent';

export class OndusSession {

  log: Logger;
  httpClient: HttpClient;
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
      this.log.error('Cannot call getURL() before an access token has been acquired');
    }
    this.log.debug('Fetching: ', url);
    
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
            this.log.error('Unexpected server response: ', err);
            reject(err);
          }
        });
    });
  }

  /**
   * Retrieve all registered locations as a json object
   */
  public async getLocations() {
    this.log.debug('Retrieving locations');    
    return this.getURL(`${this.BASE_URL}/locations`);
  }

  public async getRooms(locationID: number) {
    this.log.debug(`Retrieving rooms for locationID=${locationID}`);
    return this.getURL(`${this.BASE_URL}/locations/${locationID}/rooms`);
  } 

  public async getAppliances(locationID: number, roomID: number) {
    this.log.debug(`Retrieving appliances for roomID=${roomID}`);
    return this.getURL(`${this.BASE_URL}/locations/${locationID}/rooms/${roomID}/appliances`);
  }

}