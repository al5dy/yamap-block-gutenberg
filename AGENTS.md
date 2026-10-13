# AGENTS.md — Engineering Contract for Map Block for Yandex

> This file is the mandatory engineering contract for every coding agent, reviewer, and contributor working in this repository.
>
> **Product standard:** this is not a demo block, tutorial project, or disposable WordPress plugin. The target is a best-in-class, commercially viable Yandex Maps platform for WordPress: reliable enough for production sites, extensible enough for a separately distributed PRO product, and engineered with the same care expected from mature infrastructure software.

## 1. Prime directive

Every change MUST optimize for long-term product quality, correctness, compatibility, security, accessibility, performance, maintainability, and a first-class WordPress editor experience.

Do not implement a feature merely until it “works on my machine.” A feature is complete only when its entire lifecycle is complete:

1. product/UI behavior is defined;
2. Gutenberg attributes/configuration are modeled;
3. editor controls are usable and discoverable;
4. PHP server-side normalization validates the persisted data;
5. frontend runtime implements the behavior;
6. failure/offline/no-key states are defined;
7. accessibility and keyboard behavior are correct;
8. privacy/network consequences are documented;
9. strings are internationalized;
10. automated tests cover normal and edge cases;
11. source and build output are updated;
12. documentation and migration behavior are updated;
13. release packaging contains exactly the intended files.

**No fake controls. No no-op settings. No hidden unfinished toggles. No placeholder production APIs. No UI that claims support for a capability that is not actually rendered.**

When in doubt, prefer a smaller feature that is complete over a larger feature that is half-implemented.

---

## 2. Current product baseline — do not misrepresent it

At the time this contract was written, the repository is version **2.0.0** and the Free plugin is a release-candidate-quality modernization of the original block.

Current Free capabilities include, among other things:

- dynamic Gutenberg block registered through `block.json`, Block API v3;
- stable legacy block name `gutenberg-yandex-block/map`;
- Yandex Maps JavaScript API v3;
- multiple independent maps on one page;
- iframe-safe editor preview;
- responsive width/height/min-height/aspect ratio configuration;
- center, zoom, zoom range, tilt, azimuth;
- `auto` / `raster` / `vector` map modes;
- automatic/light/dark theme;
- allow-listed map behaviors;
- bounded map options;
- custom lightweight zoom, geolocation, and fullscreen controls;
- structured markers, local icon artwork, image markers, links and popups;
- an inspector-driven editor preview that is locked against pointer and keyboard map gestures;
- client-side clustering with `@yandex/ymaps3-clusterer`;
- map customization JSON checked against the documented rule schema in the editor, on the server and in the runtime;
- lazy initialization and click-to-activate privacy mode;
- accessible fallback link and error states;
- migration/render support for legacy 1.x attributes;
- server-side normalization and hard payload limits;
- English source strings and bundled Russian translation.

Current hard safety/performance boundaries include:

- maximum **1,000 inline markers per block**;
- maximum approximately **1 MiB rendered configuration**;
- prototype-pollution-sensitive keys are rejected from structured bags;
- user text is rendered as text, not arbitrary HTML;
- URLs are restricted to safe HTTP(S) use;
- Yandex SDK state is shared per document realm, not globally across unrelated documents.

These are invariants unless a deliberate, tested migration changes them.

### 2.1 PRO status

**PRO IS NOT IMPLEMENTED IN THIS REPOSITORY.**

The Free repository currently contains only architectural seams and design documentation for a future separately distributed PRO add-on. Specifically, it does **not** currently ship:

- a license activation client;
- license key storage/state machine;
- entitlement refresh;
- vendor update client;
- signed private update package verification;
- Store Locator UI;
- locator card/list synchronization;
- locator REST endpoints;
- custom locator SQL/index tables;
- provider-backed viewport queries;
- server-side clustering;
- FacetWP integration;
- CSV/JSON import pipeline for locator data;
- enterprise/million-row data-source implementation.

Existing `templateId`, `overrides`, `extensions`, `Feature_Provider_Interface`, `Plugin::register_feature_provider()` and provider/config filters are extension **seams**, not proof that PRO features exist.

Never describe a design document as an implemented feature.

---

## 3. Product architecture principles

### 3.1 Free must remain a real product

Free is not a crippled loader for PRO. It must remain useful, stable, secure, and professionally maintained on its own.

### 3.2 PRO must be a separate add-on

Premium code must live in a separately distributed plugin/add-on and consume explicit versioned contracts from Free.

Free must not contain dormant premium business logic, license-server code, private updater code, or obfuscated paid functionality.

### 3.3 Public map rendering must never synchronously depend on licensing infrastructure

A temporary vendor outage must not break maps already configured on a public site. License checks belong to administration/update/entitlement flows and must use cached signed state with a defined grace policy.

### 3.4 Yandex integration is capability-driven

Do not scatter Yandex-specific imports and magic strings throughout editor components. Build a capability registry/adapter layer so the product can answer:

- which Yandex capability is supported by this plugin version;
- which package/module/service provides it;
- whether an API key/product entitlement is required;
- whether the operation is browser-side or server-side;
- whether the capability is Free or supplied by a feature provider;
- what runtime fallback exists if the capability cannot load.

### 3.5 One canonical configuration contract

Configuration rules currently exist in several places (`block.json`, PHP normalization, JS normalization/UI/runtime). That duplication is a drift risk.

A high-priority architectural goal is a **single canonical schema/contract** from which the PHP validator, JS types/defaults and editor constraints can be derived or contract-tested.

Until that is implemented, **`Config_Normalizer` remains the authoritative server-side security boundary**. Client validation never replaces server validation.

---

## 4. Repository map and ownership

Treat these paths as deliberate boundaries:

- `yamap-block-gutenberg.php` — minimal composition/bootstrap entry point.
- `includes/Plugin.php` — application/plugin service orchestration.
- `includes/Admin/Settings.php` — global WordPress settings only.
- `includes/Block/Map_Block.php` — block registration, editor bootstrap, dynamic render/config boundary.
- `includes/Support/Config_Normalizer.php` — authoritative persisted/runtime configuration normalization and legacy conversion.
- `includes/Contracts/Feature_Provider_Interface.php` — current minimal provider bootstrap seam; not sufficient by itself for advanced PRO query integrations.
- `src/block.json` — Gutenberg metadata and persisted attribute defaults.
- `src/edit.js` and `src/components/**` — editor UX.
- `src/runtime/**` — browser runtime/controllers/Yandex integration.
- `src/view.js` — frontend bootstrapping.
- `src/deprecated.js` — backward-compatible Gutenberg deprecations/migrations.
- `assets/icons/` — vendored local Yandex default marker icon artwork; see the dedicated icon contract below.
- `build/` — generated production assets. Never hand-edit generated output as the source of truth.
- `tests/` — unit/smoke/contract tests.
- `docs/architecture.md` — architecture direction.
- `docs/pro-extension.md` — PRO design specification, not implementation status.
- `docs/audit.md` — point-in-time release audit; keep factual status synchronized with actual code.
- `scripts/plugin-zip.js` — release packaging implementation.

When a feature crosses these boundaries, update all affected layers in the same change.

---

## 5. Yandex Maps capability standard

The long-term target is broad, systematic coverage of **applicable Yandex Maps functionality**, but “support everything” does not mean blindly importing every Yandex product into browser code.

Yandex exposes multiple distinct surfaces:

1. JavaScript API v3 core;
2. JavaScript API packages;
3. JavaScript API modules;
4. separate HTTP APIs/products such as Geocoder, Geosuggest, Organization Search, Distance Matrix, route-detail services, Static API, Tiles API and Locator;
5. mobile SDK products such as MapKit/NaviKit, which are not runtime dependencies for a WordPress web plugin.

Each capability must be classified correctly. Different Yandex products can require different keys, commercial plans, quotas, network patterns and licensing terms. Never assume that the browser JavaScript API key authorizes every Yandex HTTP API.

Before implementing or modifying any Yandex integration, verify the **current official Yandex documentation**. Package/module APIs evolve independently:

- Yandex JS API packages do not guarantee backward compatibility;
- Yandex JS API modules are not versioned and resolve to the current module implementation.

Therefore all package versions used through npm must be pinned, and module integration must have capability guards and regression tests.

### 5.1 JavaScript API core — map/camera/options

The editor and runtime should expose all user-meaningful, safe core map configuration where it makes product sense, including a proper UX for:

- location by center + zoom;
- location by bounds / fit-to-bounds;
- animated location changes with controlled duration/easing where appropriate;
- camera tilt;
- camera azimuth/rotation;
- supported tilt range;
- zoom range;
- zoom rounding (`auto`, `snap`, `smooth` where supported);
- zoom strategy (`zoomToPointer`, `zoomToCenter`);
- map mode (`auto`, `raster`, `vector`);
- map theme;
- map margins;
- restricted map area;
- world repetition options (`cycledX`, `cycledY`) when supported/applicable;
- hotspots strategy;
- copyrights position and supported copyright presentation options;
- scale display in copyrights;
- distribution position/module integration when enabled;
- supported projection selection;
- map resize/update/destroy lifecycle.

Internal low-level `config`, transport headers, credentials flags, or implementation-only settings must **not** be blindly exposed as arbitrary user input. Exposure requires a concrete supported use case and a security review.

### 5.2 Behaviors

Support Yandex behaviors deliberately and by allow-list. The capability layer must reflect the currently documented behavior set, including where supported:

- drag;
- scroll zoom;
- pinch zoom;
- double click zoom;
- magnifier;
- one-finger zoom;
- mouse rotation;
- mouse tilt;
- pinch rotation;
- pan/tilt gestures.

The editor must explain behavior implications where they affect page scrolling/mobile usability. A behavior added to the UI is not complete until it is accepted by PHP normalization and actually passed to the correct runtime instance.

### 5.3 Events and actions

The runtime only emits its own lifecycle events (`guyamap:ready`, `guyamap:statechange`, `guyamap:error`, `guyamap:destroy`). That is not a complete event system.

Create a normalized event/action layer capable of safely representing relevant Yandex events without persisting arbitrary JavaScript callbacks. Cover appropriate events such as:

- map update/location/camera changes;
- resize/state changes;
- click;
- double click;
- right click/context menu;
- pointer/mouse enter, leave and move where useful;
- behavior action start/end;
- marker click/open/close;
- cluster click;
- selection changes;
- geometry interaction events.

For extensibility, expose stable WordPress/browser events or typed action hooks rather than user-supplied executable code.

**Never store JavaScript callback strings, `eval`, executable HTML attributes, or arbitrary code in block attributes.**

### 5.4 Layers and data sources

The plugin must evolve beyond only scheme + default-features + markers.

Provide architecture and UI for applicable:

- default scheme layer;
- default feature layer;
- `YMapLayer`-based custom rendering scenarios;
- custom/remote data-source abstractions;
- visibility/ordering/z-index semantics;
- independent layer toggling;
- opacity/style configuration where supported;
- layer loading/error states;
- data-source lifecycle and cancellation.

Do not let external providers directly mutate private map-controller internals. Providers register declarative capabilities/layers through typed contracts.

### 5.5 Geometries and features

Support first-class map features, not only point markers. The data model should be capable of representing Yandex-supported geometry families such as:

- Point;
- LineString;
- MultiLineString;
- Polygon;
- MultiPolygon;
- any other officially supported feature geometry that is applicable to the web API version in use.

For each geometry type, implement:

- editor creation;
- coordinate editing;
- move/edit/delete;
- style configuration;
- optional title/metadata/action association;
- serialization and normalization;
- frontend rendering;
- accessible textual fallback where meaningful;
- import/export representation;
- tests for invalid and pathological geometry sizes.

Large geometries need explicit point/byte ceilings. Never permit unbounded block attributes.

### 5.6 Markers

Markers are a core product surface and must feel premium.

Required direction:

- default pin markers;
- all supported local preset icons;
- uploaded/media-library image markers;
- remote image markers only with a deliberate privacy/security policy;
- custom size and anchor/offset;
- title/subtitle/hint/description;
- popup/balloon-like presentation;
- safe action/link buttons;
- hide outside viewport where appropriate;
- z-index ordering;
- selected/hover/focus states;
- keyboard semantics;
- marker duplication;
- deterministic stable IDs;
- coordinate paste;
- address/geocode placement;
- bulk marker operations where UX remains safe;
- import/export for Free-sized marker sets.

Where Yandex's `@yandex/ymaps3-default-ui-theme` provides `YMapDefaultMarker`, popup marker or related primitives, evaluate whether using the official component improves compatibility/feature coverage. Do not add a heavy dependency merely for visual parity if the existing lightweight renderer can provide the same accessible functionality; make the choice based on bundle/runtime cost and maintainability.

### 5.7 Real hints/tooltips

A marker `aria-label` is not a substitute for the Yandex hint capability.

Integrate a real hover/focus hint feature where appropriate, using `@yandex/ymaps3-hint` or an equivalent controlled implementation. Hints must work with keyboard focus and must not become an inaccessible hover-only surface.

### 5.8 Clustering

Current client clustering is a valid Free feature for bounded inline marker sets. Preserve lazy loading of the clusterer chunk.

Improve clustering with:

- cluster appearance presets and custom renderer contracts;
- cluster counts and selected states;
- fit-to-cluster bounds;
- accessible labels;
- max zoom behavior;
- configurable grid/method parameters only where supported;
- deterministic behavior when markers change;
- stress tests at the Free hard limit.

For large Store Locator datasets, **do not extend client-side clustering by simply raising the 1,000-marker limit**. Use viewport queries and server-side/aggregation strategies.

### 5.9 Controls

The control system must support both lightweight native plugin controls and official Yandex controls where they provide meaningful functionality.

Target capability coverage includes:

- zoom;
- geolocation;
- fullscreen;
- rotation/tilt control where useful;
- scale;
- search/address control;
- route/directions control;
- open-in-Yandex-Maps control;
- ruler/planimeter;
- minimap if a supported implementation is justified;
- custom action buttons;
- control groups/position/orientation;
- responsive/mobile control layout.

Do not duplicate two competing implementations without a reason. Each control type should have one canonical product abstraction and one or more internal renderer adapters if necessary.

### 5.10 Official JS API packages

The capability registry must explicitly track supported integration with current official Yandex JS API packages, including:

- `@yandex/ymaps3-clusterer` — already used;
- `@yandex/ymaps3-default-ui-theme` — evaluate/consume selectively as required;
- `@yandex/ymaps3-hint` — target for first-class hints;
- `@yandex/ymaps3-cartesian-projection` — support when a user-facing/custom-coordinate use case exists;
- `@yandex/ymaps3-web-mercator-projection` — support where projection choice is exposed.

Because package compatibility is not guaranteed, pin exact versions and review changelogs/API docs before upgrades.

### 5.11 Official JS API modules

Track and integrate applicable official modules:

- `@yandex/ymaps3-controls-extra`;
- `@yandex/ymaps3-distribution`;
- `@yandex/ymaps3-ruler`.

`@yandex/ymaps3-vuefy` is a Vue integration adapter and is **not** a requirement for this React/Gutenberg WordPress plugin unless the frontend architecture intentionally adopts Vue. “Support all API features” does not mean adding irrelevant framework adapters.

Because modules are not versioned independently, integrations must tolerate loading failure/API availability checks and have smoke tests against the current Yandex API.

### 5.12 Map customization/styling

Raw customization JSON may remain as an expert escape hatch, but it must not be the primary UX for a premium-quality plugin.

Build a schema-aware customization editor for supported Yandex customization concepts, including relevant selectors/tags/types/elements and stylers such as:

- visibility;
- color/hue;
- saturation;
- lightness;
- opacity;
- secondary/tertiary color where supported;
- scale;
- zoom-dependent styling where supported.

Requirements:

- live preview;
- validation before persistence;
- presets;
- reset/diff behavior;
- import/export of customization JSON;
- strict size/depth limits;
- forward-compatible passthrough only where safe.

Never pass arbitrary nested JSON directly to Yandex without the bounded normalization layer.

---

## 6. Separate Yandex HTTP services — architecture requirements

These are **not** merely additional properties of `YMap`. Treat them as separate service adapters with their own settings, credentials, quotas, caching and errors.

Where credentials are server-side secrets, never expose them into page HTML or browser JavaScript.

### 6.1 Geocoder

Implement an adapter for:

- forward geocoding: address -> coordinates;
- reverse geocoding: coordinates -> address;
- bounded result count;
- locale/language;
- geographic bias/bounds where supported;
- object kind filtering where supported;
- normalized address components;
- selection into editor marker/locator data.

Use it in the editor so a user can create a marker by typing an address instead of manually finding coordinates.

### 6.2 Geosuggest

Implement first-class address/organization autocomplete with:

- debounce;
- cancellation/AbortController;
- result limit;
- language;
- location/bounds bias;
- strict bounds option;
- country filters;
- object type filters;
- formatted address;
- organization-address options;
- URI handoff into Geocoder where supported;
- accessible combobox/listbox keyboard UX;
- empty/loading/error states.

Never issue one request per keystroke without debounce/cancellation.

### 6.3 Organization Search

Create a service/provider adapter for organization lookup when enabled by the site's Yandex product plan. Store only normalized fields required by the configured use case and respect Yandex terms for data use/caching.

Do not assume organization-search response objects are permanent plugin-owned business records without reviewing the applicable Yandex license terms.

### 6.4 Routes / route details

Support a route model capable of:

- origin/destination;
- intermediate points where the selected Yandex service supports them;
- supported travel modes;
- route alternatives if available;
- traffic-aware routing where available;
- distance/duration display;
- route geometry rendering;
- safe open-in-Yandex-Maps handoff;
- errors for impossible routes.

Routing APIs/products may have separate commercial requirements; detect configuration instead of silently failing.

### 6.5 Distance Matrix

This is particularly useful for Store Locator “nearest location” functionality.

Architect both bounded synchronous and, where contractually available, asynchronous workflows. Requirements:

- strict input ceilings;
- mode-specific parameters;
- traffic/departure settings where supported;
- toll/unpaved/condition avoidance where supported;
- truck dimensions/weight/permits only when relevant;
- 429 handling and exponential backoff;
- async operation polling with cancellation/deadline;
- transient/cache layer keyed by normalized query;
- never block a normal WordPress frontend request waiting for a giant asynchronous matrix operation.

For basic locator sorting, use straight-line/geospatial indexed distance first when appropriate; call route distance only when the product actually requires road/travel time accuracy.

### 6.6 Static API

Use the Static API as an optional fallback/preview/export surface where allowed, for example:

- non-interactive map preview;
- email/PDF-compatible preview workflows;
- privacy/performance fallback if explicitly configured;
- editor snapshot use cases.

Do not silently replace interactive maps with Static API imagery without administrator intent and proper attribution/licensing.

### 6.7 Tiles API

Tiles API support belongs behind an explicit layer/source abstraction. It is useful for specialized low-rendering-capability or custom tiling workflows, not as a reason to reimplement the standard JS map.

### 6.8 Locator API / geolocation products

Keep device/browser geolocation and Yandex Locator-style services conceptually separate. Browser `navigator.geolocation` is already useful for explicit visitor location requests; any external geolocation service requires its own privacy disclosure and product key/configuration.

### 6.9 Mobile SDKs

Yandex MapKit/NaviKit are mobile application SDKs. They are intentionally **out of scope for the normal WordPress web runtime**. Document them in capability audits as “not applicable,” rather than adding dead dependencies.

---

## 7. Editor UX quality bar

A technically available option is not enough. The Gutenberg experience should allow a non-programmer to build sophisticated maps confidently.

### 7.1 Progressive disclosure

Use clear panels/groups such as:

- Map / viewport;
- Appearance;
- Behaviors;
- Controls;
- Markers;
- Shapes/layers;
- Search/geocoding;
- Routes;
- Clustering;
- Loading/privacy;
- Accessibility;
- Advanced.

Do not dump the entire Yandex API into a wall of controls.

### 7.2 Live preview

Changes that can safely preview should update the editor map without a full block reload. Rebuild the map only when the underlying Yandex entity cannot be safely updated.

The preview is display-only. It takes no pointer or keyboard map gestures, and markers are not placed by clicking the map; a marker is positioned by its coordinates in the inspector (and by address search once that exists). Markers are not draggable anywhere, in the editor or on the published page. Do not add map-click placement or marker dragging.

### 7.3 Raw JSON is advanced-only

Any feature expected to be commonly used needs a real UI. Raw JSON editors can exist for experts, but must have schema validation, line-level errors where possible, reset, and safe limits.

### 7.4 Responsive behavior

Editor controls must support desktop/tablet/mobile preview semantics where dimensions/control density materially differ.

### 7.5 Error messages

Failures should say what is wrong and what the administrator can do. Distinguish:

- no API key;
- invalid/restricted API key;
- network failure;
- Yandex API unavailable;
- optional package/module unavailable;
- browser geolocation denied/unavailable;
- invalid marker/geometry config;
- external service key not configured;
- quota/rate-limit error.

Do not swallow errors into a blank gray map.

---

## 8. `assets/icons/` — mandatory contract

### 8.1 Why this directory exists

`assets/icons/` is a **vendored local icon preset** derived from Yandex's `@yandex/ymaps3-default-ui-theme` artwork. The repository currently contains **276 `*_24.svg` marker icons**, plus the required attribution/license material elsewhere in the plugin.

The frontend constructs local URLs in the form:

`assets/icons/{iconName}_24.svg`

This is intentional:

- markers do not need the entire default UI theme package just to display its preset artwork;
- local assets are deterministic and cacheable;
- the plugin avoids a runtime icon CDN dependency;
- the current lightweight control/marker implementation stays small.

**Do not delete this directory as “unused assets.”** The runtime uses it.

### 8.2 Current weakness

The marker editor offers the bundled icons through a searchable catalog generated from the vendored files, and the server accepts bundled names only. The catalog still has no categories or keywords: an icon is found by its upstream name alone.

### 8.3 Required icon-catalog implementation

Create a generated icon manifest from the vendored SVG directory. Each manifest entry should at minimum contain:

- canonical icon name;
- filename;
- local URL/path derivation;
- searchable labels/keywords where maintained by the plugin;
- category/group metadata if reliable;
- upstream source/version metadata outside user data.

Then implement:

- visual grid/picker;
- search by name/keyword;
- category filtering if useful;
- keyboard navigation;
- selected icon preview;
- existence validation in editor and server normalization;
- guaranteed fallback icon if a preset is missing;
- no 404 for malformed/missing user choice;
- automated test asserting every manifest entry exists;
- automated test asserting no unmanifested preset is accidentally orphaned (unless explicitly excluded).

### 8.4 Vendoring/upstream sync

The artwork is an unmodified copy of `static/icons` from `@yandex/ymaps3-default-ui-theme`. That package is a pinned **development-only** dependency and is never bundled. `scripts/icon-provenance.json` records the upstream version, the tarball digest from `package-lock.json` and a SHA-256 digest of every vendored file.

- `npm run icons:verify` fails when `assets/icons/` differs from the provenance record or from the installed upstream package, when the pinned versions disagree, or when `third-party-notices.txt` names another version;
- `npm run icons:update` copies the icon set and the license files from the installed upstream package, rewrites the provenance record and regenerates the manifest. It refuses a release that drops an icon unless `--allow-removals` is passed, and refuses artwork that is not passive SVG.

To move to another upstream release, change the pinned version in `package.json`, run `npm install` and `npm run icons:update`, review the reported differences and update `third-party-notices.txt`.

Never “update icons” manually by copying an unknown latest folder.

### 8.5 Do not blindly rename upstream filenames

Some upstream preset names may look misspelled. Treat the filename/icon name as an upstream compatibility identifier. Do not rename it merely for spelling aesthetics; instead provide a human-friendly label/alias in the picker while preserving the canonical upstream name.

### 8.6 Keep all icons unless there is a measured reason not to

For the intended product positioning, having the complete preset is preferable to arbitrary pruning. The SVG payload is small compared with the full development repository, and only selected icons are requested by the browser.

If a future build converts them to an SVG sprite or optimized bundle, preserve:

- canonical icon identifiers;
- accessibility behavior;
- attribution/license requirements;
- cacheability;
- compatibility with saved icon names.

---

## 9. PRO architecture — required target

The PRO add-on should extend Free through versioned contracts, not forks or private knowledge of Free internals.

### 9.1 Versioned extension registry

Before implementing serious PRO features, evolve the current minimal `Feature_Provider_Interface` into explicit V1 contracts for capabilities such as:

- data source providers;
- marker/feature providers;
- server-query providers;
- card/list renderers;
- filter adapters;
- template resolvers;
- service adapters;
- premium editor panels;
- REST route contributors.

Contracts must use DTOs/value objects or well-specified arrays with versioned schemas. Add contract tests that run Free + a fixture provider.

Do not let PRO reach into private Free properties/classes that are not declared extension API.

### 9.2 Templates/inheritance

PRO map templates should support:

- reusable map configuration;
- revision/version identifier;
- explicit override model;
- predictable merge semantics;
- template deletion/missing-template fallback;
- migration when schema changes;
- no loss of block-local overrides;
- cache invalidation on template revision.

`templateId` and `overrides` must remain inert/resilient in Free if PRO is unavailable.

---

## 10. Store Locator — required professional implementation

Store Locator is **not currently implemented**. When implemented in PRO, it must be treated as a data/query product, not “a map with 50,000 markers.”

### 10.1 User-visible Store Locator capabilities

Target a complete locator experience with:

- map + synchronized location cards/list;
- address/place search;
- “use my location” with explicit permission;
- radius search;
- viewport/bounds search;
- categories/taxonomies;
- arbitrary configured facets/filters;
- opening-hours/state display where source data supports it;
- contact fields;
- address;
- image/logo;
- CTA buttons;
- directions/open-in-Yandex-Maps;
- distance from user/search origin;
- optional route/travel-time distance where configured;
- configurable sort (distance, relevance, title, custom priority, etc.);
- selected-card <-> selected-marker synchronization;
- hover/focus synchronization without keyboard traps;
- cluster selection/zoom;
- “search this area” flow;
- pagination or virtualized/infinite card list;
- URL/query-state support where appropriate;
- empty/no-results/error/loading states;
- mobile bottom-sheet/list layout;
- accessible list and map alternatives;
- SEO-safe textual location output where required.

### 10.2 One query model for map and cards

The map and cards must consume the **same normalized query session**. Never independently query/map one dataset and list another.

A query should have a stable normalized identity/hash derived from:

- bounds/origin/radius;
- filters;
- search term;
- sort;
- provider/source;
- data revision;
- language/site context;
- permission-relevant context where applicable.

The response should include the data needed to keep viewport/map/cards consistent.

### 10.3 Data-source providers

Support typed providers for sources such as, when product requirements justify them:

- manually managed locator entries;
- WordPress posts/custom post types;
- WooCommerce stores/dealers/products or related entities;
- imported CSV/JSON;
- external REST/API source;
- custom SQL-backed indexed source;
- enterprise provider supplied by another plugin.

Provider APIs must support **bounded queries**, not “return all rows.”

### 10.4 Data normalization/indexing

For medium/large local datasets, use normalized, revisioned storage optimized for geospatial lookup. Do not execute arbitrary expensive `WP_Query` meta comparisons for every map pan.

Where custom tables are used:

- define schema migrations/versioning;
- index latitude/longitude and provider/source IDs;
- use appropriate composite indexes for common filters;
- use prepared SQL;
- keep source-of-truth vs searchable projection explicit;
- rebuild indexes asynchronously;
- publish a new revision atomically;
- retain last known-good revision until new import/index is valid.

### 10.5 Scale modes

Design at least these operating modes:

**Standard**
- hundreds/few thousands of source objects;
- bounded viewport queries;
- client clustering may still be acceptable for returned subsets.

**Large local**
- tens/hundreds of thousands;
- indexed viewport/radius queries;
- strict response caps;
- server aggregation/clustering as needed;
- virtualized cards.

**Enterprise**
- potentially millions+;
- provider-specific spatial index/search service;
- server-side clusters/tiles/aggregation;
- cursor-based/bounded result transport;
- no attempt to materialize all points in PHP or browser memory.

### 10.6 Server clustering

For large datasets, clusters must be generated from the active query/filter set and viewport/zoom. A server cluster response needs stable IDs or enough metadata to zoom/refine without pretending a cluster is an actual location.

### 10.7 REST API

Store Locator REST routes must have:

- explicit version namespace;
- complete argument schemas;
- typed normalized responses;
- bounded `limit`/page/cursor values;
- strict coordinate/bounds validation;
- prepared provider queries;
- capability/nonces for administrative mutation routes;
- appropriate public read permissions for intentionally public locator data;
- ETag/revision/cache semantics where useful;
- rate limiting/abuse mitigation strategy for expensive endpoints;
- no secret fields in public responses.

### 10.8 FacetWP / filter adapters

FacetWP integration, if sold, must be a real adapter over the same locator query model. Do not build two independent filter pipelines.

An adapter must translate supported facet state into normalized provider filters and publish result IDs/count/context back through documented integration points.

---

## 11. PRO licensing and private updates — required target

**No licensing implementation currently exists.** The future implementation must be security-conscious but should not punish legitimate users during transient outages.

### 11.1 Activation model

Recommended model:

1. administrator enters a license key in a capability-protected settings screen;
2. request uses WordPress nonce and capability checks;
3. plugin creates/uses a random installation UUID, not invasive hardware fingerprinting;
4. server exchanges key + product + site/install identity for a signed entitlement document;
5. plugin verifies the entitlement using a pinned vendor public key;
6. store the credential/entitlement server-side, preferably non-autoloaded if not needed on every request;
7. persist normalized state such as `active`, `grace`, `expired`, `suspended`, `unreachable`;
8. refresh asynchronously using cron/background actions;
9. public frontend uses cached local entitlement and must not call the vendor synchronously.

Do not store raw secrets in block attributes or frontend JavaScript.

### 11.2 Grace/offline behavior

Define deterministic behavior for:

- vendor server unreachable;
- DNS/TLS failure;
- license server 5xx;
- local clock skew;
- WordPress cron disabled;
- expired subscription;
- explicitly suspended license;
- site URL/domain migration;
- staging/local environment.

Temporary network failure should enter a finite grace/unreachable state, not instantly destroy configured frontend output.

### 11.3 Private updater

Private update metadata/packages must be authenticated.

At minimum:

- TLS;
- signed update manifest or package metadata;
- cryptographic package digest;
- signature verified with pinned public key;
- semantic version/product/channel compatibility checks;
- safe temporary download;
- fail closed on signature/digest mismatch;
- no execution of arbitrary server-provided PHP before verification.

Never rely only on “the download URL used HTTPS.”

---

## 12. Security requirements

Every contributor must threat-model new data and network surfaces.

### 12.1 WordPress

- capability checks on administrative actions;
- nonces for state changes;
- Settings API or equivalent safe option handling;
- REST permission callbacks;
- prepared SQL;
- escaping at output;
- sanitization/normalization at trust boundaries;
- no direct file execution outside guarded bootstrap.

### 12.2 Configuration/data

- treat block attributes as untrusted;
- validate coordinate ranges;
- validate finite numbers (`NaN`/Infinity forbidden);
- bounded strings, arrays, nesting, geometry vertices and total bytes;
- reject prototype keys in nested JS-compatible bags;
- stable unique IDs;
- safe URL protocols;
- never use persisted arbitrary HTML/JS callbacks as a feature mechanism.

### 12.3 External HTTP

For Geocoder/Search/import/provider integrations:

- WordPress HTTP API server-side;
- fixed/allow-listed service origins for built-in Yandex adapters;
- timeout;
- response-size limit;
- HTTP status validation;
- JSON/content-type validation;
- retry/backoff only where safe;
- secrets redacted from logs;
- SSRF protection for administrator-configurable remote sources;
- redirect policy reviewed;
- do not proxy arbitrary user-supplied URLs.

### 12.4 Imports

Imports must use streaming/chunked processing where large, validate MIME/content, enforce size/row limits, normalize each record, produce an error report, and publish only a successfully validated revision.

---

## 13. Performance requirements

Performance is a product feature.

### Frontend

- no globally enqueued map runtime on pages without the block;
- lazy-load Yandex SDK when configured;
- one shared SDK promise per document realm;
- one disposable controller per map;
- lazy-load optional chunks/packages;
- cancel obsolete async requests;
- destroy observers/listeners/maps on teardown;
- do not rerender the entire map for a small mutable property if `update()` is sufficient;
- avoid layout thrash;
- avoid one network request per marker;
- do not send full locator datasets to browser;
- virtualize long card lists;
- response caps are mandatory.

### Editor

- debounce search/geosuggest;
- cap materialized search results;
- do not perform expensive serialization on every pointer move;
- preserve iframe realm correctness;
- no unbounded React state containing all enterprise records.

### Server

- cache deterministic expensive Yandex HTTP requests subject to applicable license terms;
- indexed queries for locator spatial/filter lookup;
- avoid N+1 post/meta queries;
- asynchronous imports/re-indexing;
- bounded REST responses;
- measure query count, memory and response time for scale-oriented changes.

---

## 14. Accessibility requirements

Maps are intrinsically difficult accessibility surfaces, so accessibility cannot be an afterthought.

Requirements include:

- semantic labeled map region;
- useful textual/fallback link;
- keyboard-operable controls;
- visible focus indicators;
- interactive markers use appropriate native semantics;
- passive decorative markers must not create hundreds of tab stops;
- popup state communicated to assistive technology;
- hint functionality accessible on focus, not hover only;
- cards provide the same essential location information as map markers;
- map/list selected states do not steal focus unexpectedly;
- reduced-motion preferences respected;
- color is not the sole carrier of state;
- sufficient contrast;
- screen-reader-friendly error/loading/no-results states;
- geolocation requires explicit user action/permission where appropriate.

Test with keyboard-only navigation and automated accessibility tooling; critical flows also need manual review.

---

## 15. Privacy requirements

Document every external request that can disclose visitor information.

At minimum account for:

- Yandex JS API network request;
- API key exposure (browser JS key is public by design, but should be Referer-restricted);
- IP address/user agent/referrer sent to external services;
- browser geolocation coordinates after permission;
- external marker image hosts;
- Geocoder/Geosuggest/Organization Search requests;
- optional analytics if ever introduced;
- PRO license server requests (administrator/server-side, not visitor map traffic).

Preserve click-to-activate as a privacy option. Do not silently initiate geolocation.

---

## 16. Internationalization and localization

- English source strings, plugin text domain `yamap-block-gutenberg`;
- all PHP/editor/frontend user-visible strings translatable;
- do not concatenate sentences in ways translators cannot reorder;
- locale/language choice must be validated against current supported Yandex values;
- coordinates/measurements/distances should be formatted appropriately;
- RTL layout must remain usable;
- public identifiers/hook names/attribute keys are stable and never translated.

Whenever source strings change, regenerate translation templates/catalog artifacts according to the project release process.

---

## 17. Backward compatibility

This plugin already has legacy content in the wild.

Do not:

- rename the block without a migration strategy;
- remove a persisted attribute without a deprecation/migration path;
- silently change the meaning of saved coordinates/options;
- rename canonical icon identifiers without alias migration;
- change extension hooks/contracts without versioning/deprecation;
- invalidate old posts merely because an editor UI was redesigned.

A schema version change requires explicit normalization/migration tests.

Server-side rendering should remain resilient to old saved content even when the editor has migrated to newer attributes.

---

## 18. Testing standard

No meaningful feature ships without tests appropriate to its layer.

### 18.1 JavaScript unit tests

Cover:

- normalization;
- config defaults;
- marker/geometry validation;
- deterministic IDs;
- icon manifest/fallback;
- bounds calculations;
- clustering adapters;
- query serialization;
- cancellation/race behavior;
- migration utilities.

### 18.2 PHP tests

Cover:

- `Config_Normalizer`;
- legacy conversion;
- output escaping/JSON boundary;
- payload ceilings;
- feature-provider contracts;
- REST argument validation;
- SQL/provider query normalization;
- licensing signature/state logic when PRO exists.

### 18.3 WordPress integration/smoke

Test at minimum:

- plugin activation;
- block registration;
- settings save;
- dynamic frontend render;
- multiple maps;
- iframe block editor;
- classic/block themes;
- old saved block content;
- no-key/error state;
- translations.

### 18.4 Browser E2E

For feature-rich releases add Playwright or equivalent coverage for:

- editor insert/configure/save/reload;
- frontend map initialization;
- controls;
- marker popup/hint;
- geosuggest selection;
- geometry editing;
- clustering;
- Store Locator map/list synchronization;
- mobile layout;
- keyboard operation;
- optional real-Yandex smoke using CI secrets, with a deterministic mocked smoke suite as the non-secret baseline.

### 18.5 Contract tests

Free/PRO boundaries require fixture providers to prove that public contracts remain compatible.

### 18.6 Performance tests

Add repeatable synthetic tests for:

- Free maximum marker count;
- large locator viewport response;
- card virtualization;
- server spatial query latency;
- import batch memory use;
- repeated pan/zoom request cancellation.

---

## 19. Dependency policy

- pin runtime dependencies deliberately;
- review license and distribution compatibility;
- do not add a library for functionality easily implemented safely in a few lines;
- do not reimplement complex geospatial/cryptographic functionality casually when a vetted library is appropriate;
- run dependency audit/review before release;
- Yandex packages require explicit compatibility testing before version bumps;
- WordPress packages belong in the WordPress build/editor architecture, not duplicated in frontend bundles unnecessarily.

Never commit a dependency merely to access one icon if vendored assets already satisfy that use case.

---

## 20. Repository and release hygiene

Development workspace directories are not plugin deliverables.

**Never include in the production plugin ZIP:**

- `.git/`;
- `.idea/`;
- `node_modules/`;
- development `vendor/` when production code does not require Composer runtime dependencies;
- tests and development tooling unless intentionally required by the release policy.

The current custom release script uses the explicit `package.json` `files` allow-list. `.distignore` is useful ecosystem metadata but is **not automatically authoritative for this custom packager**. When packaging changes, test the actual ZIP contents.

Source files and build/reproducibility material may remain in the WordPress.org package when required for readable-source/GPL compliance and transparent builds. Do not remove `src/`, license notices, or provenance documentation merely to save a few kilobytes.

### 20.1 Current repository warning

The supplied development archive contains `.git`, `.idea`, `node_modules` and `vendor`, making the archive close to a gigabyte, while the actual production plugin package is only around the low-megabyte/uncompressed range and sub-megabyte compressed range.

Furthermore, the supplied `.git` working tree indicates that much of the 2.0 implementation is currently untracked/modified relative to the old imported baseline. Before treating this repository as the canonical source:

1. review `git status` carefully;
2. add the intended 2.0 source files;
3. ensure generated/development directories remain ignored;
4. commit a clean 2.0 baseline;
5. tag releases deliberately.

Do not build a professional release process on an untracked working tree.

---

## 21. What is currently not “unnecessary”

Do not delete these just because they appear optional:

- `assets/icons/` — used by runtime;
- `src/` — readable source and source of generated build;
- `docs/architecture.md` / `docs/pro-extension.md` — useful engineering specifications, though they must never be confused with implemented features;
- `third-party-notices.txt` / `LICENSES/` — required provenance/license material;
- legacy/deprecation code — needed for existing content;
- `templateId`, `overrides`, `extensions` — reserved extension seam if PRO remains an active roadmap.

If PRO is permanently abandoned, then reserved attributes/seams can be reevaluated in a major compatibility-aware cleanup. Until then, they are intentional architecture, not accidental junk.

Potentially optional **for the production distribution only** are development-oriented docs/scripts/lockfiles depending on the chosen WordPress.org source-disclosure/reproducibility policy. Optimize release contents only after preserving compliance and reproducibility.

---

## 22. Required implementation roadmap

Agents should prioritize architectural leverage before adding random surface-area features.

### P0 — make 2.0 a clean, reproducible baseline

- clean Git state and commit the actual source;
- verify release ZIP allow-list;
- preserve current passing lint/unit/smoke tests;
- add canonical capability matrix;
- add generated icon manifest + icon validation/picker;
- reduce PHP/JS schema drift with shared contract tests/canonical schema direction;
- document exact Free vs PRO implementation status.

### P1 — complete applicable JavaScript API v3 foundations

- missing map props with safe UX (`worldOptions`, hotspots strategy, projection, tilt range, applicable distribution settings, etc.);
- full allow-listed behavior coverage;
- normalized event layer;
- real hints;
- geometry/feature model;
- layer/source abstraction;
- applicable official modules (`controls-extra`, `distribution`, `ruler`);
- advanced control architecture;
- schema-aware map customization UI.

### P2 — search and location services

- Geosuggest adapter + accessible editor combobox;
- Geocoder forward/reverse integration;
- organization-search adapter when configured;
- route/directions abstraction;
- service credentials/settings/caching/error handling.

### P3 — stable extension V1

- typed/versioned provider registry;
- DTO/query contracts;
- contract tests;
- editor/runtime capability registration;
- template resolver contract.

### P4 — PRO Store Locator standard/large-local

- locator data model;
- map/cards synchronized query session;
- REST API;
- indexed local projection/custom tables where justified;
- imports;
- filters/radius/distance/geolocation;
- virtualized cards;
- viewport queries;
- FacetWP adapter;
- server clusters for large local mode.

### P5 — licensing/private updates

- signed entitlement protocol;
- admin activation UI;
- asynchronous refresh/grace states;
- cryptographically verified private updater;
- no synchronous frontend dependency on vendor infrastructure.

### P6 — enterprise scale/providers

- provider-specific spatial backend;
- million-row contract tests;
- server aggregation/tiles/clusters;
- asynchronous import/index publication;
- observability and performance budgets.

---

## 23. Definition of Done checklist

Before declaring a task complete, verify every applicable item:

- [ ] Official current Yandex API docs were checked for changed/uncertain APIs.
- [ ] User-facing behavior is complete, not a placeholder.
- [ ] Editor UI exists for normal users.
- [ ] Advanced raw configuration is bounded and validated.
- [ ] PHP normalization accepts only intended data.
- [ ] Frontend runtime renders exactly the persisted normalized configuration.
- [ ] No PHP/JS default/schema drift was introduced.
- [ ] Multiple maps still work on one page.
- [ ] Block editor iframe still works.
- [ ] Cleanup/destroy removes observers/listeners/entities.
- [ ] Error/no-key/offline behavior is deliberate.
- [ ] Accessibility was considered and keyboard behavior tested.
- [ ] Privacy/network implications were documented.
- [ ] Strings are translatable.
- [ ] Backward compatibility/migration is covered.
- [ ] JS tests pass.
- [ ] PHP tests/syntax/coding standards pass.
- [ ] Production build succeeds.
- [ ] Generated `build/` matches source.
- [ ] Release ZIP was inspected and contains no dev-only directories.
- [ ] Documentation says what is actually implemented, not what is merely planned.

---

## 24. Agent working rules

When modifying this project:

1. Read the relevant source, tests, `docs/architecture.md`, `docs/audit.md`, and `docs/pro-extension.md` before changing architecture.
2. Search for all consumers of a configuration key before renaming/changing it.
3. Preserve the block name and legacy migrations unless the task explicitly includes a migration plan.
4. Verify uncertain Yandex API names/props against the **official current documentation**; never invent them from memory.
5. Prefer documented public APIs over private/internal Yandex implementation details.
6. Do not expose an option in Gutenberg until PHP normalization and runtime implementation exist.
7. Do not add a runtime dependency without measuring its bundle/runtime effect.
8. Do not increase marker/payload ceilings as a substitute for proper large-data architecture.
9. Do not implement PRO by placing paid code behind `if ( license )` inside the Free WordPress.org plugin.
10. Do not implement a license check that can take down public maps when the license server is offline.
11. Do not call a roadmap item “implemented” merely because an interface, attribute or Markdown design exists.
12. Keep code readable. Avoid clever abstractions that make ordinary debugging harder.
13. Update tests and docs in the same change as behavior.
14. Run the complete relevant validation suite before finishing.

---

## 25. Official documentation starting points

Always verify the current docs, but these are the primary product families the architecture is expected to track:

- Yandex Maps JavaScript API: `https://yandex.com/maps-api/docs/js-api/`
- JS API packages: `https://yandex.com/maps-api/docs/js-api/reference-guide/packages.html`
- JS API modules: `https://yandex.com/maps-api/docs/js-api/ref/modules/`
- Yandex Maps API documentation catalog: `https://yandex.com/maps-api/docs`
- Geocoder API: `https://yandex.com/maps-api/docs/geocoder-api/`
- Geosuggest API: `https://yandex.com/maps-api/docs/suggest-api/`
- Distance Matrix API: `https://yandex.com/maps-api/docs/distancematrix-api/`

Do not freeze the feature matrix to this file forever. At every substantial release, audit official Yandex capabilities and explicitly classify new/deprecated functionality as:

- implemented Free;
- implemented PRO;
- planned;
- intentionally not applicable;
- deprecated/removed upstream.

That capability audit is part of maintaining a premium-quality mapping product.
