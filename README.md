<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150"> 
</p>
<p align="center">

<img src="https://cdn.cloud.grohe.com/Web/4_3/ZZH_T22500C05_000_01_4_3/4_3/710/ZZH_T22500C05_000_01_4_3_4_3.jpg" width="150">
<img src="https://cdn.cloud.grohe.com/Web/4_3/ZZH_T22505D55_000_01_4_3/4_3/710/ZZH_T22505D55_000_01_4_3_4_3.jpg" width="150">
</p>


# Homebridge Grohe Sense plugin

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![Version](https://img.shields.io/npm/v/homebridge-grohe-sense.svg)](https://www.npmjs.com/package/homebridge-grohe-sense)
[![Language](https://badgen.net/badge/language/typescript/orange)](https://badgen.net/badge/language/typescript/orange)
[![Downloads](https://img.shields.io/npm/dt/homebridge-grohe-sense.svg)](https://www.npmjs.com/package/homebridge-grohe-sense)


Homebridge plugin for controlling some of the aspects of [Grohe Sense water security system](https://www.grohe.co.uk/en_gb/smarthome/grohe-sense-water-security-system/) using HomeKit.

The following Grohe Sense components are supported:

  * Sense Guard main water inlet valve
  * Sense battery powered water leakage detector
  * Sense Plus mains powered water leakage detector

## Screenshot

![Grohe Sense Guard sensor layout](https://raw.githubusercontent.com/faune/homebridge-grohe-sense/master/img/sensors.png "Grohe Sense Guard sensor layout")


## Download

Released versions are published through npm and can be found here:

https://www.npmjs.com/package/homebridge-grohe-sense

You can also search for this plugin from the awesome Homebridge web UI and it will automagically be installed/updated for your.

## What is supported

Plugin will automatically find and configure your Sense devices, and expose the following HomeKit services:

 * Sense Guard
   - Valve
   - Temperature Sensor
   - Leakage Sensor
   - Water pressure (log only)
   - Water flowrate (log only)
 * Sense
   - Leakage Sensor
   - Temperature Sensor
   - Humidity Sensor
   - Battery Service
 * Sense Plus (untested, as I dont have one)
   - Leakage Sensor
   - Temperature Sensor
   - Humidity Sensor

Fakegato history can optionally be enabled, so the Eve app can be used to display cool graphs of collected sensor data.   

## What is not supported

* The system collects a lot of interesting information that unfortunately have no suitable characteristics counterpart defined in the official Apple HAP. This include (but not limited to) for example :
  - water pressure
  - flow metrics
  - water consumption
  - statistics
  - notifications


## What I would like to see in the future
 
* Proper OAuth library handling authentication
* Displaying water pressure, flow metrics +++, but I have no idea what characteristics to use in Homebridge for this...


## Configuration section in `config.json`

There is a Settings screen during plugin setup that helps you configure the configuration section shown below. 

````
{
  "name": "Ondus",
  "refresh_token": "<Paste refresh token here>",
  "username": "<user@name.domain>",
  "password": "<secret>",
  "refresh_interval": 3600,
  "valve_control": true,
  "platform": "Ondus"
}
````
### `refresh_token` and `username/password`
Note that for both `refresh_token` and `username/password` you must remove `< >` above when inserting your credentials. 

You do NOT need to provide the `refresh_token` if you provide your `username/password`. Some/many are more comfortable using a `refresh_token` than the actual `username/password` credentials themselves in a config file. 

### `refresh_interval`
How often to query Ondus API for new data. Default setting of `3600` seconds is more than sufficient, because sensors only report data every 24 hours unless a notification threshold has been exceeded.

### `valve_control`
If you have kids like me with iCloud family sharing enabled, and dont want them brats (just kidding, mine are actually angels) to turn off the main water supply through HomeKit as a prank when you are showering - this is for you! Set `valve_control` to `false`, and the plugin will ignore all valve control requests :-)


## Obtaining a `refresh token`

Source: <https://github.com/openhab/openhab-addons/blob/2.5.x/bundles/org.openhab.binding.groheondus/README.md#obtaining-a-refresh-token>

Actually obtaining a `refresh token` from the GROHE ONDUS Api requires some manual steps.
In order to more deeply understand what is happening during the process, you can read more information about the OAuth2/OIDC (OpenID Connect) login flow by searching for these terms in your favorite search engine.
Here is a short step-by-step guide on how to obtain a refresh token:

1. Open a new tab in your Internet browser
2. Open the developer console of your browser (mostly possible by pressing F12)
3. Select the network tab of the developer console (which shows you the network request done by the browser)
4. Open the following URL: https://idp2-apigw.cloud.grohe.com/v3/iot/oidc/login
5. You will automatically being redirected to the GROHE ONDUS login page, login there
6. After logging in successfully, nothing should happen, except a failed request to a page starting with `token?`
7. Click on this request (the URL in the request overview should start with `ondus://idp2-apigw.cloud.grohe.com/v3/iot/oidc/token?` or something like that
8. Copy the whole request URL (which should contain a lot of stuff, like a `state` parameter and so on)
9. Open a new tab in your Internet browser and paste the URL into the address bar (do not hit ENTER or start the navigation to this page, yet)
10. Replace the `ondus://` part of the URL with `https://` and hit ENTER
11. The response of the page should be plain text with a so called `JSON object`. Somewhere in the text should be a `refresh_token` string, select the string after this `refresh_token` text, which is encapsulated with `"`.

E.g.: If the response of the page looks like this:

````
{
    "access_token": "the_access_token",
    "expires_in":3600,
    "refresh_expires_in":15552000,
    "refresh_token":"the_refresh_token",
    "token_type":"bearer",
    "id_token":"the_id_token",
    "not-before-policy":0,
    "session_state":"a-state",
    "scope":"",
    "tandc_accepted":true,
    "partialLogin":false
}
````

Then the `refresh_token` value you should copy would be: `the_refresh_token`.
This value is the `refresh token` you should save as described above.


## Testing unreleased versions on your homebridge setup

1. git clone https://github.com/faune/homebridge-grohe-sense
2. cd homebridge-grohe-sense
3. npm install
4. npm run build
5. npm link
6. homebridge -I -D


## Why did I do this

If you really want to know this, lets take a stroll down memory lane:

1. <https://homebridge.io> is AWESOME! Props to everyone who contributed
2. I couldnt find a Ondus Sense plugin for homebridge :-(
3. I configured OpenHab with FlorianSW <https://github.com/openhab/openhab-addons/blob/2.5.x/bundles/org.openhab.binding.groheondus/>
4. I made Homebridge talk to OpenHab
5. 4 kinda worked, but data were never refreshed
6. Concluded OpenHab sucks (just kidding)
7. Started looking at https://developers.homebridge.io and wondered how hard can it be?
8. Looked at [FlorianSW](https://github.com/FlorianSW/grohe-ondus-api-java) java code alot for figuring out the Ondus web API
9. Spent 3 days trying to understand how 3 gazillion Node.js HTTP frameworks worked, and they all suck (just kidding.. well, not really) I mean... wtf... Seriosly, what is wrong with you guys??
10. Found https://github.com/visionmedia/superagent which was supercool
11. Attempted to get OpenHab working again, and it still sucks - especially when I dont want it to consume my life
12. Found homebridge example plugin
13. Got example up and running
14. Played around using TypeScript. Do I like it? Its growing - still wish it was Python, because I have trouble expressing everything I want
15. Found more help on Ondus API from <https://github.com/gkreitz/homeassistant-grohe_sense> - cool shit and written in a proper language :-)
16. Managed to piece together something bridging the example plugin framework with my superagent code from 10 worthy of showing the world
17. Had lots of fun learning new shit
18. Currently waiting for contributions or law suite from Grohe

