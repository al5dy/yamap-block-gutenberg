<?php
/**
 * Plugin Name: Gutenberg Yandex Maps
 * Description: Yandex Maps For Gutenberg
 * Version: 1.0.1
 * Author: al5dy
 * Author URI: https://ziscod.com
 * License: GPLv3
 * License URI: https://www.gnu.org/licenses/gpl-3.0.html
 * Text Domain: guyamap
 * Domain Path: /languages/
 *
 * @package Gutenberg Yandex Maps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

/**
 * Main GuYaMap Class.
 *
 * @class GuYaMap
 */
final class GuYaMap {

	/**
	 * GuYaMap version.
	 *
	 * @var string
	 */
	public $version = '1.0.1';

	/**
	 * The single instance of the class.
	 *
	 * @var GuYaMap
	 * @since 1.0.0
	 */
	protected static $_instance = null;


	/**
	 * Main GuYaMap Instance.
	 * Ensures only one instance of GuYaMap is loaded or can be loaded.
	 *
	 * @since 1.0.0
	 * @static
	 * @see   \guyamap()
	 * @return GuYaMap - Main instance.
	 */
	public static function instance() {
		if ( null === self::$_instance ) {
			self::$_instance = new self();
		}

		return self::$_instance;
	}


	/**
	 * GuYaMap Constructor.
	 */
	public function __construct() {

		$description = __( 'Yandex Maps For Gutenberg', 'guyamap' ); // translate plugin description


		// Define GUYAMAP_PLUGIN_FILE.
		if ( ! defined( 'GUYAMAP_PLUGIN_FILE' ) ) {
			define( 'GUYAMAP_PLUGIN_FILE', __FILE__ );
		}

		// Main Constants
		if ( ! defined( 'GUYAMAP_ABSPATH' ) ) {
			define( 'GUYAMAP_ABSPATH', dirname( GUYAMAP_PLUGIN_FILE ) . '/' );
		}
		if ( ! defined( 'GUYAMAP_VERSION' ) ) {
			define( 'GUYAMAP_VERSION', $this->version );
		}
		if ( ! defined( 'GUYAMAP_PLUGIN_BASENAME' ) ) {
			define( 'GUYAMAP_PLUGIN_BASENAME', plugin_basename( GUYAMAP_PLUGIN_FILE ) );
		}

		add_action( 'init', array( $this, 'init' ), 0 );
		add_action( 'init', array( $this, 'editor_assets' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'load_assets' ) );
		add_filter( 'plugin_row_meta', array( $this, 'plugin_row_meta' ), 10, 2 );
	}


	/**
	 * Include Gutenberg Editor Assets
	 *
	 * @since 1.0.1
	 */
	public function editor_assets() {
		if ( ! function_exists( 'register_block_type' ) ) {
			// Gutenberg is not active.
			return;
		}


		wp_register_script(
			'guyamap-editor-script',
			$this->plugin_url() . '/assets/block-editor.build.js',
			array( 'wp-i18n', 'wp-blocks', 'wp-element', 'wp-components', 'wp-editor' ),
			filemtime( $this->plugin_path() . '/assets/block-editor.build.js' )
		);


		wp_register_style(
			'guyamap-editor-style',
			$this->plugin_url() . '/assets/block-editor.build.css',
			array( 'wp-edit-blocks' ),
			filemtime( $this->plugin_path() . '/assets/block-editor.build.css' )
		);


		register_block_type( 'gutenberg-yandex-block/map', array(
			'editor_script' => 'guyamap-editor-script',
			'editor_style'  => 'guyamap-editor-style'
		) );


		if(function_exists('wp_set_script_translations')) {
			/*
			 * Pass already loaded translations to our JavaScript.
			 *
			 * This happens _before_ our JavaScript runs, afterwards it's too late.
			 */
			wp_add_inline_script(
				'guyamap-editor-script',
				sprintf(
					'var guyamap_editor_script = { localeData: %s };',
					json_encode( wp_set_script_translations( 'guyamap-editor-script', 'guyamap', $this->plugin_path() . '/languages' ) )
				),
				'before'
			);
		} else {
			// Get All Translations @al5dy hack
			$locale_data = $this->get_jed_locale_data( 'guyamap' );
			wp_add_inline_script(
				'guyamap-editor-script',
				'(function( translations ){translations.locale_data.messages[""].domain = "guyamap";wp.i18n.setLocaleData( translations.locale_data.messages, "guyamap" );})({"domain": "messages","locale_data": {"messages": ' . json_encode( $locale_data ) . '}});',
				'before'
			);

		}

	}

	public function get_jed_locale_data( $domain ) {
		$translations = get_translations_for_domain( $domain );

		$locale = array(
			'' => array(
				'domain' => $domain,
				'lang'   => is_admin() ? get_user_locale() : get_locale(),
			),
		);

		if ( ! empty( $translations->headers['Plural-Forms'] ) ) {
			$locale['']['plural_forms'] = $translations->headers['Plural-Forms'];
		}

		foreach ( $translations->entries as $msgid => $entry ) {
			$locale[ $msgid ] = $entry->translations;
		}

		return $locale;
	}

	/**
	 * Init GuYaMap when WordPress Initialises.
	 */
	public function init() {
		// Set up localisation.
		$this->load_plugin_textdomain();
	}


	/**
	 * Load Front Assets
	 */
	public function load_assets() {

		$locales = apply_filters( 'guyamap_locales', array( 'ru_RU', 'en_US', 'en_RU', 'ru_UA', 'uk_UA', 'tr_TR' ) );
		$locate  = in_array( get_locale(), $locales, true ) ? get_locale() : 'en_US';

		wp_register_script( 'gutenberg-yamap-api', 'https://api-maps.yandex.ru/2.1/?lang=' . $locate, null, '2.1', false );
		wp_enqueue_script( 'gutenberg-yamap-api' );

		wp_register_script( 'gutenberg-yamap-front', $this->plugin_url() . '/assets/block-front.build.js', array( 'gutenberg-yamap-api' ), GUYAMAP_VERSION, true );
		wp_enqueue_script( 'gutenberg-yamap-front' );
	}


	/**
	 * Get the plugin path.
	 *
	 * @return string
	 */
	public function plugin_path() {
		return untrailingslashit( plugin_dir_path( GUYAMAP_PLUGIN_FILE ) );
	}


	/**
	 * Get the plugin url.
	 *
	 * @return string
	 */
	public function plugin_url() {
		return untrailingslashit( plugins_url( '/', GUYAMAP_PLUGIN_FILE ) );
	}

	/**
	 * Load Localisation files.
	 * Note: the first-loaded translation file overrides any following ones if the same translation is present.
	 * Locales found in:
	 *      - WP_LANG_DIR/guyamap/guyamap-LOCALE.mo
	 *      - WP_LANG_DIR/plugins/guyamap-LOCALE.mo
	 */
	public function load_plugin_textdomain() {
		$locale = is_admin() && function_exists( 'get_user_locale' ) ? get_user_locale() : get_locale();
		$locale = apply_filters( 'plugin_locale', $locale, 'guyamap' );

		unload_textdomain( 'guyamap' );
		load_textdomain( 'guyamap', WP_LANG_DIR . '/guyamap/guyamap-' . $locale . '.mo' );
		load_plugin_textdomain( 'guyamap', false, plugin_basename( dirname( GUYAMAP_PLUGIN_FILE ) ) . '/languages' );


	}


	/**
	 * Show row meta on the plugin screen.
	 *
	 * @param $links
	 * @param $file
	 *
	 * @return array
	 */
	public function plugin_row_meta( $links, $file ) {

		if ( GUYAMAP_PLUGIN_BASENAME === $file ) {
			$row_meta = array(
				'donate' => '<a href="' . esc_url( 'https://money.yandex.ru/to/410012328678499' ) . '" target="_blank" title="' . esc_attr__( 'Send money to me', 'guyamap' ) . '"><strong style="color:red;">' . esc_html__( 'Donate', 'guyamap' ) . '</strong></a>'
			);

			return array_merge( $links, $row_meta );
		}

		return (array) $links;
	}

}


/**
 * Main instance of GuYaMap.
 * Returns the main instance of GuYaMap to prevent the need to use globals.
 *
 * @since  1.0.0
 * @return GuYaMap
 */
if ( ! function_exists( 'guyamap' ) ) {
	function guyamap() {
		return GuYaMap::instance();
	}

	// Global for backwards compatibility.
	$GLOBALS['guyamap'] = guyamap();
}

