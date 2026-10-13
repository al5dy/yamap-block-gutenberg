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
- The 2.0 production build produced approximately 62.1 KiB editor JavaScript,
  30.2 KiB frontend JavaScript and a 5.23 KiB lazy clusterer chunk, excluding
  the remote Yandex SDK.
- Real Chromium/Playwright smoke tests verify two simultaneous maps in Gutenberg
  and on the public page, Shadow DOM style isolation, successful Yandex SDK
  rendering, an inert editor surface, blocked drag/wheel camera input, live
  inspector updates without replacing the `YMap` instance, optional preloader
  presentation, and standard/wide/full width geometry without horizontal overflow.

This is not evidence that one million objects should be sent to a browser.
Large future sources require viewport/tile queries, server-side clusters,
bounded responses and virtualized cards.

## Accessibility and privacy

- Interactive markers use native buttons with accessible labels and popup
  state; passive markers do not add hundreds of keyboard tab stops.
- Zoom, geolocation and fullscreen controls have translated accessible names
  and visible focus treatment.
- Reduced-motion preferences are respected.
- Every map retains a semantic region; the Yandex Maps fallback appears only
  after a controlled runtime failure or when JavaScript is unavailable, never
  as a flash over a normally loading map.
- Click-to-activate allows a site owner to defer the Yandex network request
  until visitor interaction.
- The readme and WordPress privacy guide disclose the API key, IP address, user
  agent, referrer, geolocation flow and optional external marker-image host.

## Internationalization

- Runtime, PHP and editor source strings use the plugin slug text domain
  `yamap-block-gutenberg`.
- The Russian catalog contains 191 translated messages with zero untranslated,
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

## Browser test pass, 2026-10-12

This section records a later end-to-end pass in Chromium against a live
WordPress 7.1 site. It supersedes limitation 1 above for the items it covers.

### Root cause of the reported "The map could not be loaded." error

The test site is served from one host while its Yandex key is restricted by
HTTP Referer to a different host. Yandex answers the SDK request with
`HTTP 403 {"message":"Invalid api key"}`; the browser blocks that JSON response
for a `<script>` element, so the runtime only saw a generic script error and
rendered one undifferentiated message. The plugin could not fix the key, but it
also did not say what was wrong. That gap is now closed:

- the loader classifies failures as `missing_api_key`, `api_key_rejected`,
  `network`, `csp`, `timeout`, `api_unavailable`, `load_failed` or `render`.
  A failed cross-origin script exposes no status, so one opaque `no-cors`
  request tells "Yandex answered" from "Yandex was not reached";
- the code is exposed as `data-guyamap-error` and in the `guyamap:error` event;
- visitors keep the short neutral message; users with `manage_options` also
  get the cause and a settings link, on the frontend and in the editor;
- Settings > Yandex Maps verifies the key server-side with the site address as
  Referer and reports the real HTTP status. It runs after a save and on demand;
- a refused key is remembered for 60 seconds per document, so a page with many
  maps issues one SDK request and one probe instead of one pair per map.

### Defects found and fixed

| Area | Defect |
| --- | --- |
| Editor | The error notice and its retry button were rendered below a full-height canvas inside a block with hidden overflow, so they were never visible |
| Runtime | The SDK marker wrapper kept the size of its in-flow content at the coordinate, leaving an invisible box beside every marker and cluster that swallowed clicks |
| Runtime, RTL | The RTL stylesheet mirrored the marker translate but not its anchor, shifting every pin by its own width (46px measured) |
| Runtime | Popups were cut off at the map edge, could sit under other markers, did not close on an outside click and several could be open at once |
| Runtime, PHP | A zoom range with equal minimum and maximum made the SDK throw `Invalid zoom range` and the map failed |
| Runtime | Repeated zoom presses stepped from a mid-animation zoom and produced fractional levels |
| Runtime | A geolocation failure was announced only to screen readers; a successful request moved the map without marking the position |
| Runtime | Activating a gated map with the keyboard dropped focus to the document body |
| Runtime | "Fit viewport to markers" placed pins on the viewport edge, cutting them off |
| Runtime | A marker hint only set the accessible name; there was no visible tooltip |
| Editor | Clearing a numeric field stored `0`; several fields accepted values the server discards (grid size, maximum zoom, dimensions, colors) |
| Editor | Image-only icon fields were shown for default markers; markers past the 1,000 limit could be added without notice |
| Editor | Clustering was not previewed, so 1,000 markers rendered as 1,000 DOM nodes |
| PHP, Editor | The icon name was free text; a name without a bundled file reached the frontend and caused a 404. The editor now offers a searchable catalog and the server accepts bundled names only |
| CSS | A set aspect ratio was overridden by the default minimum height on narrow screens |
| Assets | Block stylesheets were versioned by the plugin version only, so a rebuild of the same version could be paired with a cached stylesheet |

### Verification

- `npm run lint:js`, `npm run lint:css`: clean;
- Jest: 7 suites, 60 of 60 tests;
- WordPress Coding Standards and PHPCompatibility: clean;
- PHP syntax checks and the WordPress smoke suite on PHP 7.4.33 and PHP 8.2.12.
  The suite was extended with zoom range, icon validation, diagnostics scoping
  and the key check against a mocked HTTP layer;
- production build: reproducible, generated `build/` matches source;
- `tests/e2e/runtime-mock.spec.js`, 6 tests against a mocked SDK. It needs no
  API key and is the deterministic baseline;
- `tests/e2e/gutenberg-map.spec.js`, 3 tests against the real Yandex SDK with
  the site's own key, after the site host was added to the key's HTTP Referer
  restrictions. The suite skips itself with the reason when Yandex rejects the
  key for the tested host;
- both suites together: 9 of 9 in Chromium and 9 of 9 in Firefox 153;
- failure classification against real Yandex responses in Chromium and
  Firefox: an unknown key is reported as `api_key_rejected`, an unreachable
  endpoint as `network`;
- manual real-SDK scenarios: 11 block variants, hostile input, a 1.x block in
  the editor and on the frontend, 1,100 markers, mobile width, emulated RTL, and
  each failure class (rejected key, offline, content blocker, CSP, broken SDK,
  missing key, timeout).

### Not covered by this pass

- Safari. Playwright WebKit needs system libraries that are not installed on
  the test machine. If WebKit rejects opaque responses, a refused key is
  reported there as `network`; the server-side key check is unaffected.
  Covered on 2026-10-13, see below;
- a real RTL site locale; RTL was emulated with the RTL stylesheet and document
  direction;
- classic themes (only block themes are installed on the test site), the Site
  Editor and the widgets screen. Classic themes were covered on 2026-10-13.

### Still open

- the icon catalog is generated from the vendored files by
  `npm run icons:manifest` and checked by `npm run icons:check`, but refreshing
  the artwork from the pinned upstream package is still a manual copy; the
  checksum-verified vendoring script described in the engineering contract is
  not implemented, and the catalog has no categories or keywords. The
  vendoring workflow was added on 2026-10-13;
- the editor has no map-click placement or marker dragging; coordinates are
  edited as numbers. This is the intended design, see `AGENTS.md` section 7.2;
- the browser normalizer places a marker without coordinates at the map center
  while the server drops it. Only hand-edited markup can produce such a marker;
- the Yandex endpoint occasionally takes several seconds to answer. A probe
  that exceeds 8 seconds is reported as `load_failed` (cause undetermined)
  rather than guessed.

## Browser test pass, 2026-10-13

This pass covered the three gaps left on 2026-10-12 (Safari, classic themes,
icon vendoring), two messages reported from the browser console, and a full
check that every inspector control changes the map in the block preview.

### The two console messages

`Failed to load resource: the server responded with a status of 502` is not
produced by this plugin. On the test site it is the answer to
`admin-ajax.php?action=turgenev_api&operation=balance`, sent by another active
plugin whose API host does not resolve to its real server on that machine.

`Access to fetch at https://log.api-maps.yandex.ru/services/logging/error-booster
has been blocked by CORS policy` is the Yandex SDK failing to deliver one of its
own error reports. The SDK posts every error it catches to that address; the
browser prints this message whenever the answer carries no CORS header, which
the endpoint was seen to do intermittently. The plugin neither sends nor can
suppress these reports, but it can avoid giving the SDK a reason to send one.
Every inspector control was therefore driven against the real SDK while the
reports were recorded:

- with a usable GPU the SDK reported nothing, except for the customization
  defect below;
- without one it reports `Vector is not supported` once for every map in the
  automatic or vector mode and then draws raster tiles. That report is the
  SDK's own capability probe; a map in the raster mode does not trigger it.

### Defects found and fixed

| Area | Defect |
| --- | --- |
| Runtime, PHP, Editor | Customization JSON reached the SDK after structural sanitizing only. A `null` rule or styler throws in the SDK's vector worker, and the raster tile server refuses every tile whose style has an unknown key or value, which leaves the map empty. Both make the SDK send error reports. Rules are now reduced to the documented schema in PHP and JavaScript from one shared set of cases, and the editor lists what is wrong instead of applying such a style |
| PHP | A customization beyond the structured-data budget was cut in the middle and delivered `null` rules to the page. It is now cut at a rule boundary |
| Runtime | "Restrict map area" passed the corners in the order the reference documents. The SDK enforces the south-west and north-east corners, so the first camera movement parked the view just outside the area |
| Runtime | An animated azimuth change took the long way round: from 170 to -170 degrees the preview turned 340 degrees instead of 20 |
| CSS | On a map shorter than about 250 pixels the zoom buttons were hidden under the fullscreen button. Short maps now line the controls up along the top edge |
| Editor | After "Add at map center" the fields of the new marker did not appear in one Firefox run. The selection was corrected in an effect that could run before the marker arrived in the block attributes; the selected marker is now derived while rendering |
| Editor | A valid customization was applied only when the field lost focus; the Loading panel did not say that its options act on the published page only |
| Tooling | `npm run lint:js` also linted megabytes of generated Playwright reports; `package-lock.json` was out of step with `package.json` for `npm ci` |

### Removed

The per-marker "Draggable marker" and "Map follows while dragging" options are
gone from the editor, both normalizers and the runtime: markers are not
draggable anywhere. Both options shipped in the 2.0.0 package on
WordPress.org, so this changes published maps: a marker saved as draggable
stays where it is and visitors can no longer move it. Such blocks keep
rendering; the two keys are ignored on the server and in the browser, which
the unit, smoke and browser suites check. No block deprecation was added,
because nothing in the saved markup has to change for the block to stay valid.

### Coverage added

- Safari: Playwright WebKit 26.5 runs every suite. The browsers are selected
  with `GUYAMAP_E2E_BROWSERS`; `npm run test:e2e:browsers` runs Chromium,
  Firefox and WebKit;
- classic themes: `tests/e2e/classic-theme.spec.js` renders a page with
  Twenty Twenty-One 2.9 through the theme preview of WordPress, so the active
  theme is not switched. It checks default, wide and full alignment at desktop
  and phone width, style isolation of the popup, and a live update in the post
  editor;
- every inspector control against the real SDK, with a check that the SDK sent
  no error report (`GUYAMAP_E2E_LIVE_SDK=real`; `GUYAMAP_E2E_GPU=1` lets
  headless Chromium use the graphics hardware);
- editor operations: slider scrubbing, undo and redo, a duplicated block,
  device previews and a round trip through the code editor;
- the mocked SDK now models what the real one was observed to do: it fails on
  a `null` customization rule, enforces a restricted area on camera movement,
  reports its azimuth within one turn and repositions markers after a resize;
- icon vendoring: `npm run icons:verify` and `npm run icons:update`, described
  in `AGENTS.md` section 8.4. The vendored files are byte-identical to
  `@yandex/ymaps3-default-ui-theme` 0.0.25.

### Verification

- `npm run lint:js`, `npm run lint:css`: clean;
- Jest: 10 suites, 100 of 100 tests;
- WordPress Coding Standards and PHPCompatibility: clean;
- PHP syntax checks and the WordPress smoke suite on PHP 7.4.33 and PHP 8.2.12.
  The suite now runs the shared customization cases and checks that an
  oversized or hostile style never crosses the render boundary;
- production build: reproducible, generated `build/` matches source;
- `npm run icons:verify` and `npm run icons:check`: clean. Verification was
  also seen to fail for a modified, a missing and an unexpected file;
- `npm audit --omit=dev`: zero production vulnerabilities;
- browser suites against a live WordPress 7.1 site, 22 tests per browser: the
  mocked runtime and editor suites, the classic-theme suite and the real-SDK
  smoke. Chromium 22 of 22, Firefox 22 of 22, WebKit 22 of 22;
- the inspector, editor-operation and classic-theme suites against the real
  Yandex SDK, 13 tests per browser, with no error report from the SDK:
  Chromium with hardware graphics 13 of 13, Firefox 13 of 13, WebKit 13 of 13;
- exploratory runs against the real SDK. In Chromium: 18 setting combinations
  reviewed as screenshots, every corner order of a restricted area, and about
  170 customization shapes and values in the vector and the raster mode. In
  Chromium, Firefox and WebKit: a restricted area driven through the block
  attributes, editor operations, and control placement on short maps at phone,
  right-to-left and desktop widths;
- the release ZIP holds 302 files and no development directory or file.

### Not covered by this pass

- Safari on macOS or iOS itself; WebKit on Linux is the same engine but not the
  same application;
- a real RTL site locale, the Site Editor and the widgets screen.

### Still open

- classic themes that limit the width of each content block instead of their
  container (Twenty Nineteen to Twenty Twenty-One) resolve a percentage map
  width against the page container, so "50%" there can be as wide as the
  content column. Block themes are handled through their content size;
- a customization longer than about 11,000 characters as a raster tile request
  cannot be loaded as raster tiles. The editor warns about it; the limit is on
  the Yandex tile server;
- behaviors, lazy loading and click-to-activate act on the published page
  only. The editor says so in both panels;
- the browser normalizer places a marker without coordinates at the map center
  while the server drops it. Only hand-edited markup can produce such a marker;
- the icon catalog has no categories or keywords.

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
