# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] -

### Added

- Auth using username and password
- Refresh token automatically renewed once it expire
- Expose battery service as a separate service
- Configuration of refresh time in settings for how often Sense sensors are queried
- Configuration of valve control in settings
- Control valve from HomeKit, if enabled in settings

### Changed

- Lots of refactoring
- Fixed bug where date sorting was using getSeconds() instead of correct getTime()
- Improved fault handling (hopefully)

## [Released]

## [1.0.0] - 2020-08-14

### Added

- Initial version

