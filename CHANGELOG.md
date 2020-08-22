# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2020-08-22

### Added

- A LeakSensor service has been added to each Sense / Sense Plus
- Notification messages are always printed as warnings to the log until they have been read in the Sense App
- Configured threshold limits are printed to the log in debug mode

### Changed

- Improved error logging a bit if server responded with unknown response

## [Released]

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

