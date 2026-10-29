# Yandex Maps for Gutenberg

[![Quality](https://github.com/al5dy/yamap-block-gutenberg/actions/workflows/quality.yml/badge.svg?branch=master)](https://github.com/al5dy/yamap-block-gutenberg/actions/workflows/quality.yml)
![PHP 7.4–8.4](https://img.shields.io/badge/PHP-7.4%E2%80%938.4-777BB4?logo=php&logoColor=white)
![WordPress 6.6–7.1](https://img.shields.io/badge/WordPress-6.6%E2%80%937.1-21759B?logo=wordpress&logoColor=white)
![License GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)

Yandex Maps for Gutenberg is a dynamic WordPress block powered by **Yandex Maps JavaScript API v3**. It provides an inspector-driven Gutenberg preview, responsive map layouts, structured markers, bounded client-side clustering, and an imperative frontend runtime isolated from theme CSS.

This repository contains the readable PHP/JavaScript/SCSS source, generated runtime assets, tests, and the tooling that builds and verifies the production plugin. User documentation is in [`readme.txt`](readme.txt).

This is an independent community plugin. It is not affiliated with, endorsed by, or sponsored by Yandex, and it uses the Yandex Maps JavaScript API under Yandex's own [API terms](https://yandex.com/dev/commercial/doc/en/).

## Requirements and compatibility

| Component | Requirement |
| --- | --- |
| WordPress | 6.6 or later; tested through 7.1 |
| PHP | 7.4 or later; CI covers 7.4 and current supported versions |
| Block editor | Block API v3; classic and block themes |
| Yandex service | A JavaScript API v3 browser key and a suitable Yandex plan |
| Development | Node.js 22 in CI (`package.json` allows 18.12+), npm, Composer, WP-CLI; MySQL/MariaDB for disposable integration sites |

The block identifier remains **`gutenberg-yandex-block/map`**. The plugin slug, main file, text domain, `GuYaMap` namespace, `guyamap()` function, options, hooks, and persisted attribute names are stable. The block shown in Gutenberg is **Yandex Map**, not the full plugin name.

## Installation and quick start

1. Install and activate the plugin from WordPress.org or the verified release ZIP.
2. Create a key in the [Yandex Developer Dashboard](https://developer.tech.yandex.ru/) for the Maps JavaScript API v3.
3. Restrict the key by HTTP Referer to the site domains that need maps.
4. Enter the key under **Settings → Yandex Maps** and use **Check API key**.
5. Insert **Yandex Map** and configure it in the block inspector.

Browser API keys are public by design: they are delivered to the browser and embedded in SDK requests. They must not be treated as server secrets. HTTP Referer restrictions, separate staging keys, and appropriate Yandex quotas are the relevant controls. `GUYAMAP_YANDEX_API_KEY` can override the saved key in `wp-config.php`; `guyamap_yandex_api_key` and `guyamap_yandex_language` provide setting filters.

## Key technical features

- Metadata-driven dynamic block with server-side normalization and rendering.
- Live, gesture-locked editor preview that preserves the `YMap` instance during ordinary inspector changes.
- Center, zoom range, tilt, azimuth, map mode, theme, behaviors, margins, restricted area, copyright and zoom options.
- Responsive width, height, minimum height, aspect ratio, wide/full alignment, and WordPress block supports.
- Multiple independent maps per page and per document realm.
- Structured markers with local preset icons, custom HTTP(S) images, popups, hints and safe links.
- Optional grid clustering loaded as a lazy chunk.
- Viewport-based lazy initialization, click-to-activate privacy mode, and configurable preloaders.
- Accessible controls, keyboard-focus hints, reduced-motion handling, fallback links and administrator diagnostics.
- Compatibility with legacy 1.x blocks and existing 2.0 content.

## Block metadata and serialization

[`src/block.json`](src/block.json) is the source metadata; webpack copies it to [`build/block.json`](build/block.json). PHP registers exactly one block from `build/` — falling back to `src/` only in a source checkout, never in a release ZIP — with a dynamic render callback in [`includes/Block/Map_Block.php`](includes/Block/Map_Block.php).

Attributes are serialized by Gutenberg in the block comment; the save function returns `null`. The principal fields are:

| Attribute group | Persisted data |
| --- | --- |
| Viewport | `center`, `zoom`, `zoomRange`, `camera` |
| Container | `width`, `height`, `minHeight`, `aspectRatio`, WordPress supports |
| Appearance | `mapMode`, `theme`, bounded `customization` rules |
| Interaction | allow-listed `behaviors`, `controls`, bounded `mapOptions` |
| Features | `markers`, `cluster` |
| Loading | `loading.lazy`, `rootMargin`, `clickToActivate`, `loading.preloader` |
| Accessibility | `ariaLabel`, `fallbackText` |
| Extension seams | `schemaVersion`, `templateId`, `overrides`, `extensions` |
| Legacy input | `lat`, `lon`, `pm_*`, `has_placemark`, `blockAlignment` |

[`Config_Normalizer`](includes/Support/Config_Normalizer.php) is the authoritative server-side validation boundary. It revalidates filter output, strips unknown fields and unsafe URLs, rejects prototype-sensitive keys, deduplicates marker IDs, caps inline markers at 1,000, and limits rendered configuration to approximately 1 MiB. Marker text remains text; arbitrary HTML and JavaScript callbacks are not persisted.

[`src/deprecated.js`](src/deprecated.js) migrates legacy editor content, while the PHP renderer also restores old `data-params` values. Rendering old content does not require resaving it.

## Editor architecture

[`src/edit.js`](src/edit.js) and [`src/components/`](src/components/) use WordPress React packages. Inspector panels cover viewport, container, appearance, behaviors, controls, advanced options, markers, clustering, loading and accessibility.

[`MapPreview`](src/components/MapPreview.js) mounts the same runtime used on the frontend. The preview is inert and receives no map behaviors: markers are positioned by coordinates in the inspector, not by clicking or dragging. Configuration updates are serialized and coalesced in [`src/runtime/map.js`](src/runtime/map.js); map and layer entities use `update()`, while marker and control entities are reconciled only when their bounded configuration changes.

For the iframe editor, DOM nodes, timers and events belong to the canvas document. Because a `blob:` canvas can omit the HTTP Referer required by a restricted Yandex key, the direct wp-admin parent can own the SDK request and loader promise instead.

## Frontend architecture

The dynamic renderer emits a wrapper, a `guyamap-map-view` host, non-executable `application/json` configuration, an optional preloader and a no-JavaScript fallback. [`src/view.js`](src/view.js) initializes only rendered blocks and exposes `window.guyamap.refresh()` and `window.guyamap.destroy()`.

Each block owns a disposable controller. The runtime removes map entities, listeners, timers and observers on teardown. The global frontend object does not contain a React tree or a separate SDK per block.

### Web Components and Shadow DOM

[`src/runtime/map-element.js`](src/runtime/map-element.js) upgrades `guyamap-map-view` with an open shadow root. Only the compiled plugin stylesheet and allow-listed Yandex stylesheets from `yastatic.net` are mirrored there; arbitrary theme styles are not. A light-DOM fallback remains available when Custom Elements or Shadow DOM are unavailable.

### Shared API loader and conditional assets

[`src/runtime/api-loader.js`](src/runtime/api-loader.js) shares one Yandex SDK promise per resolved document realm and clears failed loads for retry. Block metadata declares editor and view assets, so the plugin does not enqueue its map runtime site-wide. The Yandex SDK loads only when a map initializes, and the clusterer chunk loads only when clustering is used.

Loader diagnostics distinguish a missing key, rejected key, network failure, Content Security Policy, timeout, unavailable API, generic load failure and render failure. Visitors receive a neutral message and fallback link; administrators additionally receive the cause and a settings link. The settings screen can verify the current key server-side with the site address as Referer.

## Markers, icons and clustering

Markers support coordinates, title, hint, description, category, address, icon type/color/name/size/offset, image URL, viewport visibility, z-index and safe link settings. Interactive markers use native buttons with popup state; passive markers do not create unnecessary tab stops. Hints appear on both hover and keyboard focus.

`assets/icons/` contains the vendored Yandex preset artwork and its license notices. [`scripts/vendor-icons.js`](scripts/vendor-icons.js) verifies every file against the pinned upstream package and SHA-256 provenance record. [`src/icon-manifest.json`](src/icon-manifest.json) drives the searchable editor picker; PHP and the runtime fall back to a bundled icon for an invalid name.

Clustering uses pinned `@yandex/ymaps3-clusterer` with configurable grid size, maximum zoom and color. It is intended for bounded inline editorial data, not unbounded locator datasets.

## Customization and responsive rendering

Customization rules are reduced in both PHP and JavaScript to documented `tags`, `types`, `elements` and `stylers` fields. [`src/runtime/customization.js`](src/runtime/customization.js) shares test fixtures with the server normalizer and reports invalid editor rules before they reach Yandex. Size, depth and item limits apply; raster-style URL length has an explicit editor warning.

The outer layout uses WordPress block supports. Map dimensions and aspect ratio are normalized before becoming CSS custom properties. Wide/full alignment, small screens and short-map control placement are covered by browser tests; right-to-left layouts rely on logical CSS properties.

## Lazy loading, accessibility and fallbacks

IntersectionObserver can defer initialization until a configurable preload distance. Click-to-activate defers the Yandex request until an explicit visitor action. Preloaders support spinner, dots and pulse styles, bounded colors/sizes/timing and accessible text.

Map regions have labels, controls are keyboard-operable, popup state is exposed to assistive technology, and reduced-motion preferences disable animation durations. Geolocation runs only after a visitor activates its control and grants browser permission. Errors and the no-JavaScript path retain a Yandex Maps fallback link.

## Public extension points

The plugin currently exposes bootstrap and rendering seams, not a store-locator/query API.

| Hook or API | Purpose |
| --- | --- |
| `guyamap_block_metadata_directory` | Replace the block metadata directory |
| `guyamap_block_registration_args` | Adjust block registration arguments |
| `guyamap_block_registered` | Observe a registration attempt |
| `guyamap_editor_settings` | Adjust public editor settings |
| `guyamap_normalized_map_config` | Filter normalized config before revalidation |
| `guyamap_map_render_config` | Filter render config before revalidation and restoration of server-owned fields |
| `guyamap_rendered_map_html` | Filter final block HTML |
| `guyamap_fallback_url` | Adjust the validated fallback URL |
| `guyamap_normalized_marker` | Filter one marker before revalidation |
| `guyamap_max_inline_markers` | Reduce, never raise, the inline marker ceiling |
| `guyamap_allowed_behaviors` | Reduce the core behavior allow-list |
| `guyamap_yandex_api_key`, `guyamap_yandex_language` | Adjust public SDK settings |
| `guyamap_sanitized_settings`, `guyamap_locales` | Adjust sanitized settings or supported locale choices |
| `guyamap_privacy_policy_content` | Append sanitized privacy disclosure |
| `guyamap_feature_providers` | Register bootstrap feature providers |
| `guyamap_feature_provider_registered`, `guyamap_feature_providers_registered` | Observe provider initialization |

`guyamap()` returns the plugin coordinator. `guyamap()->register_feature_provider()` accepts the small `GuYaMap\Contracts\Feature_Provider_Interface` bootstrap contract (`get_id()` and `register()`); it is not a data-query contract.

Browser surfaces dispatch `guyamap:ready`, `guyamap:statechange`, `guyamap:error` and `guyamap:destroy`. A `guyamap:refresh` document event initializes new block DOM. Event payloads currently expose runtime controllers and are not a versioned provider-neutral event schema.

## Repository structure

```text
yamap-block-gutenberg.php   Plugin bootstrap and compatibility constants
includes/                  PHP services, block renderer and normalization
src/                       Readable block editor, runtime and SCSS sources
build/                     Generated production assets; tracked for runtime readiness
assets/icons/              Vendored local marker artwork and upstream notices
languages/                 POT, ru_RU PO/MO and editor JSON translations
tests/                     JavaScript, PHP smoke and Playwright suites
scripts/                   Build, audit, packaging, test and release-staging tools
.github/                   Quality/release workflows and dependency ownership
LICENSE, LICENSES/         Plugin and third-party license texts
```

`build/` and `assets/icons/` are intentionally tracked: a fresh clone has a working runtime, while CI still proves that generated assets match a clean build. `vendor/`, `node_modules/`, internal engineering notes, reports and local archives are not distributed in Git.

## Development commands

```bash
composer install
npm ci
npm run build

npm run lint:js
npm run lint:css
composer validate --strict
composer lint
npm run test:unit
npm run icons:check
npm run icons:verify
npm run check:versions
npm run audit:source
```

Build and verify translations after changing user-visible strings:

```bash
npm run i18n:build
npm run i18n:check
```

Run browser tests against a configured WordPress site:

```bash
GUYAMAP_E2E_WP_PATH=/path/to/wordpress npm run test:e2e
GUYAMAP_E2E_BROWSERS=chromium,firefox,webkit npm run test:e2e:browsers
```

The deterministic suites use a mocked Yandex SDK and need no external key. Real-SDK checks are separate and report explicitly when they cannot run; a skipped external check is never counted as an executed pass.

## Build pipeline and automated tests

`wp-scripts build` compiles the editor and frontend bundles, SCSS, block metadata, asset PHP files and the lazy clusterer chunk. `npm run plugin-zip` selects only tracked runtime files under the explicit `package.json` `files` allowlist, rejects untracked files in release paths, validates versions and block metadata, normalizes entry timestamps, and writes `dist/yamap-block-gutenberg-<version>.zip` reproducibly.

```bash
npm run build
npm run plugin-zip
npm run verify:package
npm run test:package
npm run test:plugin-check
```

Verification covers versions and block metadata, source/package parity, forbidden files, translations, icon provenance, PHP syntax, ZIP structure, reproducible rebuilds and SHA-256. Package smoke installs the **ZIP itself** into a fresh WordPress site, activates it, checks exactly one registered block, settings, legacy rendering, frontend configuration and uninstall behavior.

The quality pipeline additionally runs PHP syntax across the support matrix, PHPCS/PHPCompatibility, ESLint, Stylelint, JavaScript unit tests, WordPress smoke tests, deterministic Playwright tests, Plugin Check, source/credential audits and locked dependency audits.

## CI/CD and releases

`.github/workflows/quality.yml` runs on pull requests to `master`, pushes to `master`, manual dispatch, and as a reusable release gate. The protected `master` branch requires the aggregate **Quality Gate** check and resolved review conversations; force-pushes and deletion are disabled. Release tags matching `v*.*.*` are protected by repository rules that forbid deletion and rewrites.

A `vX.Y.Z` tag triggers `.github/workflows/release.yml`. It verifies that the tagged commit belongs to `master`, checks every version source, runs the complete quality workflow, and publishes the exact tested artifact by SHA-256—without rebuilding it for upload.

```bash
bash scripts/release-wordpress-org.sh 2.0.1
```

The release entrypoint validates versions, builds and verifies the ZIP, and prepares `production/trunk/` and `production/tags/2.0.1/` from that one artifact. It never contacts Subversion. Publication is a separate controlled operation performed by an operator against the existing WordPress.org working copy, so previous tags and the WordPress.org page assets are left untouched.

GitHub **Source code** archives contain development source and test infrastructure. The production ZIP attached to a GitHub Release contains only the installable plugin. WordPress.org trunk and its version tag are staged from the same verified production ZIP, not by copying the development directory.

## Versioning and backwards compatibility

The plugin follows semantic release versions. Public identifiers and saved block formats are not renamed for branding. The header version, `GUYAMAP_VERSION`, npm metadata and lockfile root, source/build block metadata, and readme Stable tag must agree.

Existing 1.0.x and 2.0.0 block comments remain supported through editor deprecations and server-side normalization. Release smoke covers old content without requiring a save, editor migration and repeated rendering.

## Third-party licenses

The plugin is licensed under [GPL-3.0-or-later](LICENSE). Bundled production code and marker artwork retain their Apache-2.0 notices in [`third-party-notices.txt`](third-party-notices.txt), [`LICENSES/`](LICENSES/) and [`assets/icons/`](assets/icons/). Readable source and reproducible build instructions remain publicly available here.

## Privacy and external services

Interactive maps require Yandex. SDK requests go to `https://api-maps.yandex.ru/v3/` with the public browser key and locale; Yandex receives normal request data such as IP address, user agent and referrer. Tiles and interactions can make further Yandex requests. The Yandex SDK can send its own diagnostics to `https://log.api-maps.yandex.ru`.

Server-side key verification uses the same fixed endpoint and site Referer. External marker-image hosts receive browser requests only when an editor configures such an image. Geolocation requires an explicit visitor action and browser permission. The plugin has no analytics, license-server calls or remote updater.

See the [Yandex Maps JavaScript API documentation](https://yandex.com/maps-api/docs/js-api/), [API terms](https://yandex.com/dev/commercial/doc/en/), [Yandex privacy policy](https://yandex.com/legal/confidential/en/), and the user-facing [external-services disclosure](readme.txt).
