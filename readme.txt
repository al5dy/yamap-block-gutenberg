=== Yandex Maps for Gutenberg ===
Contributors: al5dy
Tags: yandex maps, gutenberg, map block, markers, clustering
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 2.0.1
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

Add responsive Yandex Maps to WordPress with a Gutenberg block, custom markers, clustering and live preview.

== Description ==

Yandex Maps for Gutenberg adds interactive maps to WordPress without shortcodes or custom code. Insert the **Yandex Map** block, set its location and appearance in the inspector, and watch the live preview.

This is an independent community plugin, not affiliated with, endorsed by, or sponsored by Yandex. It uses the Yandex Maps JavaScript API under Yandex's API terms.

= Made for WordPress editors =

* Configure maps visually in Gutenberg.
* Add multiple independent maps to posts and pages.
* Use custom markers, popups, links and bundled SVG icons, with optional clustering.
* Choose responsive dimensions, aspect ratio and wide or full-width alignment.
* Adjust camera, zoom, theme, behaviors and controls.
* Work with classic and block themes without theme-specific CSS.

= Performance, privacy and accessibility =

Map assets load only where the block is used; maps initialize near the viewport or after a visitor clicks **Activate map**. Each map uses a Web Component with keyboard controls, reduced-motion handling, accessible errors and a Yandex Maps fallback.

= Map customization =

Create structured markers with coordinates, titles, descriptions, categories, addresses, safe links, colors, image icons, sizes and stacking order. Advanced users can apply validated Yandex customization JSON. Inline maps support up to 1,000 markers with client-side clustering; large store-locator datasets are not included.

A Yandex Maps JavaScript API v3 browser key is required. Browser keys are public by design: restrict yours by HTTP Referer in the Yandex developer dashboard.

= How it works =

1. Add the **Yandex Map** block in Gutenberg.
2. Configure the map in the block inspector while the preview updates.
3. Publish. The frontend loads the shared Yandex SDK only when needed, with an independent controller per map.

== Installation ==

1. In WordPress, open **Plugins > Add New**, search for **Yandex Maps for Gutenberg**, then install and activate it, or upload the plugin ZIP.
2. Create a **Yandex Maps JavaScript API v3** key in the [Yandex Developer Dashboard](https://developer.tech.yandex.ru/).
3. Restrict the key to your site's HTTP Referers, and include staging domains only when they need maps.
4. Open **Settings > Yandex Maps**, enter the key and select the map language. Use **Check API key** to verify it for this site.
5. Add the **Yandex Map** block to a post or page and configure it in the inspector.

== Frequently Asked Questions ==

= Is an API key required? =

Yes. A missing or rejected key produces an accessible error and fallback link rather than a blank map.

= Why does the map say "The map could not be loaded."? =

Administrators see the cause and a settings link. Common causes are a missing key, HTTP Referer restrictions that omit the current domain, network blockers, Content Security Policy, or a timeout. Use **Check API key** under **Settings > Yandex Maps**.

= Why can I not drag or zoom the map in the editor? =

The preview is intentionally gesture-locked so block editing remains predictable. Use the inspector; enabled behaviors still work on the published page.

= Can I use several maps on one page? =

Yes. The SDK is shared per document realm, while each block has independent settings and lifecycle.

= Does it work with classic and block themes? =

Yes. WordPress block supports control layout, and Shadow DOM isolates the map from theme CSS. A light-DOM fallback covers older environments.

= Can I customize markers and loading? =

Yes. Use the bundled icon catalog or a safe HTTP(S) image URL, and configure popup content and hints. Loading can be lazy or click-activated, with an optional spinner, dots or pulse preloader.

= Can I add arbitrary marker HTML or JavaScript? =

No. Marker content is rendered as text, URLs are restricted to safe HTTP(S) values, and executable code is never stored in block attributes.

= Is this a large store-locator solution? =

No. Inline markers are limited to 1,000 per block. Server-side viewport queries, large datasets and locator cards are not included.

== Screenshots ==

1. A Yandex map in Gutenberg with live inspector controls and a locked preview.
2. A responsive published map with markers and frontend controls.

== External services ==

The plugin loads [Yandex Maps JavaScript API v3](https://yandex.com/maps-api/docs/js-api/) from `https://api-maps.yandex.ru/v3/` on pages that contain a map. Requests include the public browser key and map locale. Yandex receives technical data such as IP address, user agent and referring page; tiles and interactions may cause further Yandex requests. Yandex Maps is a Yandex product; this plugin is independent. See the [Yandex Maps API terms](https://yandex.com/dev/commercial/doc/en/) and [privacy policy](https://yandex.com/legal/confidential/en/).

When settings are saved or **Check API key** is used, the WordPress server sends the key, locale and site address to the same endpoint. One diagnostic probe may follow a browser SDK failure to distinguish a rejected key from an unreachable service. These checks carry no visitor content.

The Yandex SDK may send its own performance and error reports to `https://log.api-maps.yandex.ru`; the plugin cannot disable those.

Browser geolocation is requested only after a visitor uses the geolocation control and grants permission. If an editor configures an external marker-image URL, the visitor's browser contacts that host. Bundled marker icons are served locally.

== Privacy ==

The plugin does not create visitor profiles, set tracking cookies, contact a license server or send post content to the plugin author. Marker content remains in WordPress. Site owners should disclose Yandex Maps in their privacy notice and use click-to-activate where prior consent is required.

== Changelog ==

= 2.0.1 =

* Renamed the plugin to Yandex Maps for Gutenberg without changing its block or stored-data identifiers.
* Rewrote the developer and WordPress.org documentation.
* Standardized source audits, quality checks, deterministic packaging and GitHub release infrastructure.
* Improved clean-install release testing and WordPress.org SVN staging.

= 2.0.0 =

* Rebuilt the plugin with block.json, Block API version 3 and server-side rendering.
* Migrated the map runtime from Yandex Maps JavaScript API 2.1 to v3.
* Added multiple structured markers, marker editing and client-side clustering.
* Added responsive layout, camera, behavior, control, appearance and loading settings.
* Added Web Component and Shadow DOM isolation for frontend and editor maps.
* Added a non-interactive Gutenberg preview with live inspector updates.
* Added customizable optional preloaders and removed the frontend activation message when click-to-activate is disabled.
* Fixed full-width rendering so it spans the viewport without horizontal overflow.
* Added conditional assets, shared SDK loading and viewport-based initialization.
* Added an API-key and locale settings screen.
* Added English and Russian translations, automated unit tests, coding standards and Chromium smoke tests.
* Added backward-compatible rendering and editor migration for legacy blocks.
* Added failure diagnostics: administrators see why a map could not load, and the settings screen verifies the API key with Yandex for the current site.
* Added marker hint tooltips on hover and keyboard focus, a visitor location marker and visible geolocation messages.
* Added clustering to the editor preview.
* Added a searchable marker icon catalog in place of the free-text icon name.
* Fixed the editor error notice and its retry button being clipped and unreachable.
* Fixed invisible click-blocking areas next to markers and clusters, and marker placement on right-to-left sites.
* Fixed marker popups being cut off at the map edge, hidden behind other markers and left open after clicking elsewhere.
* Fixed a zoom range with equal minimum and maximum preventing the map from rendering.
* Fixed clearing a numeric editor field storing zero, and editor fields accepting values the server discards.
* Fixed uneven zoom steps on repeated presses, lost keyboard focus after map activation and the aspect ratio being overridden by the minimum height.
* Fixed marker pins being cut off when the viewport is fitted to markers.
* Fixed "Restrict map area" holding the map outside the selected area as soon as the camera moved.
* Fixed customization rules the map cannot process breaking the map tiles; the editor lists the problems instead of applying such a style, and applies a valid style while it is typed.
* Fixed the zoom buttons overlapping the fullscreen button on short maps.
* Fixed the editor preview turning almost a full circle when the camera azimuth crossed zero.
* Added Firefox and WebKit (Safari) to the browser tests and a suite for classic themes.
* Added a checksum-verified workflow for updating the bundled marker artwork from its upstream package.
* Removed the per-marker "Draggable marker" and "Map follows while dragging" options. Markers saved as draggable stay in place and visitors can no longer move them.

= 1.0.1 =

* Added compatibility and translation fixes.

= 1.0.0 =

* Initial release.

== Upgrade Notice ==

= 2.0.1 =

This release updates the public plugin name, documentation and release infrastructure. Existing maps and block identifiers remain compatible.

= 2.0.0 =

Existing blocks retain their original block name and render through the legacy compatibility layer. Configure a Yandex Maps JavaScript API v3 key after upgrading.
