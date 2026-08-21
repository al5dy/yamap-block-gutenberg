<?php
/**
 * Removes plugin-owned settings after an explicit uninstall.
 *
 * Define GUYAMAP_PRESERVE_DATA as true in wp-config.php before uninstalling
 * to retain the settings for a later installation.
 *
 * @package GuYaMap
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

if ( defined( 'GUYAMAP_PRESERVE_DATA' ) && GUYAMAP_PRESERVE_DATA ) {
	return;
}

if ( ! is_multisite() ) {
	delete_option( 'guyamap_settings' );
	return;
}

$guyamap_offset = 0;

do {
	$guyamap_site_ids   = get_sites(
		array(
			'fields'  => 'ids',
			'number'  => 100,
			'offset'  => $guyamap_offset,
			'orderby' => 'id',
			'order'   => 'ASC',
		)
	);
	$guyamap_site_count = count( $guyamap_site_ids );

	foreach ( $guyamap_site_ids as $guyamap_site_id ) {
		switch_to_blog( (int) $guyamap_site_id );
		delete_option( 'guyamap_settings' );
		restore_current_blog();
	}

	$guyamap_offset += $guyamap_site_count;
} while ( 100 === $guyamap_site_count );
