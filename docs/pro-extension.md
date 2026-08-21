# Map Block for Yandex PRO: extension architecture

Status: accepted design, implementation deferred  
Dependency: a future Map Block for Yandex release with finalized V1 contracts  
Related: [core architecture](architecture.md)

## 1. Packaging and entitlement boundary

PRO is a separately distributed plugin, not a collection of dormant classes inside the WordPress.org package. It contains:

- map templates and inheritance;
- location sources, importers and background jobs;
- the store locator map/card experience;
- server-side clustering and scalable query providers;
- FacetWP integration;
- optional hosted geospatial/search connectors;
- license activation and vendor update support.

Free remains useful without PRO: it renders maps, inline markers and bounded client-side clusters. Once the proposed Free V1 registry has been implemented and contract-tested, PRO will register implementations through `guyamap_register_extensions`. Free 2.0 does not yet expose that registry. No Free class has a direct compile-time dependency on a PRO class.

The PRO plugin header should declare the Free WordPress.org slug with Requires Plugins and a vendor Update URI. Because WordPress does not guarantee dependency load order or dependency versions, PRO also checks the V1 contract marker and minimum Free semantic version on plugins_loaded. An incompatibility disables only PRO services and shows one scoped admin notice.

## 2. ADR PRO-001: templates are versioned configuration entities

### Decision

Use a private custom post type, guyamap_template, for the authoring entity. It has:

- show_ui enabled;
- public and publicly_queryable disabled;
- revisions enabled;
- a custom REST controller;
- dedicated capabilities such as edit_guyamap_templates and publish_guyamap_templates;
- no PHP, JavaScript or unrestricted HTML in stored config.

Suggested protected metadata:

| Key | Meaning |
| --- | --- |
| _guyamap_template_uuid | Stable UUID for export/import and cross-environment mapping |
| _guyamap_template_parent | Optional parent template UUID |
| _guyamap_template_config | Validated canonical configuration JSON |
| _guyamap_template_schema | Config schema version |
| _guyamap_template_hash | Hash of normalized config and parent revision chain |
| _guyamap_template_snapshot | Last safely resolved presentation snapshot |

The block keeps a local template ID for editor lookup and a stable UUID in its PRO extension namespace. It stores only a bounded override patch and a last-known resolved presentation snapshot. Marker data and location source rows are never copied into that snapshot.

### Resolution

Resolution order is core defaults, site defaults, oldest ancestor, newer ancestors, selected template, then block overrides. One parent is allowed per template. The resolver:

1. resolves by UUID and verifies read permission/state;
2. tracks visited UUIDs;
3. rejects a cycle;
4. enforces a maximum depth of eight;
5. migrates each config to the current schema in memory;
6. applies the field registry's merge strategy;
7. validates the final result;
8. calculates a deterministic resolution hash.

Arrays replace by default. ID-keyed collections merge only when their schema explicitly declares that strategy. Missing means inherit, an empty value is explicit, and null removes the inherited value and returns to the schema default.

Presentation, controls, interaction, clustering and loading fields are inheritable. A data source is non-inheritable by default because accidentally pointing many blocks at a production source is a security and performance risk. An administrator must explicitly allow source inheritance on the template.

### Cache and invalidation

Resolved templates are cached by:

    schema version
    + site-default revision
    + ordered template revision hashes
    + normalized override hash
    + relevant locale

Saving, restoring or deleting a template publishes guyamap_template_revision_published and invalidates hashes containing its UUID. A reverse dependency index can be maintained in object cache; correctness must not depend on it. A cache miss simply resolves the bounded eight-node chain.

### Failure behavior

- A missing or trashed template falls back to the saved presentation snapshot and warns an editor.
- PRO deactivation does not blank public maps.
- An expired license makes template editing read-only after the grace policy; existing rendering continues from local code and snapshots.
- A future unsupported schema is not overwritten.

## 3. ADR PRO-002: one query model drives map and cards

The map and the card list are two projections of the same immutable FilterExpression and dataset revision. They must never issue unrelated queries and then attempt to reconcile IDs in the browser.

The page-level locator store owns:

- sourceId and datasetRevision;
- normalized non-geographic filters;
- search and sort;
- viewport and zoom;
- whether viewport filtering affects cards;
- active queryId and queryHash;
- map projection, card cursor/page and facet counts;
- selected and hovered feature IDs;
- request generation number and abort controllers.

Every response repeats queryHash and datasetRevision. A response from an older generation, query hash or source revision is discarded.

Map movement normally changes only the map projection. When the user enables Search this map area, the viewport becomes part of the canonical filters and the card/facet projections refresh too.

## 4. Public locator provider contract

PRO will implement the query-oriented V1 `FeatureProviderInterface` after it is finalized in Free. The bootstrap-only `GuYaMap\Contracts\Feature_Provider_Interface` in Free 2.0 is not this interface. The following value semantics are required.

FeatureQuery:

    sourceId: UUID
    expectedRevision: optional unsigned integer string
    viewport: optional west, south, east, north
    zoom: integer
    filters: normalized boolean expression tree
    search: bounded Unicode string
    sort: allow-listed field and direction list
    cursor: optional opaque keyset cursor
    limit: bounded integer
    include: map, cards and/or facets
    locale: WordPress locale
    requestId: random correlation identifier

Feature:

    id: source-scoped stable string
    geometry: GeoJSON Point using longitude, latitude
    styleKey: registered marker style identifier
    properties: allow-listed compact public values

Cluster:

    id: revision and query-scoped stable string
    geometry: representative Point
    count: integer
    bounds: west, south, east, north
    expansionZoom: optional integer
    styleKey: registered cluster style identifier

CardViewModel:

    id
    heading
    summary
    permalink
    image descriptor
    address
    distance when requested
    badges as structured items
    accessible label

The result may report totalExact false. A UI must label approximate totals as approximate rather than silently presenting them as exact.

### PRO-only extension contracts

PRO has its own registry for replaceable infrastructure. It is not added to Free:

    do_action(
        'guyamap_pro_register_locator_extensions',
        $registry
    );

Here $registry is a LocatorExtensionRegistry instance created by PRO. Its subregistries are importers(), filterCodecs(), facetWpCodecs(), querySessionStores(), clusterBuilders() and hostedProviders().

    interface LocationImporterInterface {
        public function id(): string;
        public function supports(ImportDefinition $definition): bool;
        public function begin(ImportDefinition $definition): ImportCursor;
        public function nextBatch(
            ImportCursor $cursor,
            int $maximumRows
        ): ImportBatch;
    }

    interface FacetWpFilterCodecInterface {
        public function id(): string;
        public function supports(array $facetDefinition): bool;
        public function decode(
            array $facetDefinition,
            array $selectedValues,
            FilterCodecContext $context
        ): FilterExpression;
    }

    interface QuerySessionStoreInterface {
        public function create(
            NormalizedQuery $query,
            int $ttl
        ): QuerySession;

        public function get(string $opaqueId): ?QuerySession;
        public function delete(string $opaqueId): bool;
    }

    interface ClusterTileBuilderInterface {
        public function build(
            SourceRevision $source,
            ClusterBuildProfile $profile
        ): ClusterBuildReport;
    }

PRO-specific narrow hooks are:

| Hook | Purpose |
| --- | --- |
| guyamap_pro_import_row | Normalize an already parsed row before schema validation |
| guyamap_pro_filter_fields | Register public filter field descriptors |
| guyamap_pro_card_view_model | Change a structured card before escaping |
| guyamap_pro_cluster_profile | Add a finite prebuilt cluster profile |
| guyamap_pro_query_session_ttl | Reduce or increase TTL within hard service bounds |
| guyamap_pro_facetwp_instance_config | Adjust a scoped, validated integration config |

Importer and query hooks never accept SQL fragments. A filter field descriptor maps a public ID to a provider-owned prepared-query implementation.

### FilterExpression grammar

The REST and provider grammar contains only two node shapes:

    {
      "op": "and | or",
      "children": [ "...more expression nodes..." ]
    }

    {
      "field": "registered-public-field-id",
      "operator": "eq | neq | in | not_in | between | gte | lte | exists",
      "values": [ "typed, validated values" ]
    }

The schema caps tree depth, total nodes and values per predicate. A field descriptor declares its value type and permitted operators. Empty and, empty or, mixed value types, unknown fields and unsupported operators are validation errors rather than provider-specific guesses.

## 5. ADR PRO-003: local storage is normalized and revisioned

Custom tables use the current blog's wpdb prefix, dbDelta-compatible DDL, the site's charset/collation, prepared queries and no hard-coded wp_ prefix. Foreign keys are intentionally omitted because WordPress lifecycle, multisite and dbDelta do not manage them reliably. Batched application-level cleanup removes old revisions.

Coordinates are stored as signed integers multiplied by 10,000,000. This avoids binary floating-point comparison drift. Explicit lat_e7 and lng_e7 names prevent coordinate-order mistakes. API responses convert to GeoJSON longitude, latitude order.

### Sources

    CREATE TABLE <prefix>guyamap_sources (
        id bigint unsigned NOT NULL AUTO_INCREMENT,
        uuid char(36) NOT NULL,
        type varchar(32) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'draft',
        schema_version smallint unsigned NOT NULL,
        current_revision bigint unsigned NOT NULL DEFAULT 0,
        item_count bigint unsigned NOT NULL DEFAULT 0,
        config_json longtext NOT NULL,
        created_at datetime NOT NULL,
        updated_at datetime NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uuid (uuid),
        KEY status (status)
    ) <charset_collate>;

### Locations

    CREATE TABLE <prefix>guyamap_locations (
        id bigint unsigned NOT NULL AUTO_INCREMENT,
        source_id bigint unsigned NOT NULL,
        revision bigint unsigned NOT NULL,
        external_id varchar(191) NOT NULL,
        external_id_hash binary(32) NOT NULL,
        post_id bigint unsigned NULL,
        lat_e7 int NOT NULL,
        lng_e7 int NOT NULL,
        tile_x14 smallint unsigned NOT NULL,
        tile_y14 smallint unsigned NOT NULL,
        style_key varchar(64) NOT NULL DEFAULT 'default',
        card_json longtext NOT NULL,
        payload_json longtext NOT NULL,
        status tinyint unsigned NOT NULL DEFAULT 1,
        updated_at datetime NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY external_revision (
            source_id, revision, external_id_hash
        ),
        KEY source_tile (
            source_id, revision, tile_x14, tile_y14
        ),
        KEY source_post (
            source_id, revision, post_id
        ),
        KEY source_status (
            source_id, revision, status
        )
    ) <charset_collate>;

tile_x14 and tile_y14 provide a portable baseline index for tile decomposition. An installer may add a spatial POINT column and SPATIAL index only after a feature test proves that the active MySQL/MariaDB version and storage engine support the exact required semantics. Correctness never depends on the optional spatial index.

external_id_hash is the binary SHA-256 digest of the canonical external ID. It keeps the unique composite index bounded under utf8mb4. Code must compare external_id too after a hash lookup, rather than treating a digest as logically collision-free.

### Facet values

    CREATE TABLE <prefix>guyamap_facet_values (
        id bigint unsigned NOT NULL AUTO_INCREMENT,
        source_id bigint unsigned NOT NULL,
        revision bigint unsigned NOT NULL,
        location_id bigint unsigned NOT NULL,
        facet_key varchar(64) NOT NULL,
        value_string varchar(191) NULL,
        value_number decimal(20,8) NULL,
        value_date datetime NULL,
        display_value varchar(191) NULL,
        PRIMARY KEY (id),
        KEY string_lookup (
            source_id, revision, facet_key,
            value_string, location_id
        ),
        KEY number_lookup (
            source_id, revision, facet_key,
            value_number, location_id
        ),
        KEY date_lookup (
            source_id, revision, facet_key,
            value_date, location_id
        ),
        KEY location_lookup (
            source_id, revision, location_id
        )
    ) <charset_collate>;

This generic index is appropriate for ordinary WordPress-scale sources. At one million locations with several high-cardinality facets, it may contain tens of millions of rows. The enterprise provider therefore uses a dedicated search engine or a source-specific denormalized index. The FeatureProvider contract keeps that choice outside blocks and REST controllers.

### Precomputed cluster tiles

    CREATE TABLE <prefix>guyamap_cluster_tiles (
        source_id bigint unsigned NOT NULL,
        revision bigint unsigned NOT NULL,
        profile_hash binary(32) NOT NULL,
        z tinyint unsigned NOT NULL,
        x int unsigned NOT NULL,
        y int unsigned NOT NULL,
        feature_count int unsigned NOT NULL DEFAULT 0,
        etag binary(32) NOT NULL,
        payload longblob NOT NULL,
        generated_at datetime NOT NULL,
        PRIMARY KEY (
            source_id, revision, profile_hash, z, x, y
        ),
        KEY generated_at (generated_at)
    ) <charset_collate>;

profile_hash identifies the unfiltered source or an explicitly prebuilt finite filter profile. It is not feasible to precompute every arbitrary facet combination.

## 6. Import, indexing and publication

Imports are resumable, idempotent and revisioned:

1. obtain a per-source lease with an owner token and expiry;
2. stream CSV, JSON, REST or post records in bounded batches;
3. validate and normalize each row before writing;
4. upsert by source, staging revision and external ID;
5. build facet indexes and clusters asynchronously;
6. run count, bounds, duplicate and sample-integrity checks;
7. atomically update sources.current_revision only after every required artifact is ready;
8. fire guyamap_source_revision_published;
9. prune old revisions later in bounded batches.

Readers always pin one published revision, so they never see half an import. Cache keys contain that revision. A failed job leaves the previous revision active.

WP-CLI is the preferred mechanism for million-row initial imports and index rebuilds. Web-admin jobs must yield frequently, report progress and use a real queue/cron runner. WP-Cron alone is not presented as a performance guarantee.

No import endpoint accepts a server filesystem path or arbitrary URL from a low-privilege user. Remote imports enforce an allow-list or explicit administrator confirmation, block private/link-local targets to prevent SSRF, cap redirects and response sizes, and use WordPress HTTP APIs with TLS verification enabled.

## 7. ADR PRO-004: server clustering and bounded rendering

Yandex Maps v3 YMapClusterer is useful only after the server has returned a bounded set. It must not receive the entire million-row source. For large sources:

- the client requests the visible tile set for the current zoom and query;
- low and medium zooms return server clusters;
- high zooms return bounded individual features and residual clusters;
- card details load only when visible or selected;
- map requests are debounced and stale requests are aborted;
- rendered DOM markers/clusters stay below a configured ceiling;
- cards use keyset pagination and windowing, never a million-node list.

The official Yandex v3 cluster package can cluster a bounded viewport page. Yandex 2.1 RemoteObjectManager demonstrates the same server-side/tile principle but uses JSONP. The new REST protocol uses JSON and fetch; no new JSONP endpoint is introduced.

References:

- https://yandex.com/maps-api/docs/js-api/object/markers/YMapClusterer.html
- https://yandex.com/dev/jsapi-v2-1/doc/en/v2-1/dg/concepts/remote-object-manager/about
- https://yandex.com/dev/jsapi-v2-1/doc/en/v2-1/dg/concepts/loading-object-manager/backend

For arbitrary filters, clusters are calculated by the selected provider and cached by normalized query hash, revision, zoom and tile. A persistent object cache is strongly recommended for six-figure sources and required for the supported million-row local profile. A hosted/external provider may return already aggregated tiles.

## 8. REST V1

Namespace: guyamap/v1

### Create a query session

    POST /locators/{source_uuid}/queries

Request:

    {
      "expectedRevision": "42",
      "filters": {
        "op": "and",
        "children": [
          {
            "field": "category",
            "operator": "in",
            "values": [ "pharmacy" ]
          }
        ]
      },
      "search": "",
      "sort": [
        { "field": "title", "direction": "asc" }
      ],
      "viewport": {
        "west": 27.40,
        "south": 53.80,
        "east": 27.80,
        "north": 54.05,
        "zoom": 11
      },
      "viewportFiltersCards": false,
      "include": [ "map", "cards", "facets" ],
      "cardLimit": 24
    }

Response:

    {
      "schemaVersion": 1,
      "queryId": "short-lived-opaque-value",
      "queryHash": "sha256-of-normalized-query",
      "datasetRevision": "42",
      "expiresAt": "2026-08-21T12:00:00Z",
      "map": {
        "features": [],
        "clusters": [],
        "truncated": false
      },
      "cards": {
        "items": [],
        "nextCursor": null,
        "total": 0,
        "totalExact": true
      },
      "facets": {}
    }

The query session stores only normalized filter/sort state in a bounded cache entry, not a million matching IDs. It expires after a short period. If a non-persistent cache loses it, the client repeats the POST. Session creation is rate-limited and deduplicated by query hash.

### Map tiles

    GET /locators/{source_uuid}/tiles/{z}/{x}/{y}?q={queryId}

This returns only features/clusters for one tile. Public published data uses an ETag and a bounded public max-age keyed by source revision and query hash. A stale revision returns 409 with the current revision so the client recreates the query.

### Card page

    GET /locators/{source_uuid}/cards?q={queryId}&cursor={cursor}&limit=24

The cursor is a signed opaque keyset containing the last allow-listed sort value and stable ID. Offset pagination is forbidden for the scalable provider.

### Card detail

    GET /locators/{source_uuid}/locations/{external_id}?q={queryId}

Only explicitly public fields are projected. Private import payload never leaves the provider.

### Administration

    GET|POST /sources
    GET|PUT|DELETE /sources/{uuid}
    POST /sources/{uuid}/imports
    GET /sources/{uuid}/jobs/{job_id}
    POST /sources/{uuid}/publish

Admin routes require dedicated capabilities and REST cookie authentication/nonce. Public routes have permission_callback set, then explicitly verify that the source and requested projection are published. Private sources are authenticated and use Cache-Control: private, no-store.

Every request uses a complete schema and hard limits for body bytes, filter depth/node count, values per operator, string length, zoom, tile coordinates and result size. Filter field IDs resolve through a registry. They are never concatenated into SQL identifiers without an allow-listed mapping.

## 9. Cache key and invalidation contract

Normalized filters:

- sort object keys deterministically;
- normalize field and operator IDs;
- normalize unordered selection sets by sorting and deduplicating;
- preserve order where the operator is order-sensitive;
- normalize numeric and date representations;
- omit UI-only state.

The map cache key is:

    provider ID
    + source UUID
    + dataset revision
    + normalized filter hash
    + viewport-filter mode
    + z/x/y
    + public field projection
    + locale
    + response schema version

Cards additionally include sort and cursor. Template appearance is not part of a data query key unless it changes returned style keys. Publication of a new revision invalidates by changing the key; old entries expire naturally.

## 10. ADR PRO-005: FacetWP is an adapter, not the locator core

FacetWP is optional and detected at runtime. No Free or PRO class is loaded from a FacetWP namespace before availability and version checks. The integration uses documented hooks/events and has contract tests against supported FacetWP versions.

### Supported WordPress/FacetWP profile

Exact two-way integration requires every location to map to a WordPress post_id and the source to be within FacetWP's practical result-set limits.

Server hooks used by the adapter:

| FacetWP hook | Use |
| --- | --- |
| facetwp_index_row | Add or normalize supported location facet values during indexing |
| facetwp_query_args | Scope a configured listing to the locator source |
| facetwp_facet_filter_posts | Implement the optional map-bounds facet from the location index |
| facetwp_filtered_post_ids | Capture the already filtered result scope for the current render only |
| facetwp_render_output | Add a bounded guyamap settings payload/query ID to the same AJAX response |

The bridge must be scoped by configured FacetWP template/listing name and locator instance ID. No bare global filter may affect unrelated listings.

Browser flow:

1. On facetwp-refresh, copy supported values from documented FWP.facets into the locator FilterExpression. Do not start a second refresh yet.
2. FacetWP performs its request.
3. facetwp_render_output appends output.settings.guyamap[instanceId] containing queryId, queryHash, revision and optionally the bounded initial projections. It never appends the full filtered post ID array.
4. On facetwp-loaded, the locator store consumes that payload and atomically updates cards and map.
5. If the payload is unavailable, the store creates a locator query from the same supported facet selections.
6. Selecting Search this map area writes the configured bounds facet into FWP.facets and calls FWP.refresh().
7. An origin token and an in-flight flag prevent map movement caused by results fitting from recursively refreshing FacetWP.

Supported facet types are mapped by a FacetWpFilterCodecRegistry. A facet type with no exact codec is rejected in settings with a clear compatibility message; it is never silently ignored because that would make cards and markers disagree.

References:

- https://facetwp.com/help-center/developers/javascript-reference/facetwp-loaded/
- https://facetwp.com/help-center/developers/hooks/querying-hooks/facetwp_filtered_post_ids/
- https://facetwp.com/help-center/developers/hooks/querying-hooks/facetwp_facet_filter_posts/
- https://facetwp.com/help-center/developers/hooks/output-hooks/facetwp_render_output/

### Million-row boundary

FacetWP's own scalability documentation places its best-case practical maximum in the hundreds of thousands and states that it does not integrate with Elasticsearch or Algolia. Its filtering model materializes post ID result sets. Therefore the product must not promise arbitrary FacetWP filters over one million locations on ordinary WordPress/MySQL.

Reference: https://facetwp.com/help-center/developers/facetwp-performance-speed-limits-and-scalability/

Supported product modes are:

| Mode | Data | Filters |
| --- | --- | --- |
| Standard | WordPress posts and local index | FacetWP or native filters |
| Large local | Custom location tables, persistent cache, prebuilt clusters | Native filters; bounded supported FacetWP profile only |
| Enterprise million+ | External/hosted spatial and search provider | Native locator facets backed by provider aggregations |

A future enterprise FacetWP bridge would need to replace FacetWP result querying, counts and listing pagination as one coherent adapter. Returning only a page of IDs from facetwp_facet_filter_posts is incorrect because counts and cross-facet choices would be wrong. That work is a separately versioned integration, not a claim of the initial PRO release.

## 11. ADR PRO-006: licensing protects distribution and services

### Security reality

WordPress and derivative plugin PHP are GPL-compatible code under the site owner's control. No local license check can be made unpatchable. Obfuscation conflicts with WordPress.org review and does not create a security boundary.

The enforceable boundaries are:

- authenticated access to the PRO package;
- authenticated vendor update downloads;
- support and account services;
- a substantive hosted ingestion, geospatial indexing, clustering or search service;
- seat/domain limits on those server resources.

Existing locally rendered content must not depend on a live license-server request.

### Free versus PRO responsibilities

Free:

- contains no license client;
- does not contact the vendor;
- does not install or update PRO;
- may show a restrained upgrade link only on its own settings/editor surfaces.

PRO:

- shows the activation UI;
- contacts the vendor only after an authorized administrator submits a key;
- owns its third-party update client;
- stores no secret in block attributes, post content, REST preload data or JavaScript;
- documents data transfer, terms and privacy.

A paid hosted service offered through a WordPress.org plugin must provide functionality of substance. A remote service whose only purpose is validating a key while all functionality is local does not qualify as permitted serviceware for the directory plugin.

### Activation protocol

1. Require manage_options or a dedicated manage_guyamap_license capability and verify a nonce.
2. Generate a random installation UUID.
3. POST the license key, product, installation UUID, canonical site URL and plugin version over verified TLS to a fixed allow-listed vendor host.
4. Exchange the human key for a revocable installation credential; do not retain the human key if the vendor protocol does not require it.
5. Receive a signed entitlement document with fixed algorithm and claims:
   - issuer and product audience;
   - pseudonymous license ID;
   - installation UUID and normalized site binding;
   - entitlement IDs;
   - issued, check-after, expiry and grace timestamps;
   - update channel.
6. Verify the signature locally with a pinned public key using a maintained cryptographic library. Never accept an algorithm from the token itself.
7. Store the installation credential in a non-autoloaded option. Encrypting it with a key derived from WordPress salts reduces accidental disclosure but is not protection from a compromised WordPress host.
8. Store only a masked key fragment for display and redact credentials from logs and Site Health output.

Refresh runs asynchronously with jitter and exponential backoff. Frontend rendering never performs a synchronous vendor request. Clock rollback and impossible timestamp transitions produce a diagnostic and schedule a refresh; they do not destroy data.

Recommended states:

- unlicensed;
- active;
- grace;
- expired-read-only;
- suspended;
- unreachable-with-cached-entitlement.

During grace and temporary unreachable states, existing local features keep working. After expiry, authoring/import and vendor downloads can become read-only. A paid hosted query service may stop new service requests after its documented grace period, but the plugin should show cached/fallback content rather than an empty map where possible.

### Updates

The separately distributed PRO plugin may implement its own update metadata and authenticated package download. The manifest contains package version, minimum Free/WordPress/PHP versions, SHA-256 digest and a detached vendor signature. The updater verifies TLS, signature and digest before handing a temporary local package to the WordPress upgrader.

The WordPress.org Free plugin must not proxy this download or execute code returned by the vendor. Hosted services return data only; no response is evaluated as PHP or JavaScript.

## 12. Privacy and external services

The settings and readme must state that loading a Yandex map sends visitor network data to Yandex. The product should offer:

- lazy loading;
- an optional click/consent gate before contacting Yandex;
- a static accessible fallback link;
- a filterable privacy-policy suggestion;
- no plugin analytics without a separate explicit opt-in.

Browser Yandex API keys are inherently public. They are escaped in the script URL and restricted by allowed domains/referrers in the Yandex account. License credentials and hosted-service bearer tokens are server-side only.

The optional locator SaaS must publish its Terms, Privacy Policy, subprocessors, retention and deletion behavior. Only fields selected for indexing are uploaded. Private fields are excluded at the projection boundary.

## 13. Performance acceptance plan

PRO is not complete until automated tests demonstrate:

- 1, 10 and 30 maps on one page share one Yandex loader;
- map instances initialize and destroy without leaked listeners;
- 10K, 100K and 1M synthetic source imports are resumable;
- revision publication is atomic under an interrupted import;
- viewport responses obey object and byte ceilings;
- stale pan/filter responses cannot replace newer state;
- virtual card scrolling keeps DOM size bounded;
- cache keys never mix sources, revisions, filters, locales or private/public projections;
- warm/cold latency and memory are recorded on named reference infrastructure;
- FacetWP cards and marker IDs remain identical for every supported facet codec;
- unsupported FacetWP facet types fail configuration rather than desynchronize output;
- license-server outage, expiry and PRO deactivation preserve existing public rendering.

Performance claims in marketing must name the tested provider and infrastructure. Local shared hosting, tuned MySQL with Redis, and a hosted search cluster are different support profiles and must not share an unconditional million-marker guarantee.

## 14. Implementation sequence

1. Finalize and contract-test the Free V1 extension registry and query DTOs.
2. Implement templates and fallback snapshots without licensing.
3. Implement local sources, revisioned import and bounded cards.
4. Add server tile clustering and query sessions.
5. Add native filters with one map/card store.
6. Add the supported WordPress-scale FacetWP adapter.
7. Benchmark and publish explicit support profiles.
8. Add licensing and signed PRO updates last, so entitlement code cannot contaminate domain behavior.
9. Add an external provider only when local benchmark data justifies it.
