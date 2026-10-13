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
* Add, duplicate, search and remove structured markers.
* Choose marker icons from a searchable catalog of the bundled artwork.
* Customize marker coordinates, labels, hover and focus hints, descriptions, links, colors, icons, images, sizes and stacking order.
* Group markers with optional client-side clustering.
* Apply Yandex map customization rules; the editor checks them against the documented schema and explains what is wrong with a rule.
* Lazy-load maps near the viewport or require a visitor click before connecting to Yandex.
* Disable the loading overlay, or customize a spinner, bouncing-dots or pulse preloader and map reveal.
* Provide keyboard-visible controls, accessible labels, useful error states and a no-JavaScript fallback link.
* Tell administrators why a map failed to load and verify the API key from the settings screen.
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

= Why does the map say "The map could not be loaded"? =

Visitors always see this short message and a link to Yandex Maps. Administrators additionally see the cause on the page and in the block editor. The most common cause is an API key that Yandex does not accept for the current domain: a key restricted by HTTP Referer works only on the listed domains, so it stops working after a domain change or on a staging copy. Open Settings > Yandex Maps and use **Check API key**; the plugin asks Yandex and reports whether the key is accepted for this site. If it is rejected, add the domain shown on that screen to the key's HTTP Referer restrictions in the Yandex developer dashboard.

Other reported causes are a missing key, a network problem or content blocker in the browser, a Content Security Policy that blocks `api-maps.yandex.ru`, and a timeout.

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

When an administrator saves the settings or chooses **Check API key**, the WordPress server sends one request with the configured key, map locale and site address to `https://api-maps.yandex.ru/v3/` to learn whether Yandex accepts the key for this site. No visitor data is involved.

When the SDK fails to load in a browser, the plugin repeats the same request once to tell a rejected key from an unreachable service. It goes to the same Yandex address the browser already contacted and carries no additional data.

The Yandex SDK also reports its own loading times and errors to `https://log.api-maps.yandex.ru`. These reports are sent by the SDK, not by the plugin, and contain the page address and technical details of the browser and its graphics hardware. The plugin cannot switch them off; when such a report cannot be delivered, the browser console shows a failed request to that address and the map keeps working.

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

= 2.0.0 =

Existing blocks retain their original block name and render through the legacy compatibility layer. Configure a Yandex Maps JavaScript API v3 key after upgrading.
