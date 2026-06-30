# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.3.2] - 2026-06-30

### Fixed

- Fixed a `TypeError: Cannot read properties of undefined (reading 'date')`
  logged for a Sense / Sense Plus when the sensor returns no measurements (e.g.
  it has been offline or its battery is dead). The empty result is now handled
  gracefully with a clear warning, and the temperature/humidity services are
  marked inactive until the sensor reports again.

## [2.3.1] - 2026-06-30

### Changed

- Branding/metadata only (no functional changes): expanded the npm `keywords`
  (grohe, ondus, sense, blue, red, water, leak, etc.) and updated the Homebridge
  UI config `headerDisplay` so the plugin reflects the full Sense / Sense Plus /
  Sense Guard / Blue / Red family instead of just Sense. Fixed a stale config
  schema wiki link that still pointed at the old `homebridge-plugin-ondus` repo.

## [2.3.0] - 2026-06-30

### Changed

- The experimental Grohe Red now sends the same full dispense command object as
  the (confirmed-working) Blue, and shares the single `blue_control` /
  `blue_amount_ml` settings - removing an unused `red_amount_ml` fallback - so
  the two stay in sync. (Red remains experimental/unverified; the type id is
  still a best-effort guess.)

- Reduced Grohe Blue/Red log noise now that the Blue is validated: the verbose
  startup diagnostic dump is gated behind `shtf_mode` (instead of always logging
  the dashboard appliance at info on every restart), and the per-dispense API
  response is logged at debug rather than info. The `=> CO2/Filter` status line
  is unchanged, matching the Sense/Guard status logging. The experimental Red
  handler now mirrors the Blue's logging (shtf-gated diagnostic dump, debug-level
  dispense, and a `=> Filter` status line) to keep the two in sync.

### Documentation

- README now documents Grohe Blue (confirmed working) and the experimental Red,
  including the `blue_control` / `blue_amount_ml` settings, and refreshes the
  device image assets. Added RELEASEFLOW.md describing the dev/test/release
  process (publishing via npm Trusted Publishing / OIDC).

## [2.2.0] - 2026-06-30

### Fixed

- Grohe Blue CO2 and filter levels now read correctly. The consumable levels
  live in `data_latest.measurement`, which the Ondus API only returns from the
  dashboard endpoint - the per-appliance info endpoint omits it for the Blue, so
  the levels previously stayed at their default 100%. CO2/filter (and the
  low/empty + cleaning flags) are now sourced from the dashboard, and the
  startup diagnostic dumps the dashboard appliance object. The same fix is
  applied to the experimental Red scaffold.

- Read handlers no longer block on Ondus API round-trips, which could exceed
  HomeKit's read timeout when the API was slow (e.g. right after a restart) and
  log "This plugin slows down Homebridge ... didn't respond at all". Affected
  handlers now return the cached value immediately and refresh in the
  background, pushing fresh data via `updateCharacteristic`:
  - Leak detection (Sense, Sense Plus and Sense Guard). The leak state is
    already polled in the background, so the read handler now serves the cached
    value instead of fetching notifications inline.
  - Current Temperature (Sense Guard).

## [2.1.5] - 2026-06-29

### Fixed

- Fixed a crash loop on Grohe Blue. The v2.1.3 startup diagnostics probed the
  appliance `.../command` endpoint, which is Sense Guard specific (it returns
  valve state) and the Ondus API answers with `403 Forbidden` for a Blue. A
  genuine HTTP error from that request leaks an unhandled rejection out of the
  `superagent-throttle` layer (it rejects its own internal promise for the
  request, separate from the one we await), which crashed the child bridge even
  though the awaited call was wrapped in `try/catch`. The Blue diagnostics now
  only fetch `getApplianceInfo`, which already contains the `config`, `state`
  and `data_latest.measurement` blocks needed to validate the appliance.

### Changed

- Hardened device discovery: each appliance is now registered inside its own
  `try/catch`, so an unexpected failure constructing one appliance handler is
  logged and skipped instead of aborting discovery of the remaining appliances.

## [2.1.4] - 2026-06-29

### Fixed

- Fixed an unhandled promise rejection that could crash Homebridge when a Grohe
  Blue API endpoint returned an error (e.g. the command endpoint responding with
  403 Forbidden). The diagnostic and unsupported-appliance dumps created all
  their API request promises up front and awaited them sequentially, so a later
  promise could reject before it was awaited. Requests are now created lazily as
  they are awaited so every rejection is handled.

## [2.1.3] - 2026-06-29

### Added

- Grohe Blue diagnostics to speed up validation on real devices: a one-time
  startup dump of the raw `getApplianceInfo` and `getApplianceCommand` payloads
  (logged at info level, no SHTF mode needed), and logging of the dispense
  request and the API response. The missing-measurement case is now a warning
  that lists the available payload keys, so it is clear from a normal log
  whether the CO2/filter levels are sourced from the right endpoint.

## [2.1.2] - 2026-06-29

### Fixed

- Fixed a crash ("Cannot read properties of undefined (reading 'forEach')")
  during appliance registration for Grohe Blue (and Red). These appliances do
  not expose a `config.thresholds` array like the Sense/Guard, so threshold
  parsing now safely skips appliances without configured thresholds instead of
  throwing and aborting registration.

## [2.1.1] - 2026-06-28

### Added

- Recognize notification category 20 / type 92 ("Pressure test was not possible
  due to normal water usage during last two nights") instead of logging it as an
  unknown notification.

## [2.1.0] - 2026-06-28

### Added

- Grohe Blue support (Blue Home, type 104, and Blue Professional, type 105). Each
  Blue appliance is exposed with three momentary "dispense" buttons (Still,
  Medium, Sparkling) plus a CO2 level (shown as a Battery) and a water filter
  level (shown as a Filter Maintenance service). A button press pours the
  configured amount of water and the appliance stops on its own.
- New `blue_control` option (default on) to enable/disable dispensing from
  HomeKit, and `blue_amount_ml` (default 250 ml) to set how much water each
  button press dispenses.
- Experimental, untested Grohe Red scaffold (a momentary hot-water button plus a
  filter level). The Red appliance type id and command shape are unverified, so
  it logs a clear warning and is isolated so it cannot affect other appliances.
  Red owners are asked to share debug logs so it can be implemented properly.

### Fixed

- Grohe Blue Professional (type 105) was previously mis-identified as a Grohe Red
  and reported as an unsupported appliance. Both 104 and 105 are now correctly
  handled as Grohe Blue.

## [2.0.1] - 2026-06-21

### Fixed

- Fixed the Sense Guard valve (and companion switch) staying stuck on the Home
  app "Waiting..." spinner after toggling. The `onSet` handlers no longer await
  the slow Ondus valve actuation / cloud round-trip; the UI is updated
  optimistically and the command runs in the background, reverting only if it
  fails. Tapping the valve while `valve_control` is disabled now snaps the tile
  back to the real state immediately instead of spinning.

## [2.0.0] - 2026-06-21

This is a major release that makes the plugin fully compatible with Homebridge v2
and modernizes the codebase. Homebridge v2 requires Node.js 22 or 24.

NOTE: After updating, it is recommended to remove the cached Grohe accessories via
the Homebridge UI (or remove and re-add the bridge in the Home app) so the updated
services and characteristics are picked up cleanly.

### Added

- Homebridge v2 support. Updated engines to `node: ^22 || ^24` and
  `homebridge: ^1.6 || ^2`.
- Leak automations now work: appliance notifications are polled in the background
  and the `LeakDetected` characteristic change is pushed to HomeKit, so a leak can
  trigger Home app automations (e.g. announce on a HomePod). Note: Apple's Home app
  hides leak sensors from the global automation picker, so create the automation
  from the sensor's own device page.
- The Sense Guard valve is now also exposed as a companion Switch when
  `valve_control` is enabled, because Apple's Home app cannot use a Valve service in
  automations. Use the switch to e.g. shut the water off when the last person leaves.
- Diagnostic logging for unsupported appliance types (e.g. Grohe Blue/Red) dumps the
  raw Ondus API payloads so owners can share them in a GitHub issue.
- Notification category 20 / type 91 ("Guard is offline") is now recognized.
- Automated npm publish GitHub Actions workflow and a Homebridge v2-ready README badge.

### Changed

- Migrated the project to native ECMAScript Modules (ESM).
- Modernized all characteristic handlers from the deprecated `.on('get'/'set')`
  callbacks to promise-based `onGet()`/`onSet()`.
- Marked `LeakSensor` as the primary service on Sense/Sense Plus, and the valve as
  the primary service on the Sense Guard.
- Upgraded the toolchain: TypeScript 5.x, ESLint 9 (flat config), and updated CI to
  build on Node 22/24.

### Fixed

- Fixed the Sense Guard valve and companion switch lagging and getting stuck on the
  "Waiting..." animation. State is now served from cache instantly, refreshed in the
  background, kept in sync across the valve and switch, and `InUse` always mirrors
  `Active`. Commands update optimistically and revert if they fail.
- The valve state is now fetched at startup even when Eve history support is enabled
  (previously skipped) and refreshed periodically so changes made in the Grohe app
  propagate to HomeKit.
- Bumped `fakegato-history` to 0.6.7, fixing a crash on Homebridge v2 caused by the
  removal of the deprecated `Characteristic.Formats`.
- Updated the `cheerio` import for ESM compatibility, fixing a plugin load failure.
- Renamed `Service.BatteryService` to `Service.Battery` for HAP-NodeJS v2.
- Resolved all reported `npm audit` vulnerabilities.

## [1.5.2] - 2024-04-05

### Added

- Fixed bugs when parsing notifications, including ignoring is_read
  messages from the Ondus API. I believe Ondus API has changed behavior
  here, so be warned that the homebridge-grohe-sense adaption might 
  not be accurate ...
- Added delay for valve status update to improve Home app rendering
  when closing and opening the main water valve.
- Added some previously unsupported notification types for Grohe 
  Blue/Red and for Grohe Sense.

## [1.5.1] - 2024-03-27

### Added

- Adapted code to Grohe REST API changes
- Made throttling enabled by default, because a change in superagent 
  throttle caused API queries to pause unless throttling is enabled.
- More debug statements
- Updated dependencies with vulnerabilities as flagged by Dependabot 
- Started on Grohe Blue/Red support

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

