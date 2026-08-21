<?php
/**
 * Plugin Name:       Map Block for Yandex
 * Plugin URI:        https://github.com/al5dy/yamap-block-gutenberg
 * Description:       A fast, accessible, and extensible Yandex Maps block for the WordPress block editor.
 * Version:           2.0.0
 * Requires at least: 6.6
 * Requires PHP:      7.4
 * Author:            al5dy
 * Author URI:        https://lokotkov.ru
 * License:           GPL-3.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-3.0.html
 * Text Domain:       yamap-block-gutenberg
 * Domain Path:       /languages
 *
 * @package GuYaMap
 */

defined( 'ABSPATH' ) || exit;

if ( version_compare( PHP_VERSION, '7.4', '<' ) ) {
	add_action(
		'admin_notices',
		static function () {
			?>
			<div class="notice notice-error">
				<p><?php esc_html_e( 'Map Block for Yandex requires PHP 7.4 or newer.', 'yamap-block-gutenberg' ); ?></p>
			</div>
			<?php
		}
	);

	return;
}

if ( isset( $GLOBALS['wp_version'] ) && version_compare( $GLOBALS['wp_version'], '6.6', '<' ) ) {
	add_action(
		'admin_notices',
		static function () {
			?>
			<div class="notice notice-error">
				<p><?php esc_html_e( 'Map Block for Yandex requires WordPress 6.6 or newer.', 'yamap-block-gutenberg' ); ?></p>
			</div>
			<?php
		}
	);

	return;
}

defined( 'GUYAMAP_VERSION' ) || define( 'GUYAMAP_VERSION', '2.0.0' );
defined( 'GUYAMAP_BOOTSTRAP_CONTRACT_VERSION' ) || define( 'GUYAMAP_BOOTSTRAP_CONTRACT_VERSION', '1.0.0' );
defined( 'GUYAMAP_PLUGIN_FILE' ) || define( 'GUYAMAP_PLUGIN_FILE', __FILE__ );
defined( 'GUYAMAP_PLUGIN_PATH' ) || define( 'GUYAMAP_PLUGIN_PATH', plugin_dir_path( __FILE__ ) );
defined( 'GUYAMAP_PLUGIN_URL' ) || define( 'GUYAMAP_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
defined( 'GUYAMAP_PLUGIN_BASENAME' ) || define( 'GUYAMAP_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );
defined( 'GUYAMAP_ABSPATH' ) || define( 'GUYAMAP_ABSPATH', GUYAMAP_PLUGIN_PATH );

$guyamap_internal_path = plugin_dir_path( __FILE__ );
require_once $guyamap_internal_path . 'includes/Contracts/Feature_Provider_Interface.php';
require_once $guyamap_internal_path . 'includes/Support/Config_Normalizer.php';
require_once $guyamap_internal_path . 'includes/Admin/Settings.php';
require_once $guyamap_internal_path . 'includes/Block/Map_Block.php';
require_once $guyamap_internal_path . 'includes/Plugin.php';
unset( $guyamap_internal_path );

if ( ! class_exists( 'GuYaMap', false ) ) {
	class_alias( \GuYaMap\Plugin::class, 'GuYaMap' );
}

if ( ! function_exists( 'guyamap' ) ) {
	/**
	 * Returns the main plugin instance.
	 *
	 * @since 1.0.0
	 *
	 * @return \GuYaMap\Plugin
	 */
	function guyamap() {
		return \GuYaMap\Plugin::instance();
	}
}

$GLOBALS['guyamap'] = guyamap();
$GLOBALS['guyamap']->boot();
