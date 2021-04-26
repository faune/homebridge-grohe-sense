# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Released]

## [1.5.0] - 2021-04-24

### Added

- Use superagent throttling to prevent Ondus API request rate limitations. 
- SHTF mode added to config: Log various HTTP responses to figure out why undefined is being reported by users

### Changed 

- Fixed characteristics warnings flagged by latest HAP-NodeJS version
- Dependency updates: homebridge@1.3.1, typescript@4.2.2

## [1.4.2] - 2020-09-16

### Added

- Added missing code for disabling Eve history

### Changed

- None

## [1.4.1] - 2020-09-16

Small bugfix version.

### Added

- Added missing plugin configuration option for Fakegato

### Changed

- Removed deprecated dependency

## [1.4.0] - 2020-09-16

Fakegato support is finally in, so looking at your sensor data in the Eve app should display nice graphs!

NOTE: Please remove any cached Sense accessory using Homebridge UI, as this will most likely fix issues related to cached characteristics
(like e.g. Active characteristics) that are no longer used by this plugin. In the Homebridge UI go to "(...) -> Homebridge Settings 
-> Remove single cached accessory" and then delete all Grohe Sense cached accessories. Every accessory will be re-added upon next
Homebridge restart, including all your historical data, so no worries!

### Added

- Fakegato history support

### Changed

- Take Two: Fixed a bug where status fault characteristics were never cleared after a message in Ondus API was marked as read
- Removed characteristics Active. Characteristics StatusActive has been added instead. 

## [1.3.2] - 2020-08-28 

### Added

- A new Ondus API notification (category,type) message that was previously missing

### Changed

- Fixed a bug where status fault characteristics were never cleared after a message in Ondus API was marked as read

## [1.3.1] - 2020-08-25

### Added

- The Active characteristics have been added to all appliances
- The StatusFault characteristics have been added to all appliances
- If network error towards Ondus API is encountered the Active characteristics will be set to Inactive
- If a configured threshold for an appliance is exceeded, the StatusFault characteristics will be triggered. This will remain set until warning message is cleared in Ondus App.

### Changed

- Removed duplicate OndusSense start() code
- TemperatureSensor characteristics were incorrectly updated from valve control 
- Re-factoring completed

## [1.3.0] - 2020-08-23

This release adds 4 LeakSensors in total. A LeakSensors will trigger if/when a critical 
notification is processed from the Ondus API.

NOTE: This plugin only reads data from the Ondus API - it never writes data back. The only exception
to this approach is for valve control which can optionally be enabled in the plugin settings. In
that case this plugin performs a HTTP POST request altering the state of the valve. No other data
is changed. 

WARNING: It is highly recommended to ONLY rely on the official Ondus App for stopping your
water inlet valve in case of an emergency / flooding / pipe break. This service is meant
as complementary to the official solution. As long as you never intentionally disabled
something in the official Ondus app, you should be fine using this plugin.


### Added

- A LeakSensor service has been added to each Sense Guard / Sense Plus / Sense. 
- In total there are now 4 LeakSensor services.
- Notification messages are always printed as warnings to the log until they have been read/erased in the Ondus App
- Configured threshold limits from the Ondus App are printed to the logs

### Changed

- Improved error logging a bit if server responded with unknown response
- Refactored code for minimal duplication

## [1.2.1] - 2020-08-21 

### Added

- Homebridge verified

### Changed

- Readme and Changelog updated to reflect the plugin has been Homebridge verified


## [1.2.0] - 2020-08-20

### Added

- New plugin name

### Changed

- Changed plugin name from homebridge-plugin-ondus to homebridge-grohe-sense
- Changed the way plugin registers with homebridge in order to twart a warning message
- Fixed wrong serial number in the accessory info
- Attempting to fix valve "Starting .." and "Waiting .." stuck responses in Home app by controlling both characteristics Active and InUse from the same context

## [1.1.0] - 2020-08-20

This release fixes the flaws in release 1.0.0 in terms of keeping a session alive
over a longer period of time. Everyone on release 1.0.0 is recommended to install this update. 

### Added

- Auth using username and password
- Access token automatically renewed once it expire after default 3600 seconds
- Refresh token is not automatically renewed once it expires after default 180 days. To mitigate use username/password instead.
- Sensor data which does not fit into any of the pre-defined HomeKit characteristics are logged
- Expose battery service as a separate service
- Configuration of refresh time in settings for how often Sense sensors are queried
- Configuration of valve control in settings
- Control valve from HomeKit, if enabled in settings

### Changed

- Lots of refactoring
- Fixed bug where date sorting was using getSeconds() instead of correct getTime()
- Improved fault handling (hopefully)

## [1.0.0] - 2020-08-14

### Added

- Initial version

