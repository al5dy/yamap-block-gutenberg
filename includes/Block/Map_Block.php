<?php
/**
 * Server registration and rendering for the map block.
 *
 * @package GuYaMap
 */

namespace GuYaMap\Block;

use GuYaMap\Admin\Settings;
use GuYaMap\Support\Config_Normalizer;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the metadata-driven block and renders a safe frontend shell.
 */
final class Map_Block {

	/**
	 * Settings service.
	 *
	 * @var Settings
	 */
	private $settings;

	/**
	 * Configuration normalizer.
	 *
	 * @var Config_Normalizer
	 */
	private $normalizer;

	/**
	 * Editor script handles registered from block metadata.
	 *
	 * @var string[]
	 */
	private $editor_script_handles = array();

	/**
	 * Whether the editor asset hook has already been registered.
	 *
	 * @var bool
	 */
	private $editor_assets_hooked = false;

	/**
	 * Creates the block service.
	 *
	 * @param Settings          $settings   Settings service.
	 * @param Config_Normalizer $normalizer Configuration normalizer.
	 */
	public function __construct( Settings $settings, Config_Normalizer $normalizer ) {
		$this->settings   = $settings;
		$this->normalizer = $normalizer;
	}

	/**
	 * Registers the block from its canonical block.json metadata.
	 *
	 * @return void
	 */
	public function register(): void {
		$metadata_directory = file_exists( GUYAMAP_PLUGIN_PATH . 'build/block.json' )
			? GUYAMAP_PLUGIN_PATH . 'build'
			: GUYAMAP_PLUGIN_PATH . 'src';

		/**
		 * Filters the directory containing the map block.json file.
		 *
		 * @since 2.0.0
		 *
		 * @param string $metadata_directory Absolute metadata directory.
		 */
		$metadata_directory = apply_filters( 'guyamap_block_metadata_directory', $metadata_directory );

		if ( ! is_string( $metadata_directory ) || ! file_exists( trailingslashit( $metadata_directory ) . 'block.json' ) ) {
			return;
		}

		$registration_args = array(
			'render_callback' => array( $this, 'render' ),
		);

		/**
		 * Filters server-side map block registration arguments.
		 *
		 * @since 2.0.0
		 *
		 * @param array<string, mixed> $registration_args Block registration arguments.
		 * @param string               $metadata_directory Metadata directory.
		 */
		$registration_args = apply_filters(
			'guyamap_block_registration_args',
			$registration_args,
			$metadata_directory
		);

		if ( ! is_array( $registration_args ) ) {
			$registration_args = array(
				'render_callback' => array( $this, 'render' ),
			);
		}

		$block_type = register_block_type_from_metadata( $metadata_directory, $registration_args );

		if ( $block_type instanceof \WP_Block_Type ) {
			$this->editor_script_handles = array_values(
				array_filter(
					$block_type->editor_script_handles,
					static function ( $handle ): bool {
						return is_string( $handle ) && '' !== $handle;
					}
				)
			);

			if ( ! $this->editor_assets_hooked && ! empty( $this->editor_script_handles ) ) {
				$this->editor_assets_hooked = true;
				add_action( 'enqueue_block_editor_assets', array( $this, 'enqueue_editor_assets' ) );
			}

			$this->version_block_styles( $block_type );
		}

		/**
		 * Fires after the server-side map block registration attempt.
		 *
		 * @since 2.0.0
		 *
		 * @param \WP_Block_Type|false $block_type Registered block type or false.
		 */
		do_action( 'guyamap_block_registered', $block_type );
	}

	/**
	 * Adds runtime settings and translations to the metadata-registered editor script.
	 *
	 * @return void
	 */
	public function enqueue_editor_assets(): void {
		if ( empty( $this->editor_script_handles ) ) {
			return;
		}

		$editor_settings = array(
			'apiKey'      => $this->settings->get_api_key(),
			'language'    => $this->settings->get_language(),
			'settingsUrl' => esc_url_raw( $this->settings->get_page_url() ),
			'baseUrl'     => esc_url_raw( home_url( '/' ) ),
			'iconBaseUrl' => esc_url_raw( GUYAMAP_PLUGIN_URL . 'assets/icons/' ),
			'styleUrl'    => $this->get_shadow_style_url(),
			'i18n'        => array_merge( $this->get_runtime_i18n(), $this->get_diagnostic_i18n() ),
		);

		/**
		 * Filters the settings exposed to the block editor runtime.
		 *
		 * @since 2.0.0
		 *
		 * @param array<string, mixed> $editor_settings Editor runtime settings.
		 */
		$filtered_settings = apply_filters( 'guyamap_editor_settings', $editor_settings );
		if ( is_array( $filtered_settings ) ) {
			$editor_settings = $filtered_settings;
		}

		$json = $this->encode_json( $editor_settings );

		$primary_handle = $this->editor_script_handles[0];
		wp_add_inline_script(
			$primary_handle,
			'window.guyamapEditorSettings = ' . $json . ';',
			'before'
		);

		foreach ( $this->editor_script_handles as $handle ) {
			wp_set_script_translations( $handle, 'yamap-block-gutenberg', GUYAMAP_PLUGIN_PATH . 'languages' );
		}
	}

	/**
	 * Renders one independent map instance.
	 *
	 * JSON is placed in a non-executable application/json element rather than a
	 * data attribute so large marker payloads remain valid and auditable.
	 *
	 * @param array<string, mixed> $attributes Parsed block attributes.
	 * @param string               $content    Saved block content, unused for this dynamic block.
	 * @param \WP_Block|null       $block      Runtime block instance.
	 * @return string
	 */
	public function render( array $attributes, string $content = '', $block = null ): string {
		$attributes  = $this->restore_legacy_content_attributes( $attributes, $content, $block );
		$config      = $this->normalizer->normalize( $attributes );
		$instance_id = sanitize_html_class( wp_unique_id( 'guyamap-map-' ) );

		$runtime_config = array(
			'instanceId'  => $instance_id,
			'apiKey'      => $this->settings->get_api_key(),
			'language'    => $this->settings->get_language(),
			'baseUrl'     => esc_url_raw( home_url( '/' ) ),
			'iconBaseUrl' => esc_url_raw( GUYAMAP_PLUGIN_URL . 'assets/icons/' ),
			'styleUrl'    => $this->get_shadow_style_url(),
			'i18n'        => $this->get_runtime_i18n(),
		);

		// Visitors get a short neutral message. People who can fix the map also
		// get the cause; the flag never reaches anonymous or cached output.
		if ( current_user_can( 'manage_options' ) ) {
			$runtime_config['diagnostics'] = true;
			$runtime_config['settingsUrl'] = esc_url_raw( $this->settings->get_page_url() );
			$runtime_config['i18n']        = array_merge( $runtime_config['i18n'], $this->get_diagnostic_i18n() );
		}

		$config = array_merge( $config, $runtime_config );

		/**
		 * Filters the complete per-instance configuration before JSON encoding.
		 *
		 * @since 2.0.0
		 *
		 * Returned core fields are normalized again and server-owned runtime fields
		 * are restored. Add-on data should use the bounded `extensions` bag.
		 *
		 * @param array<string, mixed> $config     Normalized frontend configuration.
		 * @param array<string, mixed> $attributes Original block attributes.
		 * @param \WP_Block|null       $block      Runtime block instance.
		 */
		$filtered_config = apply_filters( 'guyamap_map_render_config', $config, $attributes, $block );
		if ( is_array( $filtered_config ) ) {
			$config = array_merge( $this->normalizer->revalidate( $filtered_config ), $runtime_config );
		}
		$config['fallbackUrl'] = $this->get_fallback_url( $config );
		$config                = $this->normalizer->enforce_render_budget( $config );

		$json = $this->encode_json( $config );

		$style_variables = array(
			'--guyamap-width:' . $this->get_safe_config_string( $config, 'width', '100%' ),
			'--guyamap-height:' . $this->get_safe_config_string( $config, 'height', '480px' ),
			'--guyamap-min-height:' . $this->get_safe_config_string( $config, 'minHeight', '280px' ),
		);

		$aspect_ratio = $this->get_safe_aspect_ratio( $config['aspectRatio'] ?? '' );
		if ( '' !== $aspect_ratio ) {
			$style_variables[] = '--guyamap-aspect-ratio:' . $aspect_ratio;
		}

		$width_ratio = $this->get_width_ratio( $this->get_safe_config_string( $config, 'width', '100%' ) );
		if ( '' !== $width_ratio ) {
			$style_variables[] = '--guyamap-width-ratio:' . $width_ratio;
		}

		$preloader         = isset( $config['loading']['preloader'] ) && is_array( $config['loading']['preloader'] )
			? $config['loading']['preloader']
			: array();
		$preloader_enabled = true === ( $preloader['enabled'] ?? false );
		$preloader_type    = sanitize_html_class( (string) ( $preloader['type'] ?? 'spinner' ) );
		$preloader_label   = sanitize_text_field( (string) ( $preloader['label'] ?? __( 'Loading map…', 'yamap-block-gutenberg' ) ) );

		if ( $preloader_enabled ) {
			$style_variables[] = '--guyamap-preloader-color:' . (string) ( $preloader['color'] ?? '#3858e9' );
			$style_variables[] = '--guyamap-preloader-background:' . (string) ( $preloader['backgroundColor'] ?? '#eef1f5' );
			$style_variables[] = '--guyamap-preloader-size:' . (string) ( $preloader['size'] ?? 48 ) . 'px';
			$style_variables[] = '--guyamap-transition-duration:' . (string) ( $preloader['transitionDuration'] ?? 300 ) . 'ms';
		}

		$wrapper_attributes = array(
			'class'               => 'guyamap-map',
			'data-guyamap-map'    => '',
			'data-guyamap-schema' => (string) Config_Normalizer::SCHEMA_VERSION,
			'data-guyamap-state'  => 'pending',
			'style'               => safecss_filter_attr( implode( ';', $style_variables ) . ';' ),
		);

		if ( '' !== $aspect_ratio ) {
			$wrapper_attributes['data-guyamap-aspect-ratio'] = $aspect_ratio;
		}
		if ( '' !== $width_ratio ) {
			$wrapper_attributes['data-guyamap-width-ratio'] = $width_ratio;
		}
		if ( $preloader_enabled ) {
			$wrapper_attributes['data-guyamap-preloader'] = $preloader_type;
		}

		$aria_label     = sanitize_text_field( (string) ( $config['ariaLabel'] ?? __( 'Interactive map', 'yamap-block-gutenberg' ) ) );
		$fallback_text  = sanitize_text_field( (string) ( $config['fallbackText'] ?? __( 'Open this location in Yandex Maps', 'yamap-block-gutenberg' ) ) );
		$fallback_url   = (string) ( $config['fallbackUrl'] ?? $this->get_fallback_url( $config ) );
		$preloader_html = '';
		if ( $preloader_enabled ) {
			$preloader_html = sprintf(
				'<div class="guyamap-map__preloader guyamap-preloader guyamap-preloader--%1$s" role="status" aria-live="polite"><span class="guyamap-preloader__visual" aria-hidden="true"><span></span><span></span><span></span></span><span class="guyamap-preloader__label">%2$s</span></div>',
				esc_attr( $preloader_type ),
				esc_html( $preloader_label )
			);
		}

		$html = sprintf(
			'<div %1$s><guyamap-map-view id="%2$s" class="guyamap-map__canvas" role="region" aria-label="%3$s"></guyamap-map-view><script type="application/json" class="guyamap-map__config">%4$s</script>%5$s<noscript><a class="guyamap-map__noscript-fallback" href="%6$s" target="_blank" rel="noopener noreferrer external">%7$s</a></noscript></div>',
			get_block_wrapper_attributes( $wrapper_attributes ),
			esc_attr( $instance_id ),
			esc_attr( $aria_label ),
			$json,
			$preloader_html,
			esc_url( $fallback_url ),
			esc_html( $fallback_text )
		);

		/**
		 * Filters the final safe map block markup.
		 *
		 * @since 2.0.0
		 *
		 * @param string               $html       Rendered map markup.
		 * @param array<string, mixed> $config     Frontend configuration.
		 * @param array<string, mixed> $attributes Original block attributes.
		 * @param \WP_Block|null       $block      Runtime block instance.
		 */
		$filtered_html = apply_filters( 'guyamap_rendered_map_html', $html, $config, $attributes, $block );

		return is_string( $filtered_html ) ? $filtered_html : $html;
	}

	/**
	 * Restores version 1.x defaults serialized only in the saved data attribute.
	 *
	 * Non-source Gutenberg attributes that matched their old defaults were not
	 * written into the block comment. They were, however, included in the
	 * original `data-params` JSON. Current metadata defaults would otherwise
	 * replace the old 400px height, zoom 10, and Minsk center before the render
	 * callback sees them. Only the finite legacy allow-list is imported.
	 *
	 * @param array<string, mixed> $attributes Prepared block attributes.
	 * @param string               $content    Saved inner block HTML.
	 * @param \WP_Block|null       $block      Runtime block instance.
	 * @return array<string, mixed>
	 */
	private function restore_legacy_content_attributes( array $attributes, string $content, $block ): array {
		if ( '' === $content || strlen( $content ) > 262144 || false === strpos( $content, 'data-params' ) ) {
			return $attributes;
		}

		$processor = new \WP_HTML_Tag_Processor( $content );
		if ( ! $processor->next_tag() ) {
			return $attributes;
		}

		$serialized = $processor->get_attribute( 'data-params' );
		if ( ! is_string( $serialized ) || '' === $serialized || strlen( $serialized ) > 65536 ) {
			return $attributes;
		}

		$decoded = json_decode( $serialized, true, 8 );
		if ( ! is_array( $decoded ) ) {
			return $attributes;
		}

		$legacy_keys = array(
			'blockAlignment',
			'width',
			'height',
			'lat',
			'lon',
			'pm_lat',
			'pm_lon',
			'pm_balloon',
			'pm_hint',
			'zoom',
			'has_placemark',
		);
		$legacy      = array_intersect_key( $decoded, array_flip( $legacy_keys ) );

		if ( empty( $legacy ) ) {
			return $attributes;
		}

		$raw_attributes = array();
		if (
			$block instanceof \WP_Block &&
			isset( $block->parsed_block['attrs'] ) &&
			is_array( $block->parsed_block['attrs'] )
		) {
			$raw_attributes = array_intersect_key( $block->parsed_block['attrs'], array_flip( $legacy_keys ) );
		}

		return array_merge( $attributes, $legacy, $raw_attributes );
	}

	/**
	 * Returns a safe fallback link to the map center.
	 *
	 * @param array<string, mixed> $config Frontend configuration.
	 * @return string
	 */
	private function get_fallback_url( array $config ): string {
		$center    = isset( $config['center'] ) && is_array( $config['center'] ) ? $config['center'] : array();
		$latitude  = isset( $center['latitude'] ) && is_numeric( $center['latitude'] ) ? (float) $center['latitude'] : 55.751244;
		$longitude = isset( $center['longitude'] ) && is_numeric( $center['longitude'] ) ? (float) $center['longitude'] : 37.618423;
		$zoom      = isset( $config['zoom'] ) && is_numeric( $config['zoom'] ) ? (float) $config['zoom'] : 12.0;
		$language  = isset( $config['language'] ) ? (string) $config['language'] : 'en_US';
		$host      = in_array( $language, array( 'ru_RU', 'ru_UA', 'uk_UA' ), true )
			? 'https://yandex.ru/maps/'
			: 'https://yandex.com/maps/';

		$url = add_query_arg(
			array(
				'll' => sprintf( '%.6F,%.6F', $longitude, $latitude ),
				'z'  => (string) $zoom,
			),
			$host
		);

		/**
		 * Filters the non-JavaScript Yandex Maps fallback URL.
		 *
		 * @since 2.0.0
		 *
		 * @param string               $url    Fallback URL.
		 * @param array<string, mixed> $config Frontend configuration.
		 */
		$url = apply_filters( 'guyamap_fallback_url', $url, $config );

		return esc_url_raw( (string) $url, array( 'https' ) );
	}

	/**
	 * Reads a normalized CSS dimension from the filtered configuration.
	 *
	 * @param array<string, mixed> $config  Frontend configuration.
	 * @param string               $key     Configuration key.
	 * @param string               $fallback Fallback.
	 * @return string
	 */
	private function get_safe_config_string( array $config, string $key, string $fallback ): string {
		$value = isset( $config[ $key ] ) && is_scalar( $config[ $key ] )
			? trim( (string) $config[ $key ] )
			: $fallback;

		if ( strlen( $value ) > 64 ) {
			return $fallback;
		}

		return 1 === preg_match(
			'/^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|%|em|rem|vh|vw|vmin|vmax|ch))$/i',
			$value
		) ? $value : $fallback;
	}

	/**
	 * Converts a percentage width into a unitless share of the available width.
	 *
	 * A percentage is meant as a share of the content column. The stylesheet
	 * needs it unitless to scale that column instead of the wider parent box.
	 *
	 * @param string $width Normalized CSS width.
	 * @return string Ratio such as `0.5`, or an empty string for other units.
	 */
	private function get_width_ratio( string $width ): string {
		if ( 1 !== preg_match( '/^(\d+(?:\.\d+)?|\.\d+)%$/', $width, $matches ) ) {
			return '';
		}

		return rtrim( rtrim( number_format( (float) $matches[1] / 100, 6, '.', '' ), '0' ), '.' );
	}

	/**
	 * Reads a safe aspect ratio from filtered configuration.
	 *
	 * @param mixed $value Raw aspect ratio.
	 * @return string
	 */
	private function get_safe_aspect_ratio( $value ): string {
		$value = is_scalar( $value ) ? trim( (string) $value ) : '';
		if ( strlen( $value ) > 64 ) {
			return '';
		}

		return 1 === preg_match( '/^\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?$/', $value )
			? $value
			: '';
	}

	/**
	 * Returns the compiled block stylesheet used inside each Shadow Root.
	 *
	 * The same generated CSS remains the single source for light-DOM fallback
	 * and style-isolated maps. A version query keeps long-lived page caches from
	 * pairing new JavaScript with stale component styles.
	 *
	 * @return string
	 */
	private function get_shadow_style_url(): string {
		$filename = is_rtl() ? 'style-index-rtl.css' : 'style-index.css';

		return esc_url_raw(
			add_query_arg(
				'ver',
				$this->get_build_file_version( $filename ),
				GUYAMAP_PLUGIN_URL . 'build/' . $filename
			)
		);
	}

	/**
	 * Returns a cache-busting version for one generated build file.
	 *
	 * The plugin version alone does not change between builds of the same
	 * release, so a browser could keep pairing new scripts with a cached
	 * stylesheet. The file modification time makes every build distinct.
	 *
	 * @param string $filename File name inside the build directory.
	 * @return string
	 */
	private function get_build_file_version( string $filename ): string {
		$path     = GUYAMAP_PLUGIN_PATH . 'build/' . $filename;
		$modified = is_readable( $path ) ? filemtime( $path ) : false;

		return false === $modified
			? GUYAMAP_VERSION
			: GUYAMAP_VERSION . '.' . $modified;
	}

	/**
	 * Applies build-specific versions to the stylesheets registered from block.json.
	 *
	 * WordPress versions block scripts from their generated asset files but
	 * versions block styles with the static block version only.
	 *
	 * @param \WP_Block_Type $block_type Registered block type.
	 * @return void
	 */
	private function version_block_styles( \WP_Block_Type $block_type ): void {
		$styles  = wp_styles();
		$handles = array_merge( $block_type->style_handles, $block_type->editor_style_handles );

		foreach ( $handles as $handle ) {
			if ( ! is_string( $handle ) || ! isset( $styles->registered[ $handle ] ) ) {
				continue;
			}

			$source = (string) $styles->registered[ $handle ]->src;
			$path   = wp_parse_url( $source, PHP_URL_PATH );
			if ( ! is_string( $path ) || false === strpos( $source, GUYAMAP_PLUGIN_URL . 'build/' ) ) {
				continue;
			}

			$styles->registered[ $handle ]->ver = $this->get_build_file_version( basename( $path ) );
		}
	}

	/**
	 * Returns the translated strings shared by editor and frontend runtimes.
	 *
	 * @return array<string, string> Runtime translations.
	 */
	private function get_runtime_i18n(): array {
		return array(
			'activate'          => __( 'Activate map', 'yamap-block-gutenberg' ),
			'fullscreen'        => __( 'Toggle fullscreen map', 'yamap-block-gutenberg' ),
			'loading'           => __( 'Loading map…', 'yamap-block-gutenberg' ),
			'error'             => __( 'The map could not be loaded.', 'yamap-block-gutenberg' ),
			'marker'            => __( 'Map marker', 'yamap-block-gutenberg' ),
			/* translators: %d: Marker count. */
			'clusterMarkers'    => __( 'Cluster of %d map markers', 'yamap-block-gutenberg' ),
			'zoomIn'            => __( 'Zoom in', 'yamap-block-gutenberg' ),
			'zoomOut'           => __( 'Zoom out', 'yamap-block-gutenberg' ),
			'geolocate'         => __( 'Show my location', 'yamap-block-gutenberg' ),
			'geolocationError'  => __( 'Your location could not be determined.', 'yamap-block-gutenberg' ),
			'geolocationDenied' => __( 'Location access was denied. Allow it in the browser to use this button.', 'yamap-block-gutenberg' ),
			'userLocation'      => __( 'Your location', 'yamap-block-gutenberg' ),
		);
	}

	/**
	 * Returns the failure explanations shown to people who can fix the map.
	 *
	 * Keys are the runtime error codes reported by the browser loader.
	 *
	 * @return array<string, mixed> Diagnostic translations.
	 */
	private function get_diagnostic_i18n(): array {
		$host = wp_parse_url( home_url( '/' ), PHP_URL_HOST );
		$host = is_string( $host ) && '' !== $host ? $host : home_url( '/' );

		return array(
			'errorDetails' => array(
				'missing_api_key'  => __( 'No Yandex Maps API key is configured. Add a JavaScript API key in the map settings.', 'yamap-block-gutenberg' ),
				'api_key_rejected' => sprintf(
					/* translators: %s: Site host name, for example example.com. */
					__( 'Yandex refused to serve the Maps API to %s. The API key is invalid, or its HTTP Referer restrictions do not include this domain. Open the key in the Yandex Developer Dashboard and allow this domain, or enter a different key.', 'yamap-block-gutenberg' ),
					$host
				),
				'network'          => __( 'The Yandex Maps API could not be reached from this browser. Check the internet connection and any ad blocker, firewall, or privacy extension.', 'yamap-block-gutenberg' ),
				'csp'              => __( 'The Content Security Policy of this site blocks the Yandex Maps API. Allow https://api-maps.yandex.ru and https://yastatic.net in script-src and connect-src.', 'yamap-block-gutenberg' ),
				'timeout'          => __( 'The Yandex Maps API did not respond in time. Reload the page to try again.', 'yamap-block-gutenberg' ),
				'api_unavailable'  => __( 'The Yandex Maps API was loaded but did not start. Another script on the page may conflict with it.', 'yamap-block-gutenberg' ),
				'load_failed'      => __( 'The Yandex Maps API script could not be loaded. Check the API key, its HTTP Referer restrictions, and the network connection.', 'yamap-block-gutenberg' ),
				'render'           => __( 'The map could not be initialized. Open the browser console for the technical error.', 'yamap-block-gutenberg' ),
			),
			'adminOnly'    => __( 'Only site administrators see these details.', 'yamap-block-gutenberg' ),
			'openSettings' => __( 'Open map settings', 'yamap-block-gutenberg' ),
		);
	}

	/**
	 * Encodes runtime JSON with compact, round-trippable floating-point values.
	 *
	 * Some hosts override serialize_precision globally, which can otherwise
	 * expand coordinates to dozens of digits. The previous setting is restored
	 * even if encoding fails or throws.
	 *
	 * @param mixed $value Value to encode.
	 * @return string Safe JSON object/value.
	 */
	private function encode_json( $value ): string {
		$previous_precision = ini_get( 'serialize_precision' );
		$precision_changed  = false;

		if ( false !== $previous_precision && '-1' !== $previous_precision ) {
			// phpcs:ignore WordPress.PHP.IniSet.Risky -- Scoped workaround for host-level precision overrides; restored below.
			$precision_changed = false !== ini_set( 'serialize_precision', '-1' );
		}

		try {
			$json = wp_json_encode(
				$value,
				JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
			);
		} finally {
			if ( $precision_changed ) {
				// phpcs:ignore WordPress.PHP.IniSet.Risky -- Restore the exact request-level value captured above.
				ini_set( 'serialize_precision', $previous_precision );
			}
		}

		return false === $json ? '{}' : $json;
	}
}
