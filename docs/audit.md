# Map Block for Yandex 2.0: release audit

Audit date: 2026-08-21  
Audited release: 2.0.0  
Free plugin status: release candidate  
PRO status: architecture only; no PRO implementation is shipped

## Executive result

Version 2.0 is a ground-up modernization of the original 2018 block. The Free
plugin now has a metadata-registered dynamic Gutenberg block, Yandex Maps
JavaScript API v3 runtime, multiple independent map instances, structured
markers, bounded client-side clustering, responsive container controls,
privacy controls, English source strings and a bundled Russian translation.

The Free plugin is suitable for ordinary editorial maps with at most 1,000
inline markers per block. It does not claim to be a million-row store locator.
Templates, store-locator cards, server-side queries, FacetWP integration and
licensing remain deferred to a separately distributed PRO add-on after the
proposed V1 contracts are implemented and contract-tested.

## Delivery matrix

| Area | Release status |
| --- | --- |
| Any number of map blocks per page | Implemented; every render gets an independent runtime ID and controller |
| Gutenberg Block API v3 | Implemented through `block.json`, `useBlockProps` and a dynamic render callback |
| Current iframe editor model | Implemented with owner-document/owner-window runtime isolation |
| Theme/style isolation | Implemented with a Custom Element, Shadow DOM and allow-listed Yandex stylesheet mirroring |
| Editor preview interaction | Locked to inspector controls; no pointer gestures, map-click placement or marker dragging |
| Live editor updates | Implemented without recreating the SDK or `YMap` instance for ordinary inspector changes |
| Responsive/theme-neutral container | Implemented with WordPress block supports and logical CSS properties |
| Map camera, behavior, appearance and controls | Implemented with bounded, allow-listed core settings |
| Markers and clustering | Implemented for a hard maximum of 1,000 inline markers per block |
| Legacy 1.x maps | Server render restoration plus editor deprecation/migration implemented |
| English and Russian | Implemented; English source, complete `ru_RU` PO/MO and editor JSON |
| REST map-data API | Not present in Free 2.0; intentionally deferred |
| Custom SQL tables | Not present in Free 2.0; intentionally deferred |
| Templates and inheritance | PRO design only |
| Store locator, cards and FacetWP | PRO design only |
| Million-row sources | PRO provider architecture only; no browser-side million-marker claim |
| Licensing and vendor updates | PRO design only; Free contains no license client or updater |

## Architecture

- `yamap-block-gutenberg.php` is a small compatibility-aware composition root.
- `GuYaMap\Plugin` coordinates independently testable Settings, Block and
  normalization services.
- `Map_Block` owns metadata registration, editor bootstrap data and the dynamic
  HTML/JSON boundary.
- `Config_Normalizer` is the authoritative server-side allow-list and enforces
  ranges, types, size limits and legacy conversion.
- The editor uses WordPress packages and stores serializable provider-neutral
  attributes.
- The frontend is an imperative, disposable controller rather than one React
  tree per map.
- The Yandex loader is shared once per stable SDK realm. Frontend documents use
  their own realm; Gutenberg's `blob:` canvas deliberately uses its direct
  wp-admin parent so Yandex receives the domain Referer required by restricted
  API keys.
- Each map lives in a `guyamap-map-view` Shadow DOM surface. Plugin CSS and
  trusted Yandex runtime CSS are mirrored into that surface; theme CSS is not.
- The editor preview is inert and pointer-disabled. Inspector changes flow
  through a serialized update controller that preserves the `YMap` instance.
- The current `Feature_Provider_Interface` is only a small bootstrap seam. The
  query-oriented V1 registry and DTOs in `architecture.md` are explicitly
  proposed contracts, not public 2.0 API claims.

## Gutenberg and WordPress compatibility

- The existing block name `gutenberg-yandex-block/map` is retained so old post
  content does not become an unknown block.
- `apiVersion: 3`, metadata asset declarations, block supports and server-side
  rendering replace the legacy global enqueue and old editor APIs.
- Editor code uses current `@wordpress/block-editor` components and does not
  depend on the removed `wp.editor` surface.
- Editor DOM nodes, timers and events derive from `element.ownerDocument` and
  `defaultView`. Only the SDK request/state lives in the direct wp-admin parent
  because Chromium sends no Referer for a script loaded from Gutenberg's
  `blob:` document. SDK styles from that parent are allow-listed and mirrored
  into the editor map's shadow root.
- The preview does not register map-click or marker-drag handlers and supplies
  an empty behavior set to Yandex, so editing is exclusively inspector-driven.
- A dynamic renderer permits global settings and trusted filters to change
  without resaving every post.
- Classic and block themes receive the same isolated wrapper. The plugin does
  not depend on theme-specific container classes.
- Minimum versions are WordPress 6.6 and PHP 7.4. The integrated WordPress
  smoke suite passed on PHP 7.4.33 and PHP 8.2.12. The real-SDK Playwright smoke
  passed against the local WordPress 7.1 Gutenberg editor and its iframe canvas.

## Security review

### Persisted and rendered data

- Block attributes and global settings are normalized again on the server;
  `block.json` validation is not treated as a security boundary.
- Embedded configuration is emitted in a non-executable
  `application/json` element with `wp_json_encode()` and all four JSON hex
  flags.
- Marker text is plain text. Runtime DOM uses `textContent`, not user-controlled
  `innerHTML`.
- Marker and fallback URLs are restricted to safe HTTP(S) URLs before use.
- Arbitrary callbacks, PHP, JavaScript and unbounded HTML are not persisted.
- Structured customization and extension bags cap nesting depth, items, keys
  and string lengths. Prototype keys such as `__proto__`, `prototype` and
  `constructor` are rejected in PHP and JavaScript.
- Duplicate marker IDs are made deterministic and unique at both boundaries.
- Inline markers have a non-bypassable core ceiling of 1,000 and the complete
  render configuration has a 1 MiB byte ceiling. Trusted PHP filter output is
  normalized again; verbose marker tails are truncated to the byte budget.
- Behavior filters may only reduce the core allow-list.

### WordPress administration

- Settings use the Settings API, `manage_options`, normal WordPress nonces and
  narrow sanitizers.
- The API key is correctly treated as a public browser credential, never as a
  server secret. Documentation instructs administrators to apply HTTP Referer
  restrictions.
- Privacy-policy helper content declares the Yandex network transfer and is
  passed through `wp_kses_post()` after the extension filter.
- The Free plugin contains no analytics, license-server request, remote updater
  or automatic PRO installer.

### REST, SQL and uploads

Free 2.0 registers no custom REST endpoint, owns no custom table and accepts no
upload/import source. Therefore there is currently no REST authorization,
custom SQL injection, SSRF or import parser surface to audit. The proposed PRO
architecture specifies capability checks, complete schemas, prepared provider
queries, bounded filters, revisioned imports and SSRF controls; those controls
must be audited again when implemented.

## Performance review

- Frontend assets are declared by block metadata and are not globally enqueued.
- The Yandex SDK is requested only when a rendered map approaches the viewport,
  or after a click when click-to-activate is enabled.
- A resolved stable SDK realm shares one promise while each block keeps an
  independently disposable controller.
- The clusterer chunk is loaded only for clustered frontend maps.
- The heavy Yandex default UI package was removed. Native lightweight controls
  and local marker artwork preserve keyboard behavior without that dependency.
- Marker search in the editor materializes at most 100 visible results.
- Configuration, customization, extension bags and text fields all have hard
  bounds.
- The 2.0 production build produced approximately 57.9 KiB editor JavaScript,
  28.9 KiB frontend JavaScript and a 5.23 KiB lazy clusterer chunk, excluding
  the remote Yandex SDK.
- Real Chromium/Playwright smoke tests verify two simultaneous maps in Gutenberg
  and on the public page, Shadow DOM style isolation, successful Yandex SDK
  rendering, an inert editor surface, blocked drag/wheel camera input, and live
  inspector zoom updates without replacing the `YMap` instance.

This is not evidence that one million objects should be sent to a browser.
Large future sources require viewport/tile queries, server-side clusters,
bounded responses and virtualized cards.

## Accessibility and privacy

- Interactive markers use native buttons with accessible labels and popup
  state; passive markers do not add hundreds of keyboard tab stops.
- Zoom, geolocation and fullscreen controls have translated accessible names
  and visible focus treatment.
- Reduced-motion preferences are respected.
- Every map retains a semantic region and a normal Yandex Maps fallback link.
- Click-to-activate allows a site owner to defer the Yandex network request
  until visitor interaction.
- The readme and WordPress privacy guide disclose the API key, IP address, user
  agent, referrer, geolocation flow and optional external marker-image host.

## Internationalization

- Runtime, PHP and editor source strings use the plugin slug text domain
  `yamap-block-gutenberg`.
- The Russian catalog contains 179 translated messages with zero untranslated,
  fuzzy or obsolete entries.
- PHP uses the bundled MO file and the editor uses the WordPress script-JSON
  naming convention for `build/index.js`.
- Public API identifiers, block names, option names and legacy hooks remain
  untranslated and stable.

## Verification record

The release candidate passed:

- `npm run lint:js`;
- `npm run lint:css`;
- Jest: 4 suites, 23 of 23 tests;
- WordPress Coding Standards and PHPCompatibility: 8 of 8 PHP files;
- PHP syntax checks on PHP 7.4.33 and PHP 8.2.12;
- the real WordPress registration/render/security/legacy smoke suite on both
  PHP versions;
- production webpack build;
- `npm audit --omit=dev`: zero production vulnerabilities;
- Composer production audit: no production packages;
- real Chromium Gutenberg smoke with the live Yandex SDK, two maps, pointer
  lock and inspector-driven live updates on the test WordPress site.

The packaged `yamap-block-gutenberg.zip` contains 325 files, including the main
plugin file, production assets, 278 local icon/license files, readable JS/SCSS
source, translations, documentation, `package.json` and `package-lock.json`.
Its archive integrity test passed. Official Plugin Check 2.1.0, in update mode
with experimental and low-severity checks enabled, reported zero errors and
four accepted warnings: the historical slug, the bundled-MO loader and the two
scoped `serialize_precision` calls documented below.

## Known limitations and release decisions

1. The configured Yandex JavaScript API v3 key successfully returned the real
   loader and its current stylesheet metadata during the audit. The in-app
   browser session was unavailable for this change, so the successful SDK path
   is covered by DOM/runtime integration tests and a final visual real-SDK
   browser smoke remains a publisher release step.
2. The existing plugin directory slug contains `gutenberg`. It is retained to
   preserve the old plugin/update identity. WordPress.org Plugin Check flags the
   trademark in that slug; an entirely new directory submission must resolve
   the acceptable slug with the Plugins Team rather than silently changing an
   installed plugin's identity.
3. `load_plugin_textdomain()` is intentionally retained to make the bundled
   Russian MO file work outside WordPress.org language packs. Plugin Check
   discourages this call for directory-hosted translations, but it is a
   compatibility warning rather than a runtime or security failure.
4. JSON encoding temporarily sets `serialize_precision=-1` and restores the
   exact previous value in `finally`. Plugin Check warns about `ini_set()`. The
   scoped operation prevents host-level precision overrides from expanding
   coordinates and does not leave process state changed.
5. The complete development dependency tree currently contains transitive
   advisories inside `@wordpress/scripts`; the production dependency audit is
   clean and there is no safe non-breaking automated upgrade for those
   development-only paths.

## PRO and licensing conclusion

The WordPress.org Free plugin must remain complete GPL-compatible software. It
must not contain local premium implementation code that is merely hidden behind
a license check, must not obfuscate readable source, and must not install or
update a separately sold add-on from the directory package.

The defensible commercial structure is a separate GPL-compatible PRO add-on,
distributed outside WordPress.org. Its license can control authenticated
downloads, vendor updates, support and a substantive hosted geo/search service.
It cannot make already downloaded PHP impossible for the site owner to modify.
Existing public maps must continue rendering during a license outage or after
PRO is disabled.

Before PRO implementation begins, Free must first ship and contract-test the
typed query registry, provider-neutral DTOs, stable browser events and REST
envelopes listed in `architecture.md`. FacetWP support must remain bounded to
its honest WordPress-scale profile; arbitrary one-million-row FacetWP filtering
on ordinary WordPress/MySQL is not a credible product promise.
