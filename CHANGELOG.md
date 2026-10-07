# Changelog

## [0.9.0](https://github.com/12rambau/earthengine-extension/compare/v0.8.0...v0.9.0) (2026-10-07)

### Features

- add cleanup logic for failed uploads and improve bucket selection prompt ([1312ff2](https://github.com/12rambau/earthengine-extension/commit/1312ff22bcc78a74a819d1466f7172f0a4fe363d))
- add preset visualization parameters and examples to interactive map documentation ([b3c2183](https://github.com/12rambau/earthengine-extension/commit/b3c2183db20df5cb5997b16caeaca7d731f43d6b))
- add support for interval scales ([a29cb05](https://github.com/12rambau/earthengine-extension/commit/a29cb05567e25e884b5f255c255f3075c7bae599))
- add the capacity to load featurecollections and image ([8cd0255](https://github.com/12rambau/earthengine-extension/commit/8cd0255ed1d5735cb6dae459261e377d6ebd9757))
- ajouter examples for viz parameters ([1c32724](https://github.com/12rambau/earthengine-extension/commit/1c32724fe8534cd987e6cf6489d274ceaca49544))

### Bug Fixes

- add python to the container ([6ccc4b8](https://github.com/12rambau/earthengine-extension/commit/6ccc4b8d3dd2b026b6e20020d9ba4d604af0871f))
- drop the temp files ([b5e0459](https://github.com/12rambau/earthengine-extension/commit/b5e04593a852a0cfdbad4e35c7ab9360b6df6d3e))
- removed ignored files ([db5be15](https://github.com/12rambau/earthengine-extension/commit/db5be15528b406b4765f2a3f12e0a0cc98c93e8d))
- typos ([c56e386](https://github.com/12rambau/earthengine-extension/commit/c56e386557bd28bf0cb96f1a3b70727f7d71c371))
- use compact trash buttons in palette legends ([73a70be](https://github.com/12rambau/earthengine-extension/commit/73a70be55fd5545c8ea768c545eaaf5ec96da63a))

## [0.8.0](https://github.com/12rambau/earthengine-extension/compare/v0.7.0...v0.8.0) (2026-10-02)

### Features

- add a custom color picker ([ed16342](https://github.com/12rambau/earthengine-extension/commit/ed163428e244f7acdcf9f45d3ea29e979e9a0b88))
- add detailed styles for planLight and planDark map types ([9a1d3da](https://github.com/12rambau/earthengine-extension/commit/9a1d3da83260a3e914f7127d1236042b84c2d9bc))
- add hex color input functionality for continuous color palettes ([2960b3f](https://github.com/12rambau/earthengine-extension/commit/2960b3f639fa98085f2d5fa61159ef3f1e73f687))
- add hex ntry to the classified menu ([9ee9851](https://github.com/12rambau/earthengine-extension/commit/9ee985185acd84f7b8a66003f763d90c393e8383))
- add MapLayerControl component for layer management ([e4f1ed7](https://github.com/12rambau/earthengine-extension/commit/e4f1ed7d1dac97ef0f2e2eddbeb23db443f91fcc))
- add viewport tracking functionality for popups and menus ([9d690fe](https://github.com/12rambau/earthengine-extension/commit/9d690fef00a6e72824c89b0d3361cb6ff895d2d4))
- create a dedicated mapbutton ([d29a648](https://github.com/12rambau/earthengine-extension/commit/d29a648140a0cdb5d807a1caaa76a535163fcf54))
- use a json to set default map color ([7c52277](https://github.com/12rambau/earthengine-extension/commit/7c522775cdca4c1ec42b45105f614d0bdc3573d4))
- use crosshair cursor for pointing ([ce94f6a](https://github.com/12rambau/earthengine-extension/commit/ce94f6a8a5075cf465ef4c8629653acf92250ef4))

### Bug Fixes

- correct layer manager opacity slider range (0-10 to 0-100) ([57874ca](https://github.com/12rambau/earthengine-extension/commit/57874ca7bca9a2d669d4b6da6d3e52c07a1a0319))
- skip hidden layers in map inspector ([c70d388](https://github.com/12rambau/earthengine-extension/commit/c70d38875465692a491d2edc359bef18530236e4))

## [0.7.0](https://github.com/12rambau/earthengine-extension/compare/v0.6.11...v0.7.0) (2026-09-30)

### Features

- add a marker to the inspector ([67b8ef2](https://github.com/12rambau/earthengine-extension/commit/67b8ef25997998c6cce3bfff5afe6bb28eb85d5e))
- add code snipet for viz params ([bdb6f0f](https://github.com/12rambau/earthengine-extension/commit/bdb6f0f50100d9f86d6d5d207972a2c6f3e2fae4))
- add fallback basemaps and enhance map attribution handling ([10a8764](https://github.com/12rambau/earthengine-extension/commit/10a8764f60318daf61f4f78c0776c27c60282f4a))
- add gamma control ([5e76dfb](https://github.com/12rambau/earthengine-extension/commit/5e76dfbe2cc0ed880422f299fcffa2fdb087e1e2))
- add stretch options ([13a178b](https://github.com/12rambau/earthengine-extension/commit/13a178bfcc485de9e756f9481689c756afbc93c4))
- add the palette management ([3109860](https://github.com/12rambau/earthengine-extension/commit/3109860143238e74e95e3c0be110239086ffc183))
- ajouter la gestion de l'opacité des couches dans le panneau de carte ([42239de](https://github.com/12rambau/earthengine-extension/commit/42239de61bde5754174a5c844a79980192e48d1e))
- improve color management ([b03fcc0](https://github.com/12rambau/earthengine-extension/commit/b03fcc0f5c553b387ec78b9ac57bdfaabe87e6db))
- manage color palette ([484e3bc](https://github.com/12rambau/earthengine-extension/commit/484e3bcfc59b3ae3c54fc09880d27198ae5fe74c))
- **map:** add layer removal controls ([206f8d0](https://github.com/12rambau/earthengine-extension/commit/206f8d00e2235ae09e413ce5759ab709b5227a98))

### Bug Fixes

- add slider uniformisation ([d79c08d](https://github.com/12rambau/earthengine-extension/commit/d79c08db7983b235e0fbdf0cb6781b7079a89b7e))
- enhance layer opacity slider styling and functionality ([d3157d5](https://github.com/12rambau/earthengine-extension/commit/d3157d56bc1938829dc73f91f69248248206dc3c))
- improve attribution handling and optimize session creation in MapTilesService ([77a990f](https://github.com/12rambau/earthengine-extension/commit/77a990fbddc1b478f110ccac2ce7f1e8556e50a9))
- make map tools mutually exclusive ([d2e34f6](https://github.com/12rambau/earthengine-extension/commit/d2e34f6a00633e91a45a7b346cab8ed627b47d9a))
- show layer when selecting scale ([90a0ad3](https://github.com/12rambau/earthengine-extension/commit/90a0ad3a45fdd3ce0ac36545bd4fe4dc8592f71f))
- update @google/earthengine dependency to version 1.7.46 ([9f11bb0](https://github.com/12rambau/earthengine-extension/commit/9f11bb02f04465f9e79d2000847e7b03f4e13fc5))
- update layer visibility and opacity handling in MapPanel and MapLayerManager ([16832d1](https://github.com/12rambau/earthengine-extension/commit/16832d162bf9197ee2198dffc79a247391088641))
- use the google map ([5f1aa32](https://github.com/12rambau/earthengine-extension/commit/5f1aa32f9b40753e16c404225cc8489970c84151))

## [0.6.11](https://github.com/12rambau/earthengine-extension/compare/v0.6.10...v0.6.11) (2026-09-23)

### Bug Fixes

- use baseurl in the docs ([b66635f](https://github.com/12rambau/earthengine-extension/commit/b66635f3e57805f6dc9120b0fd3ea18bc7ecc2df))

## [0.6.10](https://github.com/12rambau/earthengine-extension/compare/v0.6.9...v0.6.10) (2026-09-23)

### Bug Fixes

- sync lockfile during release ([b6ef916](https://github.com/12rambau/earthengine-extension/commit/b6ef916f10f1964633cfa822fa35f95f5afecf6e))

## [0.6.9](https://github.com/12rambau/earthengine-extension/compare/v0.6.8...v0.6.9) (2026-09-23)

### Bug Fixes

- add computeUsageCompare function for accurate sorting of compute usage ([2927f91](https://github.com/12rambau/earthengine-extension/commit/2927f916f96d883cde3ef757aa0b1ac79d3c9fd5))
- add some screenshots ([df80419](https://github.com/12rambau/earthengine-extension/commit/df8041936f30adebb7fbf98ad8a23e1ee1cd2f83))
- add unit-aware duration filter kind for the Duration column ([12f2680](https://github.com/12rambau/earthengine-extension/commit/12f268019e7b761f26c392ef1933324b71d6421f))
- **assets:** make asset type filter a multi-select ([6664977](https://github.com/12rambau/earthengine-extension/commit/6664977f5c4a10280b41b7d22667b6e19c99ce67))
- hide the keys by default ([54aea66](https://github.com/12rambau/earthengine-extension/commit/54aea66966127be9c2645f12d9a75f62629465fd))
- update computeUsage accessor for accurate filtering and display ([09b9464](https://github.com/12rambau/earthengine-extension/commit/09b9464abcdedda4171980104e301f748fb908c8))
- update packages ([485454b](https://github.com/12rambau/earthengine-extension/commit/485454b05e1407a518855be9990b69fc2c00e6c0))
- **webview:** make datepicker filter theme responsive ([2e4a993](https://github.com/12rambau/earthengine-extension/commit/2e4a993e8b3369a7402bfcf6b5ff35c3add634db))

## [0.6.8](https://github.com/12rambau/earthengine-extension/compare/v0.6.7...v0.6.8) (2026-09-15)

### Bug Fixes

- split vsx and vscode release ([5d94918](https://github.com/12rambau/earthengine-extension/commit/5d94918578575a19f0442ada53645c6e5815a27f))

## [0.6.7](https://github.com/12rambau/earthengine-extension/compare/v0.6.6...v0.6.7) (2026-09-15)

### Bug Fixes

- drop files from the gitignore ([377c1ad](https://github.com/12rambau/earthengine-extension/commit/377c1ad95bd7ecfaed22948e6411ecc1fcc2de83))
- update release-it after:bump hook to python/ path ([2ece15e](https://github.com/12rambau/earthengine-extension/commit/2ece15edebc81c823a85117755b9c4b9d233ab75))

## [0.6.6](https://github.com/12rambau/earthengine-extension/compare/v0.6.5...v0.6.6) (2026-08-25)

### Bug Fixes

- act on coderabbit comments ([e42c99e](https://github.com/12rambau/earthengine-extension/commit/e42c99e4aa48bf88e586f14c57a8b85bb41a368c))
- add a copy button to preview ([651bc91](https://github.com/12rambau/earthengine-extension/commit/651bc91b1549ea89a2caff5a946a6bb831752240))
- add a third limit to the task loading mechanism ([8bfac98](https://github.com/12rambau/earthengine-extension/commit/8bfac98369cb47c6979ea53bd9d9224d06d08efd))
- add the doumentation of the new parameter ([4ec3914](https://github.com/12rambau/earthengine-extension/commit/4ec39142b6e85f46ad8d08c219b4fc3c59598470))
- display the parent collection in the image preview ([e8ad5d9](https://github.com/12rambau/earthengine-extension/commit/e8ad5d9477997061e7c4bd5903354285cbdb901a))
- filter tasks and assets managers ([056828e](https://github.com/12rambau/earthengine-extension/commit/056828e782ac90ca17faf4fe30be0b22e9317d04))
- invalidate in-flight reuests when historydays changes ([daf128a](https://github.com/12rambau/earthengine-extension/commit/daf128a2580abe384361042d0d109877d4b088f7))
- keep the active task animation after changing the icon element ([4d899ce](https://github.com/12rambau/earthengine-extension/commit/4d899ce1b083eb88efa432c55cb34284dd23a16f))
- use icons for all types of exports ([ef8ca86](https://github.com/12rambau/earthengine-extension/commit/ef8ca8646e931723fa4e42c41c48d57132517720))

## [0.6.5](https://github.com/12rambau/earthengine-extension/compare/v0.6.4...v0.6.5) (2026-08-24)

## [0.6.4](https://github.com/12rambau/earthengine-extension/compare/v0.6.3...v0.6.4) (2026-08-24)

## [0.6.3](https://github.com/12rambau/earthengine-extension/compare/v0.6.2...v0.6.3) (2026-08-24)

## [0.6.2](https://github.com/12rambau/earthengine-extension/compare/v0.6.1...v0.6.2) (2026-08-07)

## [0.6.1](https://github.com/12rambau/earthengine-extension/compare/v0.6.0...v0.6.1) (2026-08-07)

## [0.6.0](https://github.com/12rambau/earthengine-extension/compare/v0.5.0...v0.6.0) (2026-08-03)

## [0.5.0](https://github.com/12rambau/earthengine-extension/compare/v0.4.1...v0.5.0) (2026-07-31)

## [0.4.1](https://github.com/12rambau/earthengine-extension/compare/v0.4.0...v0.4.1) (2026-07-24)

## [0.4.0](https://github.com/12rambau/earthengine-extension/compare/v0.3.1...v0.4.0) (2026-07-24)

## [0.3.1](https://github.com/12rambau/earthengine-extension/compare/v0.3.0...v0.3.1) (2026-07-23)

## [0.3.0](https://github.com/12rambau/earthengine-extension/compare/v0.2.1...v0.3.0) (2026-07-23)

## [0.2.1](https://github.com/12rambau/earthengine-extension/compare/v0.2.0...v0.2.1) (2026-07-22)

## 0.2.0 (2026-07-22)

# Change Log

All notable changes to the "earthengine" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.1.0] — 2026-07-22

### Added

- OAuth2 & service account authentication with multi-profile support
- Asset browser with lazy loading, preview panel, asset manager, and folder creation
- Export & Import task monitor with auto-refresh and cancel
- STAC dataset catalog (Google / Publishers / Community)
- `ee.*` API docs tree with search and rich tooltips
- Interactive Leaflet map panel with Python bridge (`earthengine_vscode_map.py`)
