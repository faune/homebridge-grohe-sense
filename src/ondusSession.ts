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
  

  public getLocations() {

    this.log.debug('Retrieving locations');
    const locations = [];

    superagent
      .get(this.BASE_URL + '/locations')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Bearer ' + this.accessToken)
      .set('accept', 'json')
      .end((err, res) => {
        if (err) {
          this.log.error('Unexpected server response: ', err);
        } else {
          this.log.debug(res.text);   
        }   
      });

    return locations;
  }

  public async getRooms(location: string) {
    this.log.debug('Retrieving rooms for location, ', location);
    const rooms = [];
    return rooms;
  } 

  public async getAppliances(room: string) {
    this.log.debug('Retrieving appliances for room, ', room);
    const appliances = [];
    return appliances;
  }

}