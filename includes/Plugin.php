<?php
/**
 * Main plugin coordinator.
 *
 * @package GuYaMap
 */

namespace GuYaMap;

use GuYaMap\Admin\Settings;
use GuYaMap\Block\Map_Block;
use GuYaMap\Contracts\Feature_Provider_Interface;
use GuYaMap\Support\Config_Normalizer;

defined( 'ABSPATH' ) || exit;

/**
 * Coordinates the plugin's independently testable services.
 */
final class Plugin {

	/**
	 * Public version kept for compatibility with the original plugin API.
	 *
	 * @var string
	 */
	public $version = GUYAMAP_VERSION;

	/**
	 * Singleton instance.
	 *
	 * @var Plugin|null
	 */
	private static $instance = null;

	/**
	 * Whether WordPress hooks were registered.
	 *
	 * @var bool
	 */
	private $booted = false;

	/**
	 * Whether feature providers were initialized.
	 *
	 * @var bool
	 */
	private $providers_initialized = false;

	/**
	 * Registered feature providers, keyed by provider ID.
	 *
	 * @var array<string, Feature_Provider_Interface>
	 */
	private $feature_providers = array();

	/**
	 * Settings service.
	 *
	 * @var Settings
	 */
	private $settings;

	/**
	 * Map block service.
	 *
	 * @var Map_Block
	 */
	private $map_block;

	/**
	 * Returns the plugin singleton.
	 *
	 * @return Plugin
	 */
	public static function instance(): Plugin {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * Creates the core services.
	 */
	public function __construct() {
		$this->settings  = new Settings();
		$this->map_block = new Map_Block( $this->settings, new Config_Normalizer() );
	}

	/**
	 * Prevents cloning the singleton.
	 *
	 * @return void
	 */
	private function __clone() {}

	/**
	 * Registers WordPress hooks exactly once.
	 *
	 * @return void
	 */
	public function boot(): void {
		if ( $this->booted ) {
			return;
		}

		$this->booted = true;

		add_action( 'init', array( $this, 'load_textdomain' ), 0 );
		add_action( 'init', array( $this->map_block, 'register' ), 10 );
		add_action( 'plugins_loaded', array( $this, 'initialize_feature_providers' ), 20 );
		add_action( 'admin_init', array( $this->settings, 'register_privacy_policy_content' ), 20 );

		$this->settings->register_hooks();

		add_filter(
			'plugin_action_links_' . GUYAMAP_PLUGIN_BASENAME,
			array( $this, 'add_plugin_action_links' )
		);
	}

	/**
	 * Loads bundled translations for non-WordPress.org installations.
	 *
	 * WordPress.org language packs continue to take precedence through core's
	 * just-in-time translation loading.
	 *
	 * @return void
	 */
	public function load_textdomain(): void {
		load_plugin_textdomain(
			'yamap-block-gutenberg',
			false,
			dirname( GUYAMAP_PLUGIN_BASENAME ) . '/languages'
		);
	}

	/**
	 * Adds a feature provider.
	 *
	 * Providers registered after the provider initialization phase are started
	 * immediately, which supports add-ons loaded after this plugin.
	 *
	 * @param Feature_Provider_Interface $provider Provider instance.
	 * @return bool True when registered, false for a duplicate identifier.
	 */
	public function register_feature_provider( Feature_Provider_Interface $provider ): bool {
		$provider_id = sanitize_key( $provider->get_id() );

		if ( '' === $provider_id || isset( $this->feature_providers[ $provider_id ] ) ) {
			return false;
		}

		$this->feature_providers[ $provider_id ] = $provider;

		if ( $this->providers_initialized ) {
			$provider->register();
			$this->do_provider_registered_action( $provider );
		}

		return true;
	}

	/**
	 * Initializes providers registered by free or premium extensions.
	 *
	 * @return void
	 */
	public function initialize_feature_providers(): void {
		if ( $this->providers_initialized ) {
			return;
		}

		/**
		 * Filters optional plugin feature providers.
		 *
		 * @since 2.0.0
		 *
		 * @param Feature_Provider_Interface[] $providers Feature providers.
		 * @param Plugin                       $plugin    Main plugin instance.
		 */
		$providers = apply_filters(
			'guyamap_feature_providers',
			array_values( $this->feature_providers ),
			$this
		);

		$this->feature_providers = array();

		if ( is_array( $providers ) ) {
			foreach ( $providers as $provider ) {
				if ( $provider instanceof Feature_Provider_Interface ) {
					$this->register_feature_provider( $provider );
				}
			}
		}

		$this->providers_initialized = true;

		foreach ( $this->feature_providers as $provider ) {
			$provider->register();
			$this->do_provider_registered_action( $provider );
		}

		/**
		 * Fires after all known feature providers have registered.
		 *
		 * @since 2.0.0
		 *
		 * @param Plugin $plugin Main plugin instance.
		 */
		do_action( 'guyamap_feature_providers_registered', $this );
	}

	/**
	 * Returns the settings service for extensions.
	 *
	 * @return Settings
	 */
	public function settings(): Settings {
		return $this->settings;
	}

	/**
	 * Returns the absolute plugin directory without a trailing slash.
	 *
	 * Retained for compatibility with the original public plugin API.
	 *
	 * @return string
	 */
	public function plugin_path(): string {
		return untrailingslashit( GUYAMAP_PLUGIN_PATH );
	}

	/**
	 * Returns the plugin URL without a trailing slash.
	 *
	 * Retained for compatibility with the original public plugin API.
	 *
	 * @return string
	 */
	public function plugin_url(): string {
		return untrailingslashit( GUYAMAP_PLUGIN_URL );
	}

	/**
	 * Legacy init entry point retained for integrations written for 1.x.
	 *
	 * @deprecated 2.0.0 WordPress invokes the registered init hooks directly.
	 * @return void
	 */
	public function init(): void {
		$this->load_textdomain();
	}

	/**
	 * Legacy text-domain loader alias.
	 *
	 * @deprecated 2.0.0 Use load_textdomain().
	 * @return void
	 */
	public function load_plugin_textdomain(): void {
		$this->load_textdomain();
	}

	/**
	 * Legacy editor registration entry point.
	 *
	 * @deprecated 2.0.0 Block metadata is registered on init.
	 * @return void
	 */
	public function editor_assets(): void {
		$registry = \WP_Block_Type_Registry::get_instance();
		if ( ! $registry->is_registered( 'gutenberg-yandex-block/map' ) ) {
			$this->map_block->register();
		}
	}

	/**
	 * Legacy frontend enqueue entry point.
	 *
	 * The old implementation enqueued Yandex Maps on every page. Version 2 uses
	 * metadata view assets, so keeping this method as a no-op preserves calls
	 * without reintroducing the global performance regression.
	 *
	 * @deprecated 2.0.0 Frontend assets are block-scoped.
	 * @return void
	 */
	public function load_assets(): void {}

	/**
	 * Returns Jed-compatible locale data for legacy integrations.
	 *
	 * @deprecated 2.0.0 Use wp_set_script_translations().
	 * @param string $domain Text domain.
	 * @return array<string, mixed>
	 */
	public function get_jed_locale_data( string $domain ): array {
		$translations = get_translations_for_domain( $domain );
		$locale       = array(
			'' => array(
				'domain' => $domain,
				'lang'   => is_admin() ? get_user_locale() : get_locale(),
			),
		);

		if ( ! empty( $translations->headers['Plural-Forms'] ) ) {
			$locale['']['plural_forms'] = $translations->headers['Plural-Forms'];
		}

		foreach ( $translations->entries as $message_id => $entry ) {
			$locale[ $message_id ] = $entry->translations;
		}

		return $locale;
	}

	/**
	 * Legacy plugin-row-meta filter retained without the obsolete donation URL.
	 *
	 * @deprecated 2.0.0 Use plugin action links.
	 * @param string[] $links Existing row links.
	 * @param string   $file  Plugin basename.
	 * @return string[]
	 */
	public function plugin_row_meta( array $links, string $file ): array {
		unset( $file );

		return $links;
	}

	/**
	 * Adds a Settings link to the Plugins screen.
	 *
	 * @param string[] $links Existing plugin action links.
	 * @return string[]
	 */
	public function add_plugin_action_links( array $links ): array {
		$settings_link = sprintf(
			'<a href="%1$s">%2$s</a>',
			esc_url( $this->settings->get_page_url() ),
			esc_html__( 'Settings', 'yamap-block-gutenberg' )
		);

		array_unshift( $links, $settings_link );

		return $links;
	}

	/**
	 * Fires the provider registration action with a documented signature.
	 *
	 * @param Feature_Provider_Interface $provider Registered provider.
	 * @return void
	 */
	private function do_provider_registered_action( Feature_Provider_Interface $provider ): void {
		/**
		 * Fires after an individual feature provider has registered.
		 *
		 * @since 2.0.0
		 *
		 * @param Feature_Provider_Interface $provider Registered provider.
		 * @param Plugin                     $plugin   Main plugin instance.
		 */
		do_action( 'guyamap_feature_provider_registered', $provider, $this );
	}
}
