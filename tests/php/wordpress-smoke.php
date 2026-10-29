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
guyamap_smoke_assert( false !== strpos( $guyamap_first_html, '<guyamap-map-view ' ), 'The rendered Shadow DOM map Web Component is missing.' );
guyamap_smoke_assert( false !== strpos( (string) $guyamap_first_config['styleUrl'], 'build/style-index.css' ), 'The Shadow DOM stylesheet URL is missing.' );
guyamap_smoke_assert( false === strpos( $guyamap_first_html, 'class="guyamap-map__fallback"' ), 'The JavaScript frontend still renders the old fallback overlay.' );
guyamap_smoke_assert( false !== strpos( $guyamap_first_html, '<noscript><a class="guyamap-map__noscript-fallback"' ), 'The no-JavaScript fallback link is missing.' );

$guyamap_preloader_html   = guyamap_smoke_render(
	array(
		'loading' => array(
			'lazy'      => false,
			'preloader' => array(
				'enabled'            => true,
				'type'               => 'not-allowed',
				'color'              => 'url(https://example.com/tracker)',
				'backgroundColor'    => '#ABCDEF',
				'size'               => 500,
				'transitionDuration' => -100,
				'label'              => '<strong>Loading safely</strong>',
			),
		),
	)
);
$guyamap_preloader_config = guyamap_smoke_extract_config( $guyamap_preloader_html );
guyamap_smoke_assert( true === $guyamap_preloader_config['loading']['preloader']['enabled'], 'The preloader enabled flag was lost.' );
guyamap_smoke_assert( 'spinner' === $guyamap_preloader_config['loading']['preloader']['type'], 'An unknown preloader type crossed the allow-list.' );
guyamap_smoke_assert( '#3858e9' === $guyamap_preloader_config['loading']['preloader']['color'], 'An unsafe preloader color crossed the server boundary.' );
guyamap_smoke_assert( '#abcdef' === $guyamap_preloader_config['loading']['preloader']['backgroundColor'], 'The preloader background was not normalized.' );
guyamap_smoke_assert( 96 === $guyamap_preloader_config['loading']['preloader']['size'], 'The preloader size was not bounded.' );
guyamap_smoke_assert( 0 === $guyamap_preloader_config['loading']['preloader']['transitionDuration'], 'The preloader transition was not bounded.' );
guyamap_smoke_assert( 'Loading safely' === $guyamap_preloader_config['loading']['preloader']['label'], 'The preloader label was not converted to safe text.' );
guyamap_smoke_assert( false !== strpos( $guyamap_preloader_html, 'data-guyamap-preloader="spinner"' ), 'The selected preloader is missing from frontend markup.' );

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

// The Yandex API throws "Invalid zoom range, min >= max" for an empty interval.
$guyamap_equal_zoom = $guyamap_normalizer->normalize(
	array(
		'zoom'      => 8,
		'zoomRange' => array(
			'min' => 8,
			'max' => 8,
		),
	)
);
guyamap_smoke_assert(
	8.0 === $guyamap_equal_zoom['zoomRange']['min'] && 9.0 === $guyamap_equal_zoom['zoomRange']['max'],
	'An empty zoom interval was not widened.'
);
$guyamap_top_zoom = $guyamap_normalizer->normalize(
	array(
		'zoomRange' => array(
			'min' => 99,
			'max' => 99,
		),
	)
);
guyamap_smoke_assert(
	22.0 === $guyamap_top_zoom['zoomRange']['min'] && 23.0 === $guyamap_top_zoom['zoomRange']['max'],
	'An empty zoom interval at the upper bound was not widened downwards.'
);
$guyamap_swapped_zoom = $guyamap_normalizer->normalize(
	array(
		'zoomRange' => array(
			'min' => 15,
			'max' => 4,
		),
	)
);
guyamap_smoke_assert(
	4.0 === $guyamap_swapped_zoom['zoomRange']['min'] && 15.0 === $guyamap_swapped_zoom['zoomRange']['max'],
	'A reversed zoom interval was not reordered.'
);

// A percentage width is exposed as a unitless share for the stylesheet.
$guyamap_half_html = guyamap_smoke_render( array( 'width' => '50%' ) );
guyamap_smoke_assert(
	false !== strpos( $guyamap_half_html, 'data-guyamap-width-ratio="0.5"' ) &&
	false !== strpos( $guyamap_half_html, '--guyamap-width-ratio:0.5' ),
	'A percentage width did not expose its ratio.'
);
guyamap_smoke_assert(
	false === strpos( guyamap_smoke_render( array( 'width' => '520px' ) ), 'guyamap-width-ratio' ),
	'A fixed width exposed a percentage ratio.'
);

// Only bundled preset icons reach the frontend, so a typo cannot cause a 404.
$guyamap_icon_markers = array();
foreach ( array( 'airport', 'does_not_exist_zz', '../../wp-config', 'AIRPORT', '' ) as $guyamap_icon_name ) {
	$guyamap_icon_markers[] = array(
		'coordinates' => array(
			'latitude'  => 1,
			'longitude' => 1,
		),
		'icon'        => array( 'name' => $guyamap_icon_name ),
	);
}
$guyamap_icon_config = $guyamap_normalizer->normalize( array( 'markers' => $guyamap_icon_markers ) );
guyamap_smoke_assert(
	array( 'airport', 'fallback', 'fallback', 'fallback', 'fallback' ) === array_column( array_column( $guyamap_icon_config['markers'], 'icon' ), 'name' ),
	'An icon name without a bundled file crossed the server boundary.'
);
guyamap_smoke_assert(
	is_readable( GUYAMAP_PLUGIN_PATH . 'assets/icons/fallback_24.svg' ),
	'The fallback marker icon is missing from the bundle.'
);

// Markers are not draggable. Options saved by earlier 2.0 builds are ignored.
$guyamap_dragged_marker = $guyamap_normalizer->normalize(
	array(
		'markers' => array(
			array(
				'coordinates'         => array(
					'latitude'  => 1,
					'longitude' => 1,
				),
				'draggable'           => true,
				'mapFollowsOnDrag'    => true,
				'hideOutsideViewport' => false,
			),
		),
	)
)['markers'][0];
guyamap_smoke_assert(
	! array_key_exists( 'draggable', $guyamap_dragged_marker ) &&
	! array_key_exists( 'mapFollowsOnDrag', $guyamap_dragged_marker ) &&
	false === $guyamap_dragged_marker['hideOutsideViewport'],
	'A marker drag option crossed the server boundary.'
);

// Customization rules follow the schema documented by Yandex. The same cases
// run against the browser normalizer in tests/js/customization.test.js.
$guyamap_customization_cases = wp_json_file_decode(
	GUYAMAP_PLUGIN_PATH . 'tests/fixtures/customization.json',
	array( 'associative' => true )
);
guyamap_smoke_assert(
	is_array( $guyamap_customization_cases ) && count( $guyamap_customization_cases ) > 5,
	'The shared customization cases could not be read.'
);
foreach ( $guyamap_customization_cases as $guyamap_customization_case ) {
	$guyamap_customization = $guyamap_normalizer->normalize(
		array( 'customization' => $guyamap_customization_case['input'] )
	)['customization'];
	guyamap_smoke_assert(
		wp_json_encode( $guyamap_customization_case['expected'] ) === wp_json_encode( $guyamap_customization ),
		sprintf(
			'Customization case "%1$s" differs from the browser normalizer: %2$s',
			$guyamap_customization_case['name'],
			wp_json_encode( $guyamap_customization )
		)
	);
}

// An oversized style is cut at a rule boundary; it never yields null rules,
// which the Yandex vector worker dereferences without a check.
$guyamap_style_rule = array(
	'tags'    => array( 'any' => array() ),
	'stylers' => array( array( 'color' => '#00ff00' ) ),
);
for ( $guyamap_index = 0; $guyamap_index < 64; $guyamap_index++ ) {
	$guyamap_style_rule['tags']['any'][] = 'tag_' . $guyamap_index;
}
$guyamap_large_style = $guyamap_normalizer->normalize(
	array( 'customization' => array_fill( 0, 300, $guyamap_style_rule ) )
)['customization'];
guyamap_smoke_assert(
	63 === count( $guyamap_large_style ) && end( $guyamap_large_style ) === $guyamap_style_rule,
	'An oversized customization was not cut at a rule boundary.'
);
$guyamap_many_rules = $guyamap_normalizer->normalize(
	array( 'customization' => array_fill( 0, 300, array( 'stylers' => array( 'opacity' => 0.5 ) ) ) )
)['customization'];
guyamap_smoke_assert( 256 === count( $guyamap_many_rules ), 'The customization rule limit was not applied.' );
$guyamap_hostile_style = guyamap_smoke_extract_config(
	guyamap_smoke_render(
		array(
			'customization' => array(
				null,
				array( 'stylers' => null ),
				array( 'stylers' => array( null ) ),
				array(
					'tags'    => array( 'all' => array( 'water', null ) ),
					'stylers' => array( array( 'color' => '#ff0000' ) ),
				),
				array(
					'tags'    => 'water',
					'stylers' => array(
						array(
							'color'   => '<script>alert(1)</script>',
							'opacity' => 0.5,
						),
					),
				),
			),
		)
	)
);
guyamap_smoke_assert(
	array(
		array(
			'tags'    => 'water',
			'stylers' => array( array( 'opacity' => 0.5 ) ),
		),
	) === $guyamap_hostile_style['customization'],
	'A hostile customization crossed the render boundary.'
);

// Failure causes are only sent to people who can fix the map.
$guyamap_previous_user = get_current_user_id();
wp_set_current_user( 0 );
$guyamap_visitor_json = guyamap_smoke_extract_json( guyamap_smoke_render( array() ) );
guyamap_smoke_assert(
	false === strpos( $guyamap_visitor_json, 'diagnostics' ) &&
	false === strpos( $guyamap_visitor_json, 'errorDetails' ) &&
	false === strpos( $guyamap_visitor_json, 'settingsUrl' ) &&
	false === strpos( $guyamap_visitor_json, 'wp-admin' ),
	'Administrator diagnostics leaked into visitor output.'
);

$guyamap_admins = get_users(
	array(
		'role'   => 'administrator',
		'number' => 1,
		'fields' => 'ID',
	)
);
if ( ! empty( $guyamap_admins ) ) {
	wp_set_current_user( (int) $guyamap_admins[0] );
	$guyamap_admin_config = guyamap_smoke_extract_config( guyamap_smoke_render( array() ) );
	$guyamap_site_host    = (string) wp_parse_url( home_url( '/' ), PHP_URL_HOST );
	guyamap_smoke_assert( true === ( $guyamap_admin_config['diagnostics'] ?? false ), 'Administrators do not receive failure diagnostics.' );
	guyamap_smoke_assert(
		false !== strpos( (string) ( $guyamap_admin_config['settingsUrl'] ?? '' ), 'page=guyamap' ),
		'The diagnostics do not link to the settings screen.'
	);
	guyamap_smoke_assert(
		false !== strpos( (string) ( $guyamap_admin_config['i18n']['errorDetails']['api_key_rejected'] ?? '' ), $guyamap_site_host ),
		'The rejected-key explanation does not name the site host.'
	);
	foreach ( array( 'missing_api_key', 'network', 'csp', 'timeout', 'api_unavailable', 'load_failed', 'render' ) as $guyamap_error_code ) {
		guyamap_smoke_assert(
			'' !== (string) ( $guyamap_admin_config['i18n']['errorDetails'][ $guyamap_error_code ] ?? '' ),
			'A runtime error code has no administrator explanation.'
		);
	}
}
wp_set_current_user( $guyamap_previous_user );

// The API key check reports the real Yandex verdict without leaving the fixed origin.
$guyamap_http_request = array();
$guyamap_http_reply   = array();
$guyamap_http_filter  = static function ( $preempt, $parsed_args, $url ) use ( &$guyamap_http_request, &$guyamap_http_reply ) {
	unset( $preempt );
	$guyamap_http_request = array(
		'url'  => $url,
		'args' => $parsed_args,
	);

	return $guyamap_http_reply;
};
$guyamap_key_filter   = static function (): string {
	return 'smoke-test-key';
};
add_filter( 'pre_http_request', $guyamap_http_filter, 10, 3 );
add_filter( 'guyamap_yandex_api_key', $guyamap_key_filter );

$guyamap_http_reply = array(
	'response' => array(
		'code'    => 403,
		'message' => 'Forbidden',
	),
	'headers'  => array(),
	'body'     => '{"statusCode":403,"error":"Forbidden","message":"Invalid api key <script>"}',
);
$guyamap_check      = guyamap()->settings()->check_api_key();
guyamap_smoke_assert( 'rejected' === $guyamap_check['status'] && 403 === $guyamap_check['code'], 'A refused key was not reported as rejected.' );
guyamap_smoke_assert( 'Invalid api key' === $guyamap_check['message'], 'The remote rejection message was not reduced to safe text.' );
guyamap_smoke_assert( 0 === strpos( (string) $guyamap_http_request['url'], 'https://api-maps.yandex.ru/v3/?' ), 'The key check left the fixed Yandex origin.' );
guyamap_smoke_assert( false !== strpos( (string) $guyamap_http_request['url'], 'apikey=smoke-test-key' ), 'The key check did not send the configured key.' );
guyamap_smoke_assert( home_url( '/' ) === ( $guyamap_http_request['args']['headers']['Referer'] ?? '' ), 'The key check did not present the site as HTTP Referer.' );
guyamap_smoke_assert( 0 === (int) $guyamap_http_request['args']['redirection'], 'The key check follows redirects.' );
guyamap_smoke_assert( (int) $guyamap_http_request['args']['limit_response_size'] <= 4096, 'The key check reads an unbounded response.' );

$guyamap_http_reply['response']['code'] = 200;
$guyamap_http_reply['body']             = '(()=>{})();';
guyamap_smoke_assert( 'accepted' === guyamap()->settings()->check_api_key()['status'], 'An accepted key was not reported as accepted.' );

$guyamap_http_reply['response']['code'] = 429;
$guyamap_http_reply['body']             = 'limited';
guyamap_smoke_assert( 'limited' === guyamap()->settings()->check_api_key()['status'], 'Rate limiting was not reported separately from a rejected key.' );

$guyamap_http_reply['response']['code'] = 502;
guyamap_smoke_assert( 'unexpected' === guyamap()->settings()->check_api_key()['status'], 'An upstream failure was reported as a key verdict.' );

$guyamap_http_reply = new WP_Error( 'http_request_failed', 'cURL error 28: timed out' );
$guyamap_check      = guyamap()->settings()->check_api_key();
guyamap_smoke_assert( 'unreachable' === $guyamap_check['status'] && 0 === $guyamap_check['code'], 'A connection failure was not reported as unreachable.' );

remove_filter( 'guyamap_yandex_api_key', $guyamap_key_filter );
$guyamap_empty_key_filter = static function (): string {
	return '';
};
add_filter( 'guyamap_yandex_api_key', $guyamap_empty_key_filter );
$guyamap_http_request = array();
guyamap_smoke_assert( 'missing' === guyamap()->settings()->check_api_key()['status'], 'A missing key was not reported.' );
guyamap_smoke_assert( array() === $guyamap_http_request, 'A missing key still triggered a remote request.' );
remove_filter( 'guyamap_yandex_api_key', $guyamap_empty_key_filter );
remove_filter( 'pre_http_request', $guyamap_http_filter, 10 );

if ( defined( 'WP_CLI' ) && WP_CLI ) {
	WP_CLI::success( 'Yandex Maps for Gutenberg WordPress smoke test passed.' );
}
