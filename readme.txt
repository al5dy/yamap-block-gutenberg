=== Map Block for Yandex ===
Contributors: al5dy
Tags: yandex maps, map, gutenberg, block, markers
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 2.0.0
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

A fast, accessible and extensible Yandex Maps block with responsive containers, markers and clustering.

== Description ==

Map Block for Yandex is a modern, native block for the WordPress block editor. It uses block.json, Block API version 3, server-side rendering and per-block frontend assets.

= Features =

* Add any number of independent maps to a post or page.
* Responsive width, height, minimum height, aspect ratio, wide/full alignment, spacing and border support.
* Configure center, zoom range, tilt, azimuth, map mode and light/dark/automatic theme.
* Select map behaviors, zoom, geolocation and fullscreen controls.
* Add, duplicate, search and remove markers.
* Configure marker coordinates, labels, descriptions, category, color, icon, size, image, drag behavior and stacking order.
* Client-side grid clustering with cluster size, color and maximum zoom settings.
* Add bounded, JSON-safe Yandex vector-map customization rules.
* Lazy-load the Yandex SDK near the viewport, or require a visitor click before contacting Yandex.
* Keyboard-visible controls, accessible labels and a no-JavaScript fallback link.
* English source strings and a bundled Russian translation.
* Backward-compatible rendering and editor migration for blocks created by versions 1.0.0 and 1.0.1.
* Carefully scoped PHP filters plus a documented roadmap for separately distributed extensions.

The plugin uses Yandex Maps JavaScript API v3. You supply your own browser API key and are responsible for selecting a Yandex plan that permits your use case. Protect the key with HTTP Referer restrictions in the Yandex developer dashboard; browser API keys cannot be kept secret in WordPress markup.

= Performance =

The plugin does not enqueue the map SDK site-wide. One shared loader is used per document, while each block owns an independently disposable map instance. Maps initialize through IntersectionObserver, optional clustering is loaded on demand, and inline marker payloads are strictly normalized. Each map has a hard ceiling of 1,000 inline markers and a 1 MiB encoded configuration budget; the ordered marker tail is omitted if verbose marker content reaches the byte budget first.

Very large store-locator data sets must not be serialized into block attributes. The proposed extension architecture defines viewport queries, server-generated cluster tiles, keyset-paginated/virtualized cards and provider-backed filtering. Those contracts and the planned PRO add-on are roadmap work; PRO will be a separate plugin, not dormant locked code in this WordPress.org package.

== Installation ==

1. Upload the plugin directory to `/wp-content/plugins/`, or install it through Plugins > Add New.
2. Activate **Map Block for Yandex**.
3. Open Settings > Yandex Maps and enter a Yandex Maps JavaScript API v3 key.
4. Restrict the key to your site's HTTP Referers in the Yandex developer dashboard.
5. Add the **Yandex Map** block in the editor.

== Frequently Asked Questions ==

= Is an API key required? =

Yes. Yandex Maps JavaScript API v3 requires a key with HTTP Referer restrictions. The block keeps a usable fallback link when no key is configured or the SDK cannot load.

= Can I place several maps on the same page? =

Yes. There is no plugin-level map count limit. The SDK loads once and every map has its own configuration and lifecycle.

= Does it work with block and classic themes? =

Yes. The wrapper uses WordPress block supports and isolated logical CSS properties. It does not depend on theme container class names.

= Can I add custom marker HTML or JavaScript? =

No executable code is stored in block attributes. Marker text is treated as text and URLs are validated. Future advanced behavior will use a typed extension contract after that contract is finalized. This boundary prevents stored XSS and keeps saved content portable.

= Can the free block hold one million markers? =

No browser should receive one million DOM markers or one million cards. Inline markers are intended for normal editorial maps. Million-row locators require server-side viewport/tile queries, clustering, bounded responses and virtualized cards, as specified by the proposed PRO architecture; that locator is not included in Free 2.0.

= Is PRO functionality hidden in this plugin? =

No. The free plugin is complete GPL software. A future PRO product must be a separately distributed GPL-compatible add-on. A license can securely authorize downloads, updates and hosted services, but already downloaded PHP cannot be made impossible to modify.

== External services ==

This plugin connects to the Yandex Maps JavaScript API only on pages containing a map block. By default the connection starts when a map approaches the viewport. Administrators can enable click-to-activate so the request starts only after visitor interaction.

The request is made to `https://api-maps.yandex.ru/v3/` and includes the configured browser API key and map locale. Like other third-party web requests, Yandex receives technical request data such as the visitor's IP address, user agent and referring page according to its policies. Map tile, geolocation and other enabled map interactions may make additional requests to Yandex. Geolocation is requested only after the visitor activates the geolocation control and the browser asks for permission.

Yandex Maps API terms: https://yandex.com/dev/commercial/doc/en/

Yandex privacy policy: https://yandex.com/legal/confidential/en/

This service is required to display an interactive Yandex map. The fallback link remains available without it.

Editors can optionally enter an external URL for a custom marker image. In that case the visitor's browser requests that URL and the operator of that host may receive normal request data. Built-in marker icons are served locally by the plugin.

== Privacy ==

The free plugin does not create visitor profiles, set its own tracking cookies, contact a license server or send post content to the plugin author. The API key is a public browser credential and is sent to Yandex as described above. Marker content remains in WordPress and is rendered into the page configuration.

Site owners should describe their Yandex Maps use in their privacy notice and choose click-to-activate where prior consent is required.

== Developer notes ==

Readable source is included in `src/`. Production assets are generated with the pinned npm dependencies in `package-lock.json`:

1. Install Node.js 18.12 or newer.
2. Run `npm ci`.
3. Run `npm run build`.

PHP quality tooling and its `composer.lock` are maintained in the development repository. From a development checkout, run `composer install`, `composer lint`, `npm run lint:js`, `npm run lint:css` and `npm run test:unit` before packaging.

Third-party production code and marker artwork are identified in `third-party-notices.txt`.

The implemented Free 2.0 seams and the proposed, not-yet-public PRO contracts are documented separately in `docs/architecture.md` and `docs/pro-extension.md`.

== Changelog ==

= 2.0.0 =

* Rebuilt the plugin around block.json and Block API version 3.
* Added a dynamic, escaped renderer and migration for legacy block content.
* Migrated from Yandex Maps JavaScript API 2.1 to v3.
* Added multiple markers, marker editing and official client-side clustering.
* Added responsive container, camera, interaction, control, appearance and loading settings.
* Added conditional assets, one-per-page SDK loading and viewport initialization.
* Added a Settings API screen for the API key and locale.
* Added English/Russian internationalization, modern build tooling and coding-standard checks.
* Published a technical roadmap for templates, large data providers, store locator and licensing in a future separate PRO add-on.

= 1.0.1 =

* Original 2018 compatibility and translation fixes.

= 1.0.0 =

* Initial release.

== Upgrade Notice ==

= 2.0.0 =

The block remains under its original name. Existing maps are rendered from legacy attributes and are migrated to the new schema when edited and saved. Configure a Yandex Maps JavaScript API v3 key after upgrading.
