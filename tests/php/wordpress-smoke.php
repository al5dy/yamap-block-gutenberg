<?php
/**
 * WordPress integration smoke test for the release build.
 *
 * Run with:
 * wp eval-file wp-content/plugins/yamap-block-gutenberg/tests/php/wordpress-smoke.php
 *
 * @package GuYaMap
 */

defined( 'ABSPATH' ) || exit;

/**
 * Stops the smoke test when a condition is not satisfied.
 *
 * @param bool   $condition Whether the assertion passed.
 * @param string $message   Failure message.
 * @return void
 * @throws RuntimeException When WP-CLI is unavailable and the assertion fails.
 */
function guyamap_smoke_assert( bool $condition, string $message ): void {
	if ( $condition ) {
		return;
	}

	if ( defined( 'WP_CLI' ) && WP_CLI ) {
		WP_CLI::error( esc_html( $message ) );
	}

	throw new RuntimeException( esc_html( $message ) );
}

/**
 * Extracts the safely embedded map configuration.
 *
 * @param string $html Rendered block HTML.
 * @return array<string, mixed>
 */
function guyamap_smoke_extract_config( string $html ): array {
	$json = guyamap_smoke_extract_json( $html );

	$config = json_decode( $json, true );
	guyamap_smoke_assert( is_array( $config ), 'The rendered map config is not valid JSON.' );

	return $config;
}

/**
 * Extracts the raw JSON without relying on the PCRE backtracking limit.
 *
 * @param string $html Rendered block HTML.
 * @return string
 */
function guyamap_smoke_extract_json( string $html ): string {
	$opening = '<script type="application/json" class="guyamap-map__config">';
	$start   = strpos( $html, $opening );
	guyamap_smoke_assert( false !== $start, 'The rendered application/json config is missing.' );
	$start += strlen( $opening );
	$end    = strpos( $html, '</script>', $start );
	guyamap_smoke_assert( false !== $end, 'The rendered application/json config is not closed.' );

	return substr( $html, $start, $end - $start );
}

/**
 * Renders the block through WordPress so block supports receive a WP_Block.
 *
 * @param array<string, mixed> $attributes Block attributes.
 * @param string               $content    Saved inner block HTML.
 * @return string
 */
function guyamap_smoke_render( array $attributes, string $content = '' ): string {
	return render_block(
		array(
			'blockName'    => 'gutenberg-yandex-block/map',
			'attrs'        => $attributes,
			'innerBlocks'  => array(),
			'innerHTML'    => $content,
			'innerContent' => array( $content ),
		)
	);
}

$guyamap_registry = WP_Block_Type_Registry::get_instance();
$guyamap_type     = $guyamap_registry->get_registered( 'gutenberg-yandex-block/map' );
$guyamap_legacy   = new GuYaMap();

guyamap_smoke_assert( $guyamap_type instanceof WP_Block_Type, 'The block is not registered.' );
guyamap_smoke_assert( $guyamap_legacy instanceof GuYaMap\Plugin, 'The legacy GuYaMap constructor alias is not compatible.' );
guyamap_smoke_assert( 3 === $guyamap_type->api_version, 'The registered block does not use Block API v3.' );
guyamap_smoke_assert( is_callable( $guyamap_type->render_callback ), 'The dynamic render callback is missing.' );
guyamap_smoke_assert( ! empty( $guyamap_type->editor_script_handles ), 'The editor script handle is missing.' );
guyamap_smoke_assert( ! empty( $guyamap_type->view_script_handles ), 'The view script handle is missing.' );

$guyamap_attributes = array(
	'center'     => array(
		'latitude'  => -33.9,
		'longitude' => 151.2,
	),
	'behaviors'  => array( 'drag', 'unknown-behavior' ),
	'mapOptions' => array(
		'fitToMarkers'        => true,
		'totallyUnknownValue' => 'must-not-cross-the-server-boundary',
	),
	'markers'    => array(
		array(
			'id'          => 'office',
			'coordinates' => array(
				'latitude'  => -33.91,
				'longitude' => 151.21,
			),
			'title'       => 'A < B',
			'description' => '<script>alert(1)</script>Safe text',
		),
		array(
			'id'          => 'office',
			'coordinates' => array(
				'latitude'  => -33.92,
				'longitude' => 151.22,
			),
		),
	),
	'extensions' => json_decode( '{"safe":{"value":"ok"},"__proto__":{"polluted":true}}', true ),
);

$guyamap_previous_precision = ini_get( 'serialize_precision' );
// phpcs:ignore WordPress.PHP.IniSet.Risky -- Deliberately simulates a hostile host setting and restores it below.
ini_set( 'serialize_precision', '100' );
$guyamap_first_html  = guyamap_smoke_render( $guyamap_attributes );
$guyamap_second_html = guyamap_smoke_render( $guyamap_attributes );
if ( false !== $guyamap_previous_precision ) {
	// phpcs:ignore WordPress.PHP.IniSet.Risky -- Restore the exact setting captured before the smoke test.
	ini_set( 'serialize_precision', $guyamap_previous_precision );
}

$guyamap_first_config  = guyamap_smoke_extract_config( $guyamap_first_html );
$guyamap_second_config = guyamap_smoke_extract_config( $guyamap_second_html );

guyamap_smoke_assert( abs( (float) $guyamap_first_config['center']['latitude'] - ( -33.9 ) ) < 0.000000001, 'Coordinate precision was expanded or changed.' );
guyamap_smoke_assert( 'A < B' === $guyamap_first_config['markers'][0]['title'], 'Plain marker text was incorrectly entity-encoded.' );
guyamap_smoke_assert(
	false === strpos( $guyamap_first_config['markers'][0]['description'], '<' ) &&
	false === stripos( $guyamap_first_config['markers'][0]['description'], 'script' ) &&
	false !== strpos( $guyamap_first_config['markers'][0]['description'], 'Safe text' ),
	'Marker markup was not converted to safe text.'
);
guyamap_smoke_assert( 'office-2' === $guyamap_first_config['markers'][1]['id'], 'Duplicate marker IDs were not normalized.' );
guyamap_smoke_assert( ! isset( $guyamap_first_config['extensions']['__proto__'] ), 'A prototype key survived extension normalization.' );
guyamap_smoke_assert( true === $guyamap_first_config['mapOptions']['fitToMarkers'], 'A supported map option was not preserved.' );
guyamap_smoke_assert( ! isset( $guyamap_first_config['mapOptions']['totallyUnknownValue'] ), 'An unknown map option crossed the server allow-list.' );
guyamap_smoke_assert( false === strpos( $guyamap_first_html, '<script>alert' ), 'Executable marker markup reached block HTML.' );
guyamap_smoke_assert( false !== strpos( $guyamap_first_html, '\\u003C' ), 'Embedded JSON did not hex-escape a less-than sign.' );

preg_match( '/id="(guyamap-map-[^"]+)"/', $guyamap_first_html, $guyamap_first_id );
preg_match( '/id="(guyamap-map-[^"]+)"/', $guyamap_second_html, $guyamap_second_id );
guyamap_smoke_assert(
	isset( $guyamap_first_id[1], $guyamap_second_id[1] ) && $guyamap_first_id[1] !== $guyamap_second_id[1],
	'Multiple rendered maps did not receive unique instance IDs.'
);

$guyamap_legacy_html   = guyamap_smoke_render(
	array(
		'lat'           => -34.0,
		'lon'           => 151.0,
		'has_placemark' => true,
		'pm_lat'        => -34.1,
		'pm_lon'        => 151.1,
		'pm_balloon'    => 'Legacy marker',
	)
);
$guyamap_legacy_config = guyamap_smoke_extract_config( $guyamap_legacy_html );
guyamap_smoke_assert( abs( (float) $guyamap_legacy_config['center']['latitude'] - ( -34.0 ) ) < 0.000000001, 'A negative legacy latitude was not migrated.' );
guyamap_smoke_assert( 'Legacy marker' === $guyamap_legacy_config['markers'][0]['description'], 'Legacy balloon text was not migrated.' );

$guyamap_legacy_defaults = array(
	'blockAlignment' => '',
	'height'         => '400px',
	'width'          => '100%',
	'lat'            => 53.918777,
	'lon'            => 27.562007,
	'pm_lat'         => 53.918777,
	'pm_lon'         => 27.562007,
	'pm_balloon'     => '',
	'pm_hint'        => '',
	'zoom'           => 10,
	'has_placemark'  => false,
);
$guyamap_saved_legacy    = sprintf(
	'<div class="wp-block-gutenberg-yandex-block-map" data-params="%s"></div>',
	esc_attr( wp_json_encode( $guyamap_legacy_defaults ) )
);
$guyamap_default_html    = guyamap_smoke_render( array(), $guyamap_saved_legacy );
$guyamap_default_config  = guyamap_smoke_extract_config( $guyamap_default_html );
guyamap_smoke_assert( abs( (float) $guyamap_default_config['center']['latitude'] - 53.918777 ) < 0.000000001, 'Saved version 1.x default latitude was lost.' );
guyamap_smoke_assert( '400px' === $guyamap_default_config['height'], 'Saved version 1.x default height was lost.' );
guyamap_smoke_assert( abs( (float) $guyamap_default_config['zoom'] - 10.0 ) < 0.000000001, 'Saved version 1.x default zoom was lost.' );

$guyamap_markers    = array_fill(
	0,
	1001,
	array(
		'coordinates' => array(
			'latitude'  => 0,
			'longitude' => 0,
		),
	)
);
$guyamap_normalizer = new GuYaMap\Support\Config_Normalizer();
$guyamap_limited    = $guyamap_normalizer->normalize( array( 'markers' => $guyamap_markers ) );
guyamap_smoke_assert( 1000 === count( $guyamap_limited['markers'] ), 'The hard inline marker ceiling is not 1,000.' );

$guyamap_config_filter = static function ( array $config ): array {
	$config['markers']                           = array_fill(
		0,
		1001,
		array(
			'coordinates' => array(
				'latitude'  => 0,
				'longitude' => 0,
			),
		)
	);
	$config['mapOptions']['totallyUnknownValue'] = true;

	return $config;
};
add_filter( 'guyamap_normalized_map_config', $guyamap_config_filter );
$guyamap_filtered_config = $guyamap_normalizer->normalize( array() );
remove_filter( 'guyamap_normalized_map_config', $guyamap_config_filter );
guyamap_smoke_assert( 1000 === count( $guyamap_filtered_config['markers'] ), 'A normalized-config filter bypassed the marker ceiling.' );
guyamap_smoke_assert( ! isset( $guyamap_filtered_config['mapOptions']['totallyUnknownValue'] ), 'A normalized-config filter bypassed the map-option allow-list.' );

$guyamap_marker_filter = static function ( array $marker ): array {
	$marker['title']       = str_repeat( 'x', 1000 );
	$marker['icon']['url'] = 'javascript:alert(1)';

	return $marker;
};
add_filter( 'guyamap_normalized_marker', $guyamap_marker_filter );
$guyamap_filtered_marker = $guyamap_normalizer->normalize(
	array(
		'markers' => array(
			array(
				'coordinates' => array(
					'latitude'  => 0,
					'longitude' => 0,
				),
			),
		),
	)
);
remove_filter( 'guyamap_normalized_marker', $guyamap_marker_filter );
guyamap_smoke_assert( 300 === strlen( $guyamap_filtered_marker['markers'][0]['title'] ), 'A marker filter bypassed the text-length ceiling.' );
guyamap_smoke_assert( '' === $guyamap_filtered_marker['markers'][0]['icon']['url'], 'A marker filter bypassed URL validation.' );

$guyamap_render_filter = static function ( array $config ) use ( $guyamap_markers ): array {
	$config['instanceId']                              = 'filter-controlled-instance';
	$config['markers']                                 = $guyamap_markers;
	$config['markers'][]                               = $guyamap_markers[0];
	$config['mapOptions']['totallyUnknownRenderValue'] = true;

	return $config;
};
add_filter( 'guyamap_map_render_config', $guyamap_render_filter );
$guyamap_filtered_render = guyamap_smoke_extract_config( guyamap_smoke_render( array() ) );
remove_filter( 'guyamap_map_render_config', $guyamap_render_filter );
guyamap_smoke_assert( 1000 === count( $guyamap_filtered_render['markers'] ), 'A render-config filter bypassed the marker ceiling.' );
guyamap_smoke_assert( 'filter-controlled-instance' !== $guyamap_filtered_render['instanceId'], 'A render-config filter replaced a server-owned instance ID.' );
guyamap_smoke_assert( ! isset( $guyamap_filtered_render['mapOptions']['totallyUnknownRenderValue'] ), 'A render-config filter bypassed the map-option allow-list.' );

$guyamap_large_marker_payload = array_fill(
	0,
	1000,
	array(
		'coordinates' => array(
			'latitude'  => 0,
			'longitude' => 0,
		),
		'description' => str_repeat( 'payload ', 625 ),
	)
);
$guyamap_large_html           = guyamap_smoke_render( array( 'markers' => $guyamap_large_marker_payload ) );
$guyamap_large_config         = guyamap_smoke_extract_config( $guyamap_large_html );
$guyamap_large_json           = guyamap_smoke_extract_json( $guyamap_large_html );
guyamap_smoke_assert( strlen( $guyamap_large_json ) <= GuYaMap\Support\Config_Normalizer::MAX_RENDER_CONFIG_BYTES, 'The rendered map exceeded its hard JSON byte budget.' );
guyamap_smoke_assert( count( $guyamap_large_config['markers'] ) < 1000, 'The byte budget did not trim an oversized marker tail.' );

$guyamap_behavior_filter = static function (): array {
	return array( 'drag', 'future-unknown-behavior' );
};
add_filter( 'guyamap_allowed_behaviors', $guyamap_behavior_filter );
$guyamap_limited_behaviors = $guyamap_normalizer->normalize(
	array( 'behaviors' => array( 'drag', 'future-unknown-behavior' ) )
);
remove_filter( 'guyamap_allowed_behaviors', $guyamap_behavior_filter );
guyamap_smoke_assert(
	array( 'drag' ) === $guyamap_limited_behaviors['behaviors'],
	'The server behavior allow-list diverges from the bundled runtime.'
);

guyamap_smoke_assert(
	method_exists( guyamap()->settings(), 'register_privacy_policy_content' ),
	'The WordPress privacy-policy integration is missing.'
);

if ( defined( 'WP_CLI' ) && WP_CLI ) {
	WP_CLI::success( 'Map Block for Yandex WordPress smoke test passed.' );
}
