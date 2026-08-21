<?php
/**
 * Map configuration validation and legacy migration.
 *
 * @package GuYaMap
 */

namespace GuYaMap\Support;

defined( 'ABSPATH' ) || exit;

/**
 * Converts untrusted block attributes into a stable frontend schema.
 */
final class Config_Normalizer {

	/**
	 * Current public configuration schema.
	 *
	 * @var int
	 */
	public const SCHEMA_VERSION = 2;

	/**
	 * Maximum nesting accepted for provider-specific JSON values.
	 *
	 * @var int
	 */
	private const MAX_STRUCTURED_DEPTH = 6;

	/**
	 * Maximum items accepted in one provider-specific JSON collection.
	 *
	 * @var int
	 */
	private const MAX_STRUCTURED_ITEMS = 256;

	/**
	 * Maximum length of one provider-specific JSON string.
	 *
	 * @var int
	 */
	private const MAX_STRUCTURED_STRING_LENGTH = 2048;

	/**
	 * Maximum nodes accepted across one structured settings root.
	 *
	 * @var int
	 */
	private const MAX_STRUCTURED_TOTAL_ITEMS = 2048;

	/**
	 * Maximum string/key bytes accepted across one structured settings root.
	 *
	 * @var int
	 */
	private const MAX_STRUCTURED_TOTAL_BYTES = 65536;

	/**
	 * Hard ceiling for markers embedded directly in one block.
	 *
	 * @var int
	 */
	private const MAX_INLINE_MARKERS = 1000;

	/**
	 * Maximum encoded frontend configuration per map, including runtime data.
	 *
	 * @var int
	 */
	public const MAX_RENDER_CONFIG_BYTES = 1048576;

	/**
	 * Normalizes a block attribute payload.
	 *
	 * @param array<string, mixed> $attributes Raw block attributes.
	 * @return array<string, mixed>
	 */
	public function normalize( array $attributes ): array {
		if ( $this->has_legacy_attributes( $attributes ) ) {
			$attributes = $this->migrate_legacy_attributes( $attributes );
		}

		$config = $this->normalize_attributes( $attributes, true );

		/**
		 * Filters the normalized map configuration.
		 *
		 * Trusted add-ons may adjust registered core fields or the extension bag.
		 * The returned value is normalized again before it crosses the render
		 * boundary; add-on-specific data belongs in the bounded `extensions` bag.
		 *
		 * @since 2.0.0
		 *
		 * @param array<string, mixed> $config     Normalized map configuration.
		 * @param array<string, mixed> $attributes Original block attributes.
		 */
		$filtered_config = apply_filters( 'guyamap_normalized_map_config', $config, $attributes );

		return is_array( $filtered_config )
			? $this->normalize_attributes( $filtered_config, false )
			: $config;
	}

	/**
	 * Revalidates trusted extension output without firing extension filters again.
	 *
	 * @param array<string, mixed> $config Filtered configuration.
	 * @return array<string, mixed>
	 */
	public function revalidate( array $config ): array {
		return $this->normalize_attributes( $config, false );
	}

	/**
	 * Keeps the complete encoded render payload within its hard byte budget.
	 *
	 * Configuration is already schema-normalized before this method is called,
	 * so only the ordered inline marker tail can need truncation.
	 *
	 * @param array<string, mixed> $config Complete runtime configuration.
	 * @return array<string, mixed>
	 */
	public function enforce_render_budget( array $config ): array {
		if ( $this->get_encoded_size( $config ) <= self::MAX_RENDER_CONFIG_BYTES ) {
			return $config;
		}

		$markers = isset( $config['markers'] ) && is_array( $config['markers'] )
			? array_values( $config['markers'] )
			: array();
		$minimum = 0;
		$maximum = count( $markers );
		$best    = 0;

		while ( $minimum <= $maximum ) {
			$middle               = (int) floor( ( $minimum + $maximum ) / 2 );
			$candidate            = $config;
			$candidate['markers'] = array_slice( $markers, 0, $middle );

			if ( $this->get_encoded_size( $candidate ) <= self::MAX_RENDER_CONFIG_BYTES ) {
				$best    = $middle;
				$minimum = $middle + 1;
			} else {
				$maximum = $middle - 1;
			}
		}

		$config['markers'] = array_slice( $markers, 0, $best );

		return $config;
	}

	/**
	 * Normalizes only the current schema, optionally allowing marker filters.
	 *
	 * @param array<string, mixed> $attributes           Raw/current attributes.
	 * @param bool                 $apply_marker_filters Whether marker filters may run.
	 * @return array<string, mixed>
	 */
	private function normalize_attributes( array $attributes, bool $apply_marker_filters ): array {

		$zoom_range = $this->normalize_zoom_range(
			isset( $attributes['zoomRange'] ) && is_array( $attributes['zoomRange'] )
				? $attributes['zoomRange']
				: array()
		);

		$center = $this->normalize_center(
			isset( $attributes['center'] ) && is_array( $attributes['center'] )
				? $attributes['center']
				: array()
		);

		$config = array(
			'schemaVersion' => self::SCHEMA_VERSION,
			'center'        => $center,
			'zoom'          => $this->normalize_float(
				$attributes['zoom'] ?? 12,
				12.0,
				$zoom_range['min'],
				$zoom_range['max']
			),
			'zoomRange'     => $zoom_range,
			'camera'        => $this->normalize_camera(
				isset( $attributes['camera'] ) && is_array( $attributes['camera'] )
					? $attributes['camera']
					: array()
			),
			'width'         => $this->normalize_dimension( $attributes['width'] ?? '100%', '100%' ),
			'height'        => $this->normalize_dimension( $attributes['height'] ?? '480px', '480px' ),
			'minHeight'     => $this->normalize_dimension( $attributes['minHeight'] ?? '280px', '280px' ),
			'aspectRatio'   => $this->normalize_aspect_ratio( $attributes['aspectRatio'] ?? '' ),
			'mapMode'       => $this->normalize_enum(
				$attributes['mapMode'] ?? 'auto',
				array( 'auto', 'raster', 'vector' ),
				'auto'
			),
			'theme'         => $this->normalize_enum(
				$attributes['theme'] ?? 'auto',
				array( 'auto', 'light', 'dark' ),
				'auto'
			),
			'behaviors'     => $this->normalize_behaviors( $attributes['behaviors'] ?? array() ),
			'controls'      => $this->normalize_controls(
				isset( $attributes['controls'] ) && is_array( $attributes['controls'] )
					? $attributes['controls']
					: array()
			),
			'mapOptions'    => $this->normalize_map_options(
				isset( $attributes['mapOptions'] ) && is_array( $attributes['mapOptions'] )
					? $attributes['mapOptions']
					: array()
			),
			'customization' => $this->sanitize_structured_value( $attributes['customization'] ?? array() ),
			'markers'       => $this->normalize_markers( $attributes['markers'] ?? array(), $apply_marker_filters ),
			'cluster'       => $this->normalize_cluster(
				isset( $attributes['cluster'] ) && is_array( $attributes['cluster'] )
					? $attributes['cluster']
					: array()
			),
			'loading'       => $this->normalize_loading(
				isset( $attributes['loading'] ) && is_array( $attributes['loading'] )
					? $attributes['loading']
					: array()
			),
			'ariaLabel'     => $this->normalize_non_empty_text(
				$attributes['ariaLabel'] ?? '',
				__( 'Interactive map', 'yamap-block-gutenberg' ),
				300
			),
			'fallbackText'  => $this->normalize_non_empty_text(
				$attributes['fallbackText'] ?? '',
				__( 'Open this location in Yandex Maps', 'yamap-block-gutenberg' ),
				500
			),
			'templateId'    => $this->normalize_integer( $attributes['templateId'] ?? 0, 0, 0, $this->get_max_safe_integer() ),
			'overrides'     => $this->normalize_namespace_bag( $attributes['overrides'] ?? array() ),
			'extensions'    => $this->normalize_namespace_bag( $attributes['extensions'] ?? array() ),
		);

		return $config;
	}

	/**
	 * Detects attributes serialized by version 1.x of the block.
	 *
	 * @param array<string, mixed> $attributes Block attributes.
	 * @return bool
	 */
	private function has_legacy_attributes( array $attributes ): bool {
		$legacy_keys = array(
			'lat',
			'lon',
			'has_placemark',
			'pm_lat',
			'pm_lon',
			'pm_balloon',
			'pm_hint',
		);

		foreach ( $legacy_keys as $legacy_key ) {
			if ( array_key_exists( $legacy_key, $attributes ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Migrates the original flat attribute schema without modifying post data.
	 *
	 * @param array<string, mixed> $attributes Legacy and defaulted attributes.
	 * @return array<string, mixed>
	 */
	private function migrate_legacy_attributes( array $attributes ): array {
		$legacy_center = array(
			'latitude'  => $attributes['lat'] ?? 53.918777,
			'longitude' => $attributes['lon'] ?? 27.562007,
		);

		$attributes['center']        = $legacy_center;
		$attributes['schemaVersion'] = self::SCHEMA_VERSION;

		if ( $this->normalize_boolean( $attributes['has_placemark'] ?? false ) ) {
			$markers   = isset( $attributes['markers'] ) && is_array( $attributes['markers'] )
				? $attributes['markers']
				: array();
			$markers[] = array(
				'id'             => 'legacy-placemark',
				'coordinates'    => array(
					'latitude'  => $attributes['pm_lat'] ?? $legacy_center['latitude'],
					'longitude' => $attributes['pm_lon'] ?? $legacy_center['longitude'],
				),
				'hint'           => $attributes['pm_hint'] ?? '',
				'description'    => $attributes['pm_balloon'] ?? '',
				'balloonContent' => $attributes['pm_balloon'] ?? '',
				'popup'          => array(
					'content' => $attributes['pm_balloon'] ?? '',
				),
				'color'          => '#1e98ff',
			);

			$attributes['markers'] = $markers;
		}

		return $attributes;
	}

	/**
	 * Normalizes map center coordinates.
	 *
	 * @param array<string, mixed> $center Coordinate object.
	 * @return array<string, float>
	 */
	private function normalize_center( array $center ): array {
		return array(
			'latitude'  => $this->normalize_float( $center['latitude'] ?? 55.751244, 55.751244, -90.0, 90.0 ),
			'longitude' => $this->normalize_float( $center['longitude'] ?? 37.618423, 37.618423, -180.0, 180.0 ),
		);
	}

	/**
	 * Normalizes the allowed zoom interval.
	 *
	 * @param array<string, mixed> $zoom_range Zoom interval.
	 * @return array<string, float>
	 */
	private function normalize_zoom_range( array $zoom_range ): array {
		$minimum = $this->normalize_float( $zoom_range['min'] ?? 1, 1.0, 0.0, 23.0 );
		$maximum = $this->normalize_float( $zoom_range['max'] ?? 21, 21.0, 0.0, 23.0 );

		if ( $maximum < $minimum ) {
			$original_minimum = $minimum;
			$minimum          = $maximum;
			$maximum          = $original_minimum;
		}

		return array(
			'min' => $minimum,
			'max' => $maximum,
		);
	}

	/**
	 * Normalizes camera tilt and azimuth.
	 *
	 * @param array<string, mixed> $camera Camera values.
	 * @return array<string, float>
	 */
	private function normalize_camera( array $camera ): array {
		return array(
			'tilt'    => $this->normalize_float( $camera['tilt'] ?? 0, 0.0, 0.0, 50.0 ),
			'azimuth' => $this->normalize_float( $camera['azimuth'] ?? 0, 0.0, -180.0, 180.0 ),
		);
	}

	/**
	 * Normalizes enabled map behaviors.
	 *
	 * @param mixed $behaviors Raw behaviors.
	 * @return string[]
	 */
	private function normalize_behaviors( $behaviors ): array {
		$default_behaviors      = array( 'drag', 'scrollZoom', 'pinchZoom', 'dblClick' );
		$core_allowed_behaviors = array(
			'drag',
			'scrollZoom',
			'pinchZoom',
			'dblClick',
			'magnifier',
			'oneFingerZoom',
			'mouseTilt',
			'mouseRotate',
			'pinchRotate',
			'panTilt',
		);

		/**
		 * Filters behavior identifiers accepted from block attributes.
		 *
		 * @since 2.0.0
		 *
		 * The filter can disable bundled behaviors but cannot introduce identifiers
		 * that the bundled JavaScript runtime does not understand.
		 *
		 * @param string[] $core_allowed_behaviors Allowed behavior identifiers.
		 */
		$filtered_behaviors = apply_filters( 'guyamap_allowed_behaviors', $core_allowed_behaviors );
		$filtered_behaviors = is_array( $filtered_behaviors ) ? $filtered_behaviors : array();
		$allowed_behaviors  = array();

		foreach ( $core_allowed_behaviors as $core_behavior ) {
			if ( in_array( $core_behavior, $filtered_behaviors, true ) ) {
				$allowed_behaviors[] = $core_behavior;
			}
		}

		if ( ! is_array( $behaviors ) ) {
			return array_values( array_intersect( $default_behaviors, $allowed_behaviors ) );
		}

		$normalized = array();
		foreach ( $behaviors as $behavior ) {
			$behavior = $this->normalize_plain_text( $behavior, false, 64 );
			if ( in_array( $behavior, $allowed_behaviors, true ) ) {
				$normalized[] = $behavior;
			}
		}

		return array_values( array_unique( $normalized ) );
	}

	/**
	 * Normalizes map controls.
	 *
	 * @param array<string, mixed> $controls Raw controls.
	 * @return array<string, mixed>
	 */
	private function normalize_controls( array $controls ): array {
		return array(
			'zoom'        => $this->normalize_boolean( $controls['zoom'] ?? true ),
			'geolocation' => $this->normalize_boolean( $controls['geolocation'] ?? true ),
			'fullscreen'  => $this->normalize_boolean( $controls['fullscreen'] ?? true ),
			'position'    => $this->normalize_enum(
				$controls['position'] ?? 'right',
				array( 'left', 'right', 'top', 'bottom' ),
				'right'
			),
		);
	}

	/**
	 * Normalizes advanced Yandex map options.
	 *
	 * @param array<string, mixed> $options Raw options.
	 * @return array<string, mixed>
	 */
	private function normalize_map_options( array $options ): array {
		return array(
			'copyrightsPosition'    => $this->normalize_enum(
				$options['copyrightsPosition'] ?? 'bottom right',
				array( 'top left', 'top right', 'bottom left', 'bottom right' ),
				'bottom right'
			),
			'showScaleInCopyrights' => $this->normalize_boolean( $options['showScaleInCopyrights'] ?? true ),
			'zoomRounding'          => $this->normalize_enum(
				$options['zoomRounding'] ?? 'auto',
				array( 'auto', 'smooth', 'snap' ),
				'auto'
			),
			'zoomStrategy'          => $this->normalize_enum(
				$options['zoomStrategy'] ?? 'zoomToPointer',
				array( 'zoomToPointer', 'zoomToCenter' ),
				'zoomToPointer'
			),
			'restrictMapArea'       => $this->normalize_restricted_area( $options['restrictMapArea'] ?? false ),
			'margin'                => $this->normalize_margin( $options['margin'] ?? array() ),
			'fitToMarkers'          => $this->normalize_boolean( $options['fitToMarkers'] ?? false ),
		);
	}

	/**
	 * Normalizes all inline markers and enforces a safe payload ceiling.
	 *
	 * @param mixed $markers              Raw marker list.
	 * @param bool  $apply_marker_filters Whether marker filters may run.
	 * @return array<int, array<string, mixed>>
	 */
	private function normalize_markers( $markers, bool $apply_marker_filters ): array {
		if ( ! is_array( $markers ) ) {
			return array();
		}

		/**
		 * Filters the maximum number of markers serialized inline with one block.
		 *
		 * Larger datasets should use a server-backed feature provider.
		 *
		 * @since 2.0.0
		 *
		 * Values can reduce, but never raise, the hard limit of 1,000 markers.
		 * Use a server-backed feature provider for larger collections.
		 *
		 * @param int $maximum Maximum inline marker count.
		 */
		$filtered_maximum = apply_filters( 'guyamap_max_inline_markers', self::MAX_INLINE_MARKERS );
		$maximum          = is_numeric( $filtered_maximum ) ? (int) $filtered_maximum : self::MAX_INLINE_MARKERS;
		$maximum          = max( 0, min( self::MAX_INLINE_MARKERS, $maximum ) );

		$normalized  = array();
		$identifiers = array();
		foreach ( array_slice( $markers, 0, $maximum ) as $index => $marker ) {
			if ( ! is_array( $marker ) ) {
				continue;
			}

			$normalized_marker = $this->normalize_marker( $marker, (int) $index, $apply_marker_filters );
			if ( null !== $normalized_marker ) {
				$base_identifier = $this->normalize_plain_text( $normalized_marker['id'] ?? '', false, 128 );
				if ( '' === $base_identifier ) {
					$base_identifier = 'marker-' . ( $index + 1 );
				}

				$identifier = $base_identifier;
				$suffix     = 2;
				while ( isset( $identifiers[ $identifier ] ) ) {
					$suffix_text = '-' . $suffix;
					$base_length = 128 - strlen( $suffix_text );
					$identifier  = function_exists( 'mb_substr' )
						? mb_substr( $base_identifier, 0, $base_length, 'UTF-8' ) . $suffix_text
						: substr( $base_identifier, 0, $base_length ) . $suffix_text;
					++$suffix;
				}

				$normalized_marker['id']    = $identifier;
				$identifiers[ $identifier ] = true;
				$normalized[]               = $normalized_marker;
			}
		}

		return $normalized;
	}

	/**
	 * Normalizes one marker into the stable client-side marker schema.
	 *
	 * @param array<string, mixed> $marker               Raw marker.
	 * @param int                  $index                Marker position.
	 * @param bool                 $apply_marker_filters Whether marker filters may run.
	 * @return array<string, mixed>|null
	 */
	private function normalize_marker( array $marker, int $index, bool $apply_marker_filters ): ?array {
		$coordinates = $this->extract_marker_coordinates( $marker );
		if ( null === $coordinates ) {
			return null;
		}

		$marker_id = $this->normalize_plain_text( $marker['id'] ?? '', false, 128 );
		if ( '' === $marker_id ) {
			$marker_id = 'marker-' . ( $index + 1 );
		}

		$icon = isset( $marker['icon'] ) && is_array( $marker['icon'] )
			? $marker['icon']
			: array();
		$link = isset( $marker['link'] ) && is_array( $marker['link'] )
			? $marker['link']
			: array();

		$legacy_icon_url = $this->normalize_scalar_string( $marker['iconUrl'] ?? '' );
		$icon_url        = array_key_exists( 'url', $icon )
			? $this->normalize_scalar_string( $icon['url'] )
			: $legacy_icon_url;
		$icon_type       = $this->normalize_enum(
			$icon['type'] ?? ( '' !== $icon_url ? 'image' : 'default' ),
			array( 'default', 'image' ),
			'default'
		);

		$description = $marker['description'] ?? ( $marker['balloonContent'] ?? '' );
		if (
			'' === $this->normalize_scalar_string( $description ) &&
			isset( $marker['popup'] ) &&
			is_array( $marker['popup'] ) &&
			array_key_exists( 'content', $marker['popup'] )
		) {
			$description = $marker['popup']['content'];
		}

		$normalized = array(
			'id'                  => $marker_id,
			'coordinates'         => $coordinates,
			'title'               => $this->normalize_plain_text( $marker['title'] ?? '', false, 300 ),
			'description'         => $this->normalize_plain_text( $description, true, 5000 ),
			'hint'                => $this->normalize_plain_text( $marker['hint'] ?? '', false, 300 ),
			'category'            => $this->normalize_plain_text( $marker['category'] ?? '', false, 128 ),
			'address'             => $this->normalize_plain_text( $marker['address'] ?? '', false, 500 ),
			'icon'                => array(
				'type'       => $icon_type,
				'color'      => $this->normalize_color( $icon['color'] ?? ( $marker['color'] ?? '#ff4433' ), '#ff4433' ),
				'url'        => $this->normalize_http_url( $icon_url ),
				'name'       => $this->normalize_non_empty_text( $icon['name'] ?? 'fallback', 'fallback', 128 ),
				'markerSize' => $this->normalize_enum(
					$icon['markerSize'] ?? 'normal',
					array( 'normal', 'small', 'micro' ),
					'normal'
				),
				'size'       => $this->normalize_number_pair( $icon['size'] ?? array(), array( 40, 40 ), 1, 512 ),
				'offset'     => $this->normalize_number_pair( $icon['offset'] ?? array(), array( -20, -40 ), -512, 512 ),
			),
			'draggable'           => $this->normalize_boolean( $marker['draggable'] ?? false ),
			'mapFollowsOnDrag'    => $this->normalize_boolean( $marker['mapFollowsOnDrag'] ?? true ),
			'hideOutsideViewport' => $this->normalize_boolean( $marker['hideOutsideViewport'] ?? true ),
			'zIndex'              => $this->normalize_integer( $marker['zIndex'] ?? $index, $index, -100000, 100000 ),
			'link'                => array(
				'url'    => $this->normalize_http_url( $link['url'] ?? '' ),
				'label'  => $this->normalize_plain_text( $link['label'] ?? '', false, 300 ),
				'newTab' => $this->normalize_boolean( $link['newTab'] ?? false ),
			),
		);

		/**
		 * Filters one normalized inline marker.
		 *
		 * @since 2.0.0
		 *
		 * @param array<string, mixed> $normalized Normalized marker.
		 * @param array<string, mixed> $marker     Original marker.
		 * @param int                  $index      Marker position.
		 */
		if ( ! $apply_marker_filters ) {
			return $normalized;
		}

		$filtered_marker = apply_filters( 'guyamap_normalized_marker', $normalized, $marker, $index );

		return is_array( $filtered_marker )
			? $this->normalize_marker( $filtered_marker, $index, false )
			: $normalized;
	}

	/**
	 * Normalizes a two-number tuple used by marker images.
	 *
	 * @param mixed $value    Raw tuple.
	 * @param int[] $fallback Fallback tuple.
	 * @param int   $minimum  Minimum component value.
	 * @param int   $maximum  Maximum component value.
	 * @return int[]
	 */
	private function normalize_number_pair( $value, array $fallback, int $minimum, int $maximum ): array {
		if ( ! is_array( $value ) || 2 !== count( $value ) ) {
			return $fallback;
		}

		$value = array_values( $value );

		return array(
			$this->normalize_integer( $value[0], $fallback[0], $minimum, $maximum ),
			$this->normalize_integer( $value[1], $fallback[1], $minimum, $maximum ),
		);
	}

	/**
	 * Extracts coordinates from modern, GeoJSON, and legacy marker shapes.
	 *
	 * @param array<string, mixed> $marker Marker attributes.
	 * @return array<string, float>|null
	 */
	private function extract_marker_coordinates( array $marker ): ?array {
		$latitude  = null;
		$longitude = null;

		if ( isset( $marker['coordinates'] ) && is_array( $marker['coordinates'] ) ) {
			if ( isset( $marker['coordinates']['latitude'], $marker['coordinates']['longitude'] ) ) {
				$latitude  = $marker['coordinates']['latitude'];
				$longitude = $marker['coordinates']['longitude'];
			} elseif ( isset( $marker['coordinates'][0], $marker['coordinates'][1] ) ) {
				// Yandex Maps JS API v3 and GeoJSON use longitude, latitude order.
				$longitude = $marker['coordinates'][0];
				$latitude  = $marker['coordinates'][1];
			}
		} elseif ( isset( $marker['geometry']['coordinates'] ) && is_array( $marker['geometry']['coordinates'] ) ) {
			$geometry_coordinates = $marker['geometry']['coordinates'];
			if ( isset( $geometry_coordinates[0], $geometry_coordinates[1] ) ) {
				$longitude = $geometry_coordinates[0];
				$latitude  = $geometry_coordinates[1];
			}
		} elseif ( isset( $marker['latitude'], $marker['longitude'] ) ) {
			$latitude  = $marker['latitude'];
			$longitude = $marker['longitude'];
		} elseif ( isset( $marker['lat'] ) && ( isset( $marker['lon'] ) || isset( $marker['lng'] ) ) ) {
			$latitude  = $marker['lat'];
			$longitude = $marker['lon'] ?? $marker['lng'];
		}

		if ( ! is_numeric( $latitude ) || ! is_numeric( $longitude ) ) {
			return null;
		}

		return array(
			'latitude'  => $this->normalize_float( $latitude, 0.0, -90.0, 90.0 ),
			'longitude' => $this->normalize_float( $longitude, 0.0, -180.0, 180.0 ),
		);
	}

	/**
	 * Normalizes marker clustering settings.
	 *
	 * @param array<string, mixed> $cluster Raw clustering settings.
	 * @return array<string, mixed>
	 */
	private function normalize_cluster( array $cluster ): array {
		return array(
			'enabled'  => $this->normalize_boolean( $cluster['enabled'] ?? true ),
			'gridSize' => $this->normalize_integer( $cluster['gridSize'] ?? 64, 64, 16, 256 ),
			'maxZoom'  => $this->normalize_integer( $cluster['maxZoom'] ?? 18, 18, 0, 23 ),
			'color'    => $this->normalize_color( $cluster['color'] ?? '#ff4433', '#ff4433' ),
		);
	}

	/**
	 * Normalizes lazy-loading behavior.
	 *
	 * @param array<string, mixed> $loading Raw loading settings.
	 * @return array<string, mixed>
	 */
	private function normalize_loading( array $loading ): array {
		$preloader = isset( $loading['preloader'] ) && is_array( $loading['preloader'] )
			? $loading['preloader']
			: array();

		return array(
			'lazy'            => $this->normalize_boolean( $loading['lazy'] ?? true ),
			'rootMargin'      => $this->normalize_root_margin( $loading['rootMargin'] ?? '300px' ),
			'clickToActivate' => $this->normalize_boolean( $loading['clickToActivate'] ?? false ),
			'preloader'       => array(
				'enabled'            => $this->normalize_boolean( $preloader['enabled'] ?? false ),
				'type'               => $this->normalize_enum(
					$preloader['type'] ?? 'spinner',
					array( 'spinner', 'dots', 'pulse' ),
					'spinner'
				),
				'color'              => $this->normalize_color( $preloader['color'] ?? '#3858e9', '#3858e9' ),
				'backgroundColor'    => $this->normalize_color( $preloader['backgroundColor'] ?? '#eef1f5', '#eef1f5' ),
				'size'               => $this->normalize_integer( $preloader['size'] ?? 48, 48, 24, 96 ),
				'transitionDuration' => $this->normalize_integer( $preloader['transitionDuration'] ?? 300, 300, 0, 2000 ),
				'label'              => $this->normalize_non_empty_text(
					$preloader['label'] ?? '',
					__( 'Loading map…', 'yamap-block-gutenberg' ),
					160
				),
			),
		);
	}

	/**
	 * Recursively sanitizes provider-specific JSON-compatible settings.
	 *
	 * Dangerous prototype keys and markup are always discarded. The renderer's
	 * JSON encoding supplies a second, output-context-specific safety boundary.
	 *
	 * @param mixed      $value  Current value.
	 * @param int        $depth  Current recursion depth.
	 * @param string     $key    Current object key.
	 * @param array|null &$budget Shared node/string byte budget.
	 * @return mixed
	 */
	private function sanitize_structured_value( $value, int $depth = 0, string $key = '', ?array &$budget = null ) {
		if ( null === $budget ) {
			$budget = array(
				'items' => self::MAX_STRUCTURED_TOTAL_ITEMS,
				'bytes' => self::MAX_STRUCTURED_TOTAL_BYTES,
			);
		}

		if ( $depth > self::MAX_STRUCTURED_DEPTH || $budget['items'] <= 0 ) {
			return null;
		}

		--$budget['items'];

		if ( is_array( $value ) ) {
			$sanitized = array();
			$counter   = 0;

			foreach ( $value as $child_key => $child_value ) {
				if ( $counter >= self::MAX_STRUCTURED_ITEMS ) {
					break;
				}
				++$counter;

				if ( is_string( $child_key ) && ! $this->is_safe_structured_key( $child_key ) ) {
					continue;
				}

				if ( is_string( $child_key ) ) {
					$key_bytes = strlen( $child_key );
					if ( $key_bytes > $budget['bytes'] ) {
						break;
					}
					$budget['bytes'] -= $key_bytes;
				}

				$sanitized[ $child_key ] = $this->sanitize_structured_value(
					$child_value,
					$depth + 1,
					is_string( $child_key ) ? $child_key : '',
					$budget
				);
			}

			return $sanitized;
		}

		if ( is_string( $value ) ) {
			if ( false !== stripos( $key, 'url' ) || false !== stripos( $key, 'href' ) || false !== stripos( $key, 'src' ) ) {
				$value = $this->normalize_http_url( $value );
			} else {
				$value = $this->normalize_plain_text( $value, false, self::MAX_STRUCTURED_STRING_LENGTH );
			}

			$value            = $this->truncate_utf8_bytes( $value, max( 0, $budget['bytes'] ) );
			$budget['bytes'] -= strlen( $value );

			return $value;
		}

		if ( is_int( $value ) || is_bool( $value ) || null === $value ) {
			return $value;
		}

		if ( is_float( $value ) ) {
			return is_finite( $value ) ? $value : null;
		}

		return null;
	}

	/**
	 * Normalizes a hidden object attribute used by extension namespaces.
	 *
	 * Numeric outer keys are rejected so lists cannot masquerade as namespace
	 * objects. Nested lists remain valid extension data and receive the same
	 * depth, item, key, URL, and string limits as other structured settings.
	 *
	 * @param mixed $value Raw namespace object.
	 * @return array<string, mixed>
	 */
	private function normalize_namespace_bag( $value ): array {
		if ( ! is_array( $value ) ) {
			return array();
		}

		$normalized = array();
		$counter    = 0;
		$budget     = array(
			'items' => self::MAX_STRUCTURED_TOTAL_ITEMS,
			'bytes' => self::MAX_STRUCTURED_TOTAL_BYTES,
		);
		foreach ( $value as $namespace => $namespace_value ) {
			if ( $counter >= self::MAX_STRUCTURED_ITEMS ) {
				break;
			}
			++$counter;

			if ( ! is_string( $namespace ) || ! $this->is_safe_structured_key( $namespace ) ) {
				continue;
			}

			$namespace_bytes = strlen( $namespace );
			if ( $namespace_bytes > $budget['bytes'] ) {
				break;
			}
			$budget['bytes'] -= $namespace_bytes;

			$normalized[ $namespace ] = $this->sanitize_structured_value( $namespace_value, 1, $namespace, $budget );
		}

		return $normalized;
	}

	/**
	 * Returns the byte length produced by the renderer's JSON flags.
	 *
	 * @param array<string, mixed> $value JSON-compatible configuration.
	 * @return int Encoded bytes, or PHP_INT_MAX when encoding fails.
	 */
	private function get_encoded_size( array $value ): int {
		$json = wp_json_encode(
			$value,
			JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
		);

		return false === $json ? PHP_INT_MAX : strlen( $json );
	}

	/**
	 * Truncates a UTF-8 string without exceeding an encoded byte budget.
	 *
	 * @param string $value         Normalized UTF-8 string.
	 * @param int    $maximum_bytes Maximum permitted bytes.
	 * @return string
	 */
	private function truncate_utf8_bytes( string $value, int $maximum_bytes ): string {
		if ( $maximum_bytes <= 0 ) {
			return '';
		}

		if ( strlen( $value ) <= $maximum_bytes ) {
			return $value;
		}

		if ( ! function_exists( 'mb_strlen' ) || ! function_exists( 'mb_substr' ) ) {
			return wp_check_invalid_utf8( substr( $value, 0, $maximum_bytes ) );
		}

		$minimum = 0;
		$maximum = mb_strlen( $value, 'UTF-8' );
		$best    = '';

		while ( $minimum <= $maximum ) {
			$middle    = (int) floor( ( $minimum + $maximum ) / 2 );
			$candidate = mb_substr( $value, 0, $middle, 'UTF-8' );
			if ( strlen( $candidate ) <= $maximum_bytes ) {
				$best    = $candidate;
				$minimum = $middle + 1;
			} else {
				$maximum = $middle - 1;
			}
		}

		return $best;
	}

	/**
	 * Returns the largest integer that remains exact in the JavaScript runtime.
	 *
	 * @return int
	 */
	private function get_max_safe_integer(): int {
		return PHP_INT_SIZE >= 8 ? 9007199254740991 : PHP_INT_MAX;
	}

	/**
	 * Rejects keys that can mutate JavaScript object prototypes.
	 *
	 * @param string $key Object key.
	 * @return bool
	 */
	private function is_safe_structured_key( string $key ): bool {
		if ( in_array( strtolower( $key ), array( '__proto__', 'prototype', 'constructor' ), true ) ) {
			return false;
		}

		return 1 === preg_match( '/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/', $key );
	}

	/**
	 * Normalizes a CSS dimension accepted by the block container.
	 *
	 * @param mixed  $value   Raw dimension.
	 * @param string $fallback Safe fallback.
	 * @return string
	 */
	private function normalize_dimension( $value, string $fallback ): string {
		$value = trim( $this->normalize_scalar_string( $value ) );
		if ( strlen( $value ) > 64 ) {
			return $fallback;
		}

		return 1 === preg_match(
			'/^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|%|em|rem|vh|vw|vmin|vmax|ch))$/i',
			$value
		) ? $value : $fallback;
	}

	/**
	 * Normalizes CSS aspect-ratio syntax.
	 *
	 * @param mixed $value Raw aspect ratio.
	 * @return string
	 */
	private function normalize_aspect_ratio( $value ): string {
		$value = trim( $this->normalize_scalar_string( $value ) );
		if ( '' === $value || strlen( $value ) > 64 ) {
			return '';
		}

		if ( 1 !== preg_match( '/^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?$/', $value, $matches ) ) {
			return '';
		}

		$first  = (float) $matches[1];
		$second = isset( $matches[2] ) ? (float) $matches[2] : 1.0;
		if ( $first <= 0 || $second <= 0 ) {
			return '';
		}

		return isset( $matches[2] ) ? $matches[1] . ' / ' . $matches[2] : $matches[1];
	}

	/**
	 * Normalizes IntersectionObserver rootMargin syntax.
	 *
	 * @param mixed $value Raw margin.
	 * @return string
	 */
	private function normalize_root_margin( $value ): string {
		$value = preg_replace( '/\s+/', ' ', trim( $this->normalize_scalar_string( $value ) ) );
		$value = is_string( $value ) ? $value : '';
		if ( strlen( $value ) > 128 ) {
			return '300px';
		}

		return 1 === preg_match(
			'/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|%)(?:\s+-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|%)){0,3}$/',
			$value
		) ? $value : '300px';
	}

	/**
	 * Normalizes map viewport margins.
	 *
	 * @param mixed $margin Raw margin list.
	 * @return int[]
	 */
	private function normalize_margin( $margin ): array {
		$margin = is_array( $margin ) ? array_values( $margin ) : array();
		$output = array();

		for ( $index = 0; $index < 4; ++$index ) {
			$output[] = $this->normalize_integer( $margin[ $index ] ?? 0, 0, 0, 2000 );
		}

		return $output;
	}

	/**
	 * Normalizes a map restriction boolean or coordinate bounds.
	 *
	 * @param mixed $area Raw restriction.
	 * @return false|array<int, array<int, float>>
	 */
	private function normalize_restricted_area( $area ) {
		if ( ! is_array( $area ) || ! isset( $area[0], $area[1] ) ) {
			return false;
		}

		$longitudes = array();
		$latitudes  = array();
		foreach ( array_slice( $area, 0, 2 ) as $point ) {
			if (
				! is_array( $point ) ||
				! isset( $point[0], $point[1] ) ||
				! is_numeric( $point[0] ) ||
				! is_numeric( $point[1] )
			) {
				return false;
			}

			$longitudes[] = $this->normalize_float( $point[0], 0.0, -180.0, 180.0 );
			$latitudes[]  = $this->normalize_float( $point[1], 0.0, -90.0, 90.0 );
		}

		return array(
			array( min( $longitudes ), max( $latitudes ) ),
			array( max( $longitudes ), min( $latitudes ) ),
		);
	}

	/**
	 * Normalizes a color supported by HTML/CSS.
	 *
	 * @param mixed  $value   Raw color.
	 * @param string $fallback Fallback color.
	 * @return string
	 */
	private function normalize_color( $value, string $fallback ): string {
		$value = trim( $this->normalize_scalar_string( $value ) );
		if ( strlen( $value ) > 16 ) {
			return $fallback;
		}

		return 1 === preg_match( '/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i', $value )
			? strtolower( $value )
			: $fallback;
	}

	/**
	 * Returns a safe enum member.
	 *
	 * @param mixed    $value   Raw value.
	 * @param string[] $allowed Allowed values.
	 * @param string   $fallback Fallback.
	 * @return string
	 */
	private function normalize_enum( $value, array $allowed, string $fallback ): string {
		$value = $this->normalize_plain_text( $value, false, 64 );

		return in_array( $value, $allowed, true ) ? $value : $fallback;
	}

	/**
	 * Normalizes a non-empty plain text value.
	 *
	 * @param mixed  $value          Raw value.
	 * @param string $fallback       Fallback.
	 * @param int    $maximum_length Maximum character count.
	 * @return string
	 */
	private function normalize_non_empty_text( $value, string $fallback, int $maximum_length = 0 ): string {
		$value = $this->normalize_plain_text( $value, false, $maximum_length );

		return '' !== $value ? $value : $fallback;
	}

	/**
	 * Converts a scalar into a string without raising notices for invalid shapes.
	 *
	 * @param mixed $value Raw value.
	 * @return string
	 */
	private function normalize_scalar_string( $value ): string {
		return is_scalar( $value ) ? (string) $value : '';
	}

	/**
	 * Normalizes a plain-text field, optionally preserving line breaks.
	 *
	 * @param mixed $value          Raw value.
	 * @param bool  $multiline      Whether to preserve line breaks.
	 * @param int   $maximum_length Maximum character count, or zero for no limit.
	 * @return string
	 */
	private function normalize_plain_text( $value, bool $multiline = false, int $maximum_length = 0 ): string {
		$value = $this->normalize_scalar_string( $value );
		$value = wp_check_invalid_utf8( $value );
		$value = html_entity_decode( $value, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		$value = wp_strip_all_tags( $value, false );

		if ( $multiline ) {
			$value = str_replace( array( "\r\n", "\r" ), "\n", $value );
			$value = preg_replace( '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value );
		} else {
			$value = preg_replace( '/[\s\x{00A0}]+/u', ' ', $value );
		}

		$value = is_string( $value ) ? trim( $value ) : '';

		if ( $maximum_length > 0 ) {
			$value = function_exists( 'mb_substr' )
				? mb_substr( $value, 0, $maximum_length, 'UTF-8' )
				: substr( $value, 0, $maximum_length );
		}

		return $value;
	}

	/**
	 * Normalizes and caps a browser-safe HTTP(S) URL.
	 *
	 * @param mixed $value Raw URL.
	 * @return string
	 */
	private function normalize_http_url( $value ): string {
		$url = esc_url_raw( $this->normalize_scalar_string( $value ), array( 'http', 'https' ) );

		if ( strlen( $url ) > self::MAX_STRUCTURED_STRING_LENGTH ) {
			$url = esc_url_raw(
				substr( $url, 0, self::MAX_STRUCTURED_STRING_LENGTH ),
				array( 'http', 'https' )
			);
		}

		return $url;
	}

	/**
	 * Normalizes a finite floating-point value and clamps its range.
	 *
	 * @param mixed $value   Raw number.
	 * @param float $fallback Fallback.
	 * @param float $minimum Minimum.
	 * @param float $maximum Maximum.
	 * @return float
	 */
	private function normalize_float( $value, float $fallback, float $minimum, float $maximum ): float {
		if ( ! is_numeric( $value ) ) {
			return $fallback;
		}

		$value = (float) $value;
		if ( ! is_finite( $value ) ) {
			return $fallback;
		}

		return round( max( $minimum, min( $maximum, $value ) ), 8 );
	}

	/**
	 * Normalizes and clamps an integer.
	 *
	 * @param mixed $value   Raw number.
	 * @param int   $fallback Fallback.
	 * @param int   $minimum Minimum.
	 * @param int   $maximum Maximum.
	 * @return int
	 */
	private function normalize_integer( $value, int $fallback, int $minimum, int $maximum ): int {
		if ( ! is_numeric( $value ) ) {
			return $fallback;
		}

		$numeric_value = (float) $value;
		if ( ! is_finite( $numeric_value ) ) {
			return $fallback;
		}

		return (int) max( $minimum, min( $maximum, $numeric_value ) );
	}

	/**
	 * Normalizes common serialized boolean representations.
	 *
	 * @param mixed $value Raw boolean.
	 * @return bool
	 */
	private function normalize_boolean( $value ): bool {
		if ( is_bool( $value ) ) {
			return $value;
		}

		if ( is_string( $value ) ) {
			return in_array( strtolower( $value ), array( '1', 'true', 'yes', 'on' ), true );
		}

		return is_int( $value ) || is_float( $value ) ? 0.0 !== (float) $value : false;
	}
}
