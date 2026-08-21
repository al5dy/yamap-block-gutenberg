=== Map Block for Yandex ===
Contributors: al5dy
Tags: yandex maps, map, gutenberg, block, markers
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 2.0.0
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

A fast, accessible Yandex Maps block with live editing, responsive layouts, markers and clustering.

== Description ==

Map Block for Yandex is a native WordPress block powered by Yandex Maps JavaScript API v3. Create independent, responsive maps and configure them from the block inspector with a live Gutenberg preview.

= Highlights =

* Add multiple independent maps to any post or page.
* Keep each map isolated in a Web Component with Shadow DOM so theme styles cannot break it.
* Update center, zoom, camera and appearance live from the Gutenberg inspector.
* Keep the editor preview locked against dragging, wheel zoom and other direct map gestures.
* Use responsive width, height, minimum height, aspect ratio, wide and full-width alignment without horizontal overflow.
* Configure center, zoom range, tilt, azimuth, map mode and automatic, light or dark theme.
* Enable selected map behaviors and lightweight zoom, geolocation and fullscreen controls.
* Add, duplicate, search, reorder and remove structured markers.
* Customize marker coordinates, labels, descriptions, links, colors, icons, images, sizes and stacking order.
* Group markers with optional client-side clustering.
* Apply bounded Yandex vector-map customization rules.
* Lazy-load maps near the viewport or require a visitor click before connecting to Yandex.
* Disable the loading overlay, or customize a spinner, bouncing-dots or pulse preloader and map reveal.
* Provide keyboard-visible controls, accessible labels, useful error states and a no-JavaScript fallback link.
* Preserve and migrate blocks created by versions 1.0.0 and 1.0.1.

The plugin does not enqueue the Yandex SDK site-wide. A shared loader is used per document and each block owns an independently disposable map instance. Optional clustering is loaded only when required. Inline marker data is normalized and limited to 1,000 markers and an approximately 1 MiB rendered configuration.

You must supply a Yandex Maps JavaScript API v3 browser key and select a Yandex plan suitable for your use. Restrict the key by HTTP Referer in the Yandex developer dashboard. Browser API keys are necessarily visible to browsers and must not be treated as secrets.

== Installation ==

1. Install the plugin through Plugins > Add New, or upload it to `/wp-content/plugins/`.
2. Activate **Map Block for Yandex**.
3. Open Settings > Yandex Maps and enter a Yandex Maps JavaScript API v3 key.
4. Restrict the key to your site's HTTP Referers in the Yandex developer dashboard.
5. Add the **Yandex Map** block in the block editor.

== Frequently Asked Questions ==

= Is an API key required? =

Yes. Yandex Maps JavaScript API v3 requires a browser API key. When a key is missing or the SDK fails, the block displays an accessible error and fallback link instead of a blank map.

= Why can I not drag or zoom the map in the editor? =

The Gutenberg preview is intentionally non-interactive so block selection and editing remain predictable. Change the viewport and other settings in the inspector; the preview updates immediately without reloading the editor. The behaviors you enable remain available on the published frontend.

= Can I disable or customize the loading animation? =

Yes. In Loading and interaction, disable the frontend overlay to reveal the map surface immediately. When enabled, choose a spinner, bouncing dots or pulse and customize its colors, size, accessible text and reveal duration.

= Can I use more than one map on a page? =

Yes. The SDK loads once and each map maintains its own configuration and lifecycle.

= Does it work with classic and block themes? =

Yes. WordPress block supports control the outer layout, while the map surface is isolated in Shadow DOM. Full-width mode uses a viewport-safe layout and does not create horizontal page scrolling.

= Can I add arbitrary marker HTML or JavaScript? =

No. Marker content is rendered as text, URLs are restricted to safe HTTP(S) values, and executable code is never stored in block attributes.

= Can the block hold a very large store-locator data set? =

Inline markers are intended for normal editorial maps and are limited to 1,000 per block. Large locators require bounded server-side viewport queries and are not included in this plugin.

== Screenshots ==

1. A Yandex map in Gutenberg with live inspector controls and a gesture-locked preview.
2. A responsive published map with markers and frontend controls.

== External services ==

This plugin connects to Yandex Maps JavaScript API v3 only on pages containing a map block. By default, the connection begins when the map approaches the viewport. Administrators can enable click-to-activate mode so the connection begins only after visitor interaction.

Requests are made to `https://api-maps.yandex.ru/v3/` and include the configured browser API key and map locale. Yandex receives ordinary technical request data such as the visitor's IP address, user agent and referring page according to its policies. Map tiles and enabled map interactions may make additional requests to Yandex. Browser geolocation is requested only after a visitor activates the geolocation control and grants permission.

Yandex Maps API terms: https://yandex.com/dev/commercial/doc/en/

Yandex privacy policy: https://yandex.com/legal/confidential/en/

The service is required for the interactive map. An accessible fallback link remains available when the service cannot load or JavaScript is disabled.

Editors may optionally specify an external marker-image URL. The visitor's browser then requests that URL, and its host receives ordinary technical request data. Built-in marker icons are served locally by the plugin.

== Privacy ==

The plugin does not create visitor profiles, set tracking cookies, contact a license server or send post content to the plugin author. Marker content remains in WordPress. The configured public browser API key is sent to Yandex as described above.

Site owners should disclose their use of Yandex Maps in their privacy notice and use click-to-activate mode where prior consent is required.

== Changelog ==

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

= 1.0.1 =

* Added compatibility and translation fixes.

= 1.0.0 =

* Initial release.

== Upgrade Notice ==

= 2.0.0 =

Existing blocks retain their original block name and render through the legacy compatibility layer. Configure a Yandex Maps JavaScript API v3 key after upgrading.
