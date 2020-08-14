
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>


# Homebridge Ondus plugin

This is my first attempt at:

1. Typescript
2. Homebridge plugin

You have been warned :-)

## Why did I do this

1. <https://homebridge.io> is AWESOME! Props to everyone who contributed
2. I couldnt find a Ondus Sense plugin for homebridge :-(
3. I configured OpenHab with FlorianSW <https://github.com/openhab/openhab-addons/blob/2.5.x/bundles/org.openhab.binding.groheondus/>
4. I made Homebridge talk to OpenHab
5. 4 kinda worked, but data were never refreshed
6. Concluded OpenHab sucks (just kidding)
7. Started looking at https://developer.homebridge.io and wondered how hard can it be?
8. Looked at FlorianSWs java code alot for figuring out the Ondus web API
9. Spent 3 days trying to understand how 3 gazillion Node.js HTTP frameworks worked, and they all suck (just kidding.. well, not really) I mean... wtf... Seriosly, what is wrong with you guys??
10. Found https://github.com/visionmedia/superagent which was supercool
11. Attempted to get OpenHab working again, and it still sucks - especially when I dont want it to consume my life
12. Found homebridge example plugin
13. Got example up and running
14. Played around using TypeScript. Do I like it? Its growing - still wish it was Python, because I have trouble expressing everything I want
15. Found more help on Ondus API from <https://github.com/gkreitz/homeassistant-grohe_sense> - cool shit and written in a proper language!
16. Managed to piece together something bridging the example plugin framework with my superagent code from 10 worthy of showing the world
17. Currently waiting for contributions or law suite from Grohe :-)



## What is supported

Plugin will automatically find your Ondus devices, and expose the following HomeKit services:

 * Ondus Sense guard
  - Temperature
  - Valve state
 * Ondus Sense
  - Temperature
  - Humidity
 * Ondus Sense Plus (untested, as I dont have one)
  - Temperature
  - Humidity


## What is not supported

* Publish plugin for homebridge, so it shows up in searches (but would like to polish it a bit more)
* Acquiring refresh token with username/password. I will probably get around to do this soonish.
* Controlling the Guard valve state
* Displaying water pressure and flow metrics

## What I would like to see in the future
 
* Proper OAuth library handling authentication
* I have no idea where/how to handle exceptions and errors, so this is probably FUBAR right now. Help anyone?
* Eve history would be awesome using Fakegato
* Displaying water pressure and flow metrics, but I have no idea what characteristics to use in Homebridge for this...
* Control Guard valve. This is pretty simple to add, but so far I dont have a use-case for it and my kids have access to my HomeKit config as well, so ...

## Configuration section in config.json

````
{
  "name": "Ondus",
  "refresh_token": "<Paste your refresh token here>"
  "refresh_interval": 3600,
  "platform": "Ondus"
}
````

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


## Testing on your homebridge setup

1. git clone https://github.com/faune/homebridge-plugin-ondus
2. cd homebridge-plugin-ondus
3. npm install
4. npm run build
5. npm link
6. homebridge -D


