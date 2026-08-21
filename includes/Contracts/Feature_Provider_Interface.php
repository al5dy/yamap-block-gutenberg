<?php
/**
 * Contract for optional free and premium feature providers.
 *
 * @package GuYaMap
 */

namespace GuYaMap\Contracts;

defined( 'ABSPATH' ) || exit;

/**
 * Defines an independently bootable plugin feature.
 *
 * Providers are registered after all plugins have loaded. A premium add-on can
 * therefore add features without coupling the free plugin to premium classes.
 */
interface Feature_Provider_Interface {

	/**
	 * Returns a stable, plugin-unique provider identifier.
	 *
	 * @return string
	 */
	public function get_id(): string;

	/**
	 * Registers the provider's hooks and services.
	 *
	 * @return void
	 */
	public function register(): void;
}
