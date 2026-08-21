# Map Block for Yandex: target architecture

Status: target ADR and roadmap; it is not the Free 2.0 public API  
Scope: the WordPress.org/free plugin and the proposed extension surface  
Related: [PRO extension architecture](pro-extension.md)

This document deliberately separates the code shipped in Free 2.0 from the
contracts required before a PRO add-on is released. Names and signatures in
sections marked **proposed** are design input, not compatibility promises.

## 1. Architectural goals

The free plugin must remain a complete, useful Yandex Maps block. It must:

- support any number of independent block instances on a page;
- render correctly in block themes and classic themes without theme-specific CSS;
- use the current Block API and a server-side render boundary;
- load the Yandex runtime once and only on pages that contain the block;
- support inline markers and client-side clustering without coupling persisted content to a specific Yandex API generation;
- preserve existing gutenberg-yandex-block/map content;
- evolve toward small, versioned extension contracts for PRO and third-party integrations;
- remain functional when PRO is missing, disabled, expired, or temporarily unable to reach a remote service.

The million-location requirement means that a data set may contain one million or more rows. It never means inserting one million markers, cards, post IDs, or serialized block attributes into a page. The runtime must request only a bounded viewport result, server-side clusters, and a virtualized card page.

## 2. Constraints that shape the design

### WordPress.org and GPL

The directory plugin must be GPL-compatible. Paid implementation code must not be shipped in the free plugin and then unlocked by a payment check. WordPress.org explicitly recommends a separately distributed add-on for premium code.

Production JavaScript and CSS may be bundled and minified, but the corresponding readable source and build instructions must either ship with the plugin or be linked from readme.txt at a public, maintained location. Obfuscation or deliberately unreadable names are not an acceptable way to protect a commercial plugin.

The free plugin must not download, install, or update the PRO add-on from a non-WordPress.org server. It must not contact a licensing server before an administrator explicitly starts activation. The required Yandex external service, its terms, the data sent to it, and any optional hosted locator service must be documented in readme.txt and the privacy policy.

Primary reference: https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/

### Gutenberg

Block metadata is authoritative. The block uses API version 3, block.json, useBlockProps, block supports, and a dynamic render callback. Frontend assets are declared as view assets and are not globally enqueued. If the minimum WordPress version is 6.5 or newer, viewScriptModule and the Interactivity API are preferred for shared map/list state. A small viewScript controller remains a valid fallback if older WordPress versions are supported.

Primary references:

- https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/
- https://developer.wordpress.org/block-editor/reference-guides/block-api/block-api-versions/
- https://developer.wordpress.org/block-editor/reference-guides/interactivity-api/

### Provider isolation

Persisted settings use canonical domain names, not raw constructor arguments from Yandex Maps 2.1 or v3. Coordinates are represented as named latitude and longitude values in PHP and editor state. Provider adapters convert them to the order required by the provider. GeoJSON and Yandex Maps v3 output use longitude, latitude order.

Free 2.0 allow-lists the map options it passes to Yandex. Customization rules are bounded, prototype-safe JSON data, but Free does not claim to reproduce Yandex's evolving semantic customization schema; unsupported rule semantics are rejected by the provider. JavaScript callbacks, arbitrary HTML, constructor names and executable code are never stored in block attributes. Advanced behavior that needs a callback is registered as code through a future extension API.

## 3. Decision: modular free core plus separately distributed add-on

The free plugin is a modular monolith. PRO will be a separate plugin that depends on the WordPress.org slug of the free plugin. Free 2.0 owns config validation, block registration, rendering, the Yandex adapter, inline markers and a small legacy provider seam. The typed query contracts and registry described below are proposed and must be implemented and contract-tested before PRO depends on them. PRO owns templates, large data sources, store locator UI, FacetWP integration, import pipelines, license state and optional hosted-service connectors.

The Requires Plugins header can improve activation UX, but it does not guarantee plugin load order or a minimum dependency version. PRO therefore performs class/interface and semantic version checks on plugins_loaded. Registration itself happens later through a typed registry action, after every active plugin file has been included.

Proposed boot sequence for the future V1 registry:

1. Each plugin file registers a bootstrap callback on plugins_loaded.
2. Free constructs the extension registry on plugins_loaded at a documented priority.
3. On init before block registration, Free fires guyamap_register_extensions with the mutable registry.
4. Free freezes the registry and rejects late or duplicate registrations.
5. Blocks, REST controllers and frontend assets consume the frozen registry.

Reference: https://make.wordpress.org/core/2024/03/05/introducing-plugin-dependencies-in-wordpress-6-5/

## 4. Target modules and dependency direction

| Module | Responsibility | May depend on |
| --- | --- | --- |
| Domain | Map config, coordinates, filters, query/result DTOs | Nothing WordPress-specific |
| Contracts | Public V1 interfaces and registry types | Domain |
| Application | Config resolution, query dispatch, migration orchestration | Domain, Contracts |
| Blocks | Registration, editor boundary, dynamic renderer | Application, WordPress |
| REST | Versioned schemas and controllers | Application, WordPress |
| Infrastructure | Inline source, cache, Yandex loader configuration | Contracts, WordPress |
| Integrations | Optional adapters detected at runtime | Contracts |

Domain and public contracts must not call global WordPress functions. WordPress adapters sit at the edge. A small composition root creates services explicitly; business code must not pull dependencies out of a global service locator.

## 5. Persisted block contract

The existing name gutenberg-yandex-block/map is retained so old posts do not become invalid. Old attributes are migrated through Gutenberg deprecations/transforms and a server-side normalizer. A block save must never write a provider API key, license token, query result, resolved template marker data, or generated cluster payload.

The target persisted shape is versioned. Free 2.0 currently persists validated
top-level block attributes and normalizes legacy content at both the editor and
server boundaries. The nested definition below is a future schema, not the
shape currently written into post content:

    {
      "schemaVersion": 2,
      "camera": {
        "center": { "latitude": 55.751244, "longitude": 37.618423 },
        "zoom": 12,
        "minZoom": 1,
        "maxZoom": 21,
        "tilt": 0,
        "azimuth": 0
      },
      "container": {
        "height": "480px",
        "minHeight": "280px",
        "aspectRatio": ""
      },
      "appearance": {
        "theme": "auto",
        "mode": "auto",
        "customization": []
      },
      "interactions": {
        "behaviors": [ "drag", "scrollZoom", "pinchZoom", "dblClick" ],
        "controls": {}
      },
      "cluster": {},
      "loading": {},
      "source": { "type": "inline" },
      "markers": [],
      "accessibility": {},
      "extensions": {}
    }

Free 2.0 preserves a bounded `extensions` namespace bag. It does not yet have a
namespace-registration API or per-namespace schema validation. An add-on must
therefore wait for the proposed registry before treating this as a stable
storage contract. The reserved `templateId` and `overrides` attributes are
also preserved but have no behavior in Free.

Inline marker count and total serialized config size have hard limits. Future large collections will be referenced by a source UUID and will never be embedded into post_content or data attributes.

## 6. Proposed config schema, migrations and merge semantics

A single ConfigSchema service defines defaults, types, ranges, sanitizer, whether a field is inheritable, and its merge strategy. PHP, REST and editor controls derive from or test against the same schema. Block metadata alone is not sufficient validation for nested objects.

Resolution order is:

1. immutable core defaults;
2. validated site defaults;
3. zero or more parent templates;
4. the selected template;
5. per-block overrides;
6. narrowly scoped runtime context, such as locale.

Objects merge recursively. Scalars replace. Arrays replace in full unless a field explicitly declares an ID-keyed merge strategy. An absent path inherits. An empty string or empty array is an explicit value. Null means remove the inherited value and fall back to the schema default. Unknown keys are rejected except inside a registered extension namespace.

Every persisted document has schemaVersion. Pure migrators run sequentially from N to N+1 and are idempotent. Rendering may normalize old data in memory; permanent rewriting happens only during an explicit save or migration job.

## 7. Proposed public PHP V1 contracts

These interfaces are not present in Free 2.0. They are the intended
compatibility boundary for a later release. Exact DTO implementation may be
internal, but the eventual public interfaces must be versioned, tested and use
syntax compatible with the declared minimum PHP version before an add-on may
depend on them.

    namespace GuYaMap\Contracts\V1;

    interface MapConfigResolverInterface {
        public function resolve(
            MapDefinition $definition,
            RenderContext $context
        ): ResolvedMapConfig;
    }

    interface TemplateResolverInterface {
        public function resolve(
            TemplateReference $template,
            ConfigPatch $overrides,
            RenderContext $context
        ): TemplateResolution;
    }

    interface FeatureProviderInterface {
        public function id(): string;

        public function capabilities(): FeatureProviderCapabilities;

        public function query(
            SourceDefinition $source,
            FeatureQuery $query
        ): FeatureResult;

        public function getCard(
            SourceDefinition $source,
            CardQuery $query
        ): ?CardViewModel;

        public function revision(SourceDefinition $source): string;
    }

    interface CacheStoreInterface {
        public function get(string $key);
        public function set(string $key, $value, int $ttl): bool;
        public function delete(string $key): bool;
    }

    interface CapabilityProviderInterface {
        public function has(string $capability, CapabilityContext $context): bool;
    }

    interface IntegrationInterface {
        public function id(): string;
        public function isAvailable(): bool;
        public function register(ExtensionRegistry $registry): void;
    }

FeatureQuery is immutable and contains:

- source ID and optional expected dataset revision;
- viewport bounds and zoom;
- a normalized FilterExpression tree;
- search text;
- allow-listed sort specifications;
- an opaque keyset cursor and bounded limit;
- requested projections: map, cards and/or facet counts;
- locale and a request correlation ID.

FeatureResult contains:

- query hash and dataset revision;
- a bounded set of individual features;
- a bounded set of server clusters;
- a card page with next cursor;
- exact or explicitly approximate total;
- facet counts when requested;
- truncation flags, warnings and cache metadata.

Capabilities are descriptive, not licensing booleans. Examples are supportsServerClustering, supportsFacets, supportsCards, supportsRealtimeUpdates and supportsViewportFiltering.

## 8. Proposed extension registration

The future primary registration action is:

    do_action(
        'guyamap_register_extensions',
        $registry
    );

Here $registry is an ExtensionRegistry instance created by Free. The registry exposes explicit subregistries:

- configFields()
- featureProviders()
- templateResolvers()
- capabilityProviders()
- cardRenderers()
- integrations()

Each registration has a lowercase stable ID, an implementation, a priority and a declared contract version. Duplicate IDs and incompatible versions fail with an admin-visible diagnostic; they do not fatal the frontend.

Narrow filters are available after the typed services have done their work:

| Hook | Arguments | Rules |
| --- | --- | --- |
| guyamap_map_definition | MapDefinition, RenderContext | Runs before resolution; returned DTO is validated |
| guyamap_resolved_config | ResolvedMapConfig, RenderContext | Runs after resolution; returned config is validated again |
| guyamap_feature_query | FeatureQuery, SourceDefinition | Cannot change source authorization |
| guyamap_feature_result | FeatureResult, FeatureQuery | Result is projected and escaped after the filter |
| guyamap_card_view_model | CardViewModel, CardContext | Structured fields only; HTML is sanitized later |
| guyamap_public_feature_fields | string array, SourceDefinition | Can remove fields; adding fields requires schema registration |
| guyamap_rest_cache_ttl | integer, CacheContext | Bounded by endpoint policy |

Lifecycle actions:

- guyamap_source_revision_published
- guyamap_template_revision_published
- guyamap_cache_invalidated
- guyamap_map_rendered

License credentials, hosted-service bearer tokens, raw SQL and unsanitized
request bodies must never reach extension hooks. The current render and editor
settings filters can receive the public Yandex browser API key; it must never
be mistaken for a server-side secret.

### Free 2.0 hooks that actually ship

The following hooks are implementation seams in 2.0. They are documented here
for auditability, but they are not the proposed typed V1 query API:

| Hook | Purpose |
| --- | --- |
| `guyamap_block_metadata_directory` | Replace the metadata directory before registration |
| `guyamap_block_registration_args` | Adjust block registration arguments |
| `guyamap_block_registered` | Observe the completed block registration attempt |
| `guyamap_editor_settings` | Adjust bounded public editor settings |
| `guyamap_normalized_map_config` | Filter normalized config before rendering |
| `guyamap_map_render_config` | Adjust registered fields/extension data before final revalidation; server-owned runtime fields are then restored |
| `guyamap_rendered_map_html` | Filter the final escaped block HTML |
| `guyamap_fallback_url` | Adjust the validated fallback URL |
| `guyamap_normalized_marker` | Filter one marker from trusted PHP; the bundled runtime allow-lists its known fields |
| `guyamap_max_inline_markers` | Reduce the hard inline-marker ceiling |
| `guyamap_allowed_behaviors` | Reduce the core behavior allow-list |
| `guyamap_yandex_api_key` / `guyamap_yandex_language` | Adjust public SDK settings |
| `guyamap_sanitized_settings` / `guyamap_locales` | Adjust already-sanitized settings or reduce/label supported locales |
| `guyamap_privacy_policy_content` | Append sanitized external-service disclosure text |
| `guyamap_feature_providers` | Register legacy initialization providers |
| `guyamap_feature_provider_registered` / `guyamap_feature_providers_registered` | Observe legacy provider initialization |

The `GuYaMap\Contracts\Feature_Provider_Interface` shipped in 2.0 is a small
bootstrap interface (`get_id()` and `register()`). It is not the query-oriented
`GuYaMap\Contracts\V1\FeatureProviderInterface` proposed above.
Bootstrap providers may also be added through
`guyamap()->register_feature_provider()` before or after the initialization
phase; this method does not provide map queries or data transport.

## 9. JavaScript boundary

The frontend is an imperative controller around a provider adapter, not a React application per map. The editor can use WordPress React packages. One page-level loader promise imports the Yandex API and required official modules once. Each block owns an instance controller and can be destroyed independently.

The proposed ProviderAdapter V1 has the following conceptual surface:

    create(container, config)
    updateConfig(configPatch)
    setFeatures(features, clusters)
    setSelection(featureId)
    getViewport()
    fitBounds(bounds)
    on(eventName, listener)
    destroy()

The target provider-neutral DOM events are:

- guyamap:ready
- guyamap:querychange
- guyamap:results
- guyamap:select
- guyamap:error
- guyamap:destroy

Free 2.0 currently emits `guyamap:ready`, `guyamap:error` and
`guyamap:destroy`, and accepts `guyamap:refresh`. These events are experimental:
`ready` currently includes the runtime controller and Yandex map object. It is
not the versioned event schema above. The query/result/selection events will be
added only with the provider contract.

Multiple maps are keyed by runtime instance IDs generated during render. Persisted editor client IDs are not used as globally unique data IDs.

## 10. Rendering and asset performance

The Free 2.0 block is dynamic so global settings, translations and trusted PHP
filters can change without resaving every post. Future template/source revision
resolution will use the same server-render boundary. The renderer:

- obtains wrapper attributes through get_block_wrapper_attributes();
- emits semantic fallback content and a fixed-size skeleton to prevent layout shift;
- emits only sanitized, bounded initial config;
- uses wp_json_encode with JSON_HEX_TAG, JSON_HEX_AMP, JSON_HEX_APOS and JSON_HEX_QUOT when JSON is embedded in HTML;
- enforces a hard ceiling of 1,000 inline markers; larger future collections must use a server-backed source;
- enqueues view assets only when a block is rendered.

The Free 2.0 view controller:

- waits for IntersectionObserver using a configurable root margin;
- shares a single Yandex API promise per document realm across every block;
- creates independent instance controllers and exposes explicit `refresh()` and `destroy()` helpers;
- removes instance-owned controls, listeners and timers during explicit destroy;
- keeps inline markers below the hard 1,000-object ceiling;
- loads the clusterer chunk only for clustered frontend maps.

Camera-query debouncing, abortable provider requests, automatic DOM-removal
cleanup, ResizeObserver integration and virtualized cards belong to the future
locator/provider runtime and are not Free 2.0 claims.

Suggested initial budgets, to be verified by automated benchmarks:

| Metric | Target |
| --- | --- |
| Plugin view runtime, excluding Yandex | less than 45 KB gzip |
| Initial inline config per map | less than 16 KB |
| Warm viewport response p95 | less than 200 ms on reference infrastructure |
| Cold viewport response p95 | less than 750 ms |
| Map response | less than 1 MB and no more than 1,000 rendered objects |
| Card page | 20 to 50 items, cursor based |
| Main-thread task caused by plugin | less than 50 ms |

These are engineering budgets, not marketing guarantees. Release tests must include many blocks on one page and synthetic 10K, 100K and 1M source profiles.

## 11. Target REST and security baseline

Free 2.0 does not expose map-data REST routes. When locator routes are added,
they must use `WP_REST_Controller`, a versioned namespace, a complete JSON
Schema and a `permission_callback`. Validation happens before sanitization.
Public endpoints return only published source projections; write endpoints
check a capability in addition to the REST nonce.

Public map data does not need a nonce because nonces are not authorization and would prevent shared caching. Private source routes authenticate and return private/no-store cache headers. No route accepts raw meta_query, SQL fragments, arbitrary field names or arbitrary orderby values.

Inputs have hard bounds:

- valid coordinate and zoom ranges;
- maximum request body and filter node count;
- maximum selected values per facet;
- maximum page size;
- allow-listed fields, operators and sorts;
- bounded text search length;
- syntactically valid source UUID, cursor and query ID.

Free marker content is structured plain text and is escaped at output. The
client builds DOM with `textContent` and never assigns marker strings to
`innerHTML`. Future rich card fields, if introduced, must use a narrowly
defined `wp_kses` allow-list.

REST references:

- https://developer.wordpress.org/rest-api/extending-the-rest-api/adding-custom-endpoints/
- https://developer.wordpress.org/rest-api/extending-the-rest-api/schema/
- https://developer.wordpress.org/apis/security/

## 12. Compatibility and failure policy

- The old block name remains registered.
- Old latitude/longitude attributes are normalized without assuming non-negative coordinates.
- A provider-specific config is never silently reinterpreted by a different adapter.
- Free 2.0 does not permanently rewrite unknown content during rendering.
- API failures retain an accessible fallback link and a controlled error state.
- Future PRO must retain its last safe presentation snapshot when it is missing or disabled.
- A future license outage must never make existing public pages blank.

## 13. Delivery status and roadmap

Free 2.0 ships:

1. `block.json`/API v3 dynamic registration with the existing block name;
2. bounded PHP and JavaScript normalization plus legacy block migration;
3. inline markers and bounded client-side clustering;
4. a Yandex v3 runtime with one per-document-realm loader, lazy instances and explicit cleanup;
5. a bounded neutral `extensions` bag;
6. PHP/JS linting, unit tests and reproducible build instructions.

Before a PRO add-on can depend on a stable Free contract, implement and test:

1. the canonical `ConfigSchema` and sequential versioned migrators;
2. the typed extension registry and V1 query DTOs;
3. an inline provider implemented through that query contract;
4. a provider-neutral adapter and stable, non-leaking browser event payloads;
5. versioned REST request/response envelopes and controllers;
6. per-namespace extension validation and explicit preservation tests;
7. DOM-removal, multi-instance, iframe-editor and contract integration tests.

Defer to PRO:

- template entities and inheritance UI;
- location tables, import jobs and server clustering;
- store locator/card block;
- FacetWP bridge;
- licensing and vendor updates;
- hosted geospatial/search connectors.

Do not add placeholder PRO implementations or license-gated dormant feature code to the WordPress.org package. Only the neutral contracts and preservation fields belong in Free.
