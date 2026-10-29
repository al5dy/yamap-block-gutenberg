<?php
/**
 * Plugin settings.
 *
 * @package GuYaMap
 */

namespace GuYaMap\Admin;

defined( 'ABSPATH' ) || exit;

/**
 * Registers and exposes the global Yandex Maps settings.
 */
final class Settings {

	/**
	 * Database option name.
	 *
	 * @var string
	 */
	public const OPTION_NAME = 'guyamap_settings';

	/**
	 * Settings page and group slug.
	 *
	 * @var string
	 */
	public const PAGE_SLUG = 'guyamap';

	/**
	 * Nonce action for the on-demand API key check.
	 *
	 * @var string
	 */
	private const CHECK_ACTION = 'guyamap_check_api_key';

	/**
	 * Fixed origin of the Yandex Maps JavaScript API loader.
	 *
	 * @var string
	 */
	private const API_ENDPOINT = 'https://api-maps.yandex.ru/v3/';

	/**
	 * Registers admin hooks.
	 *
	 * @return void
	 */
	public function register_hooks(): void {
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_menu', array( $this, 'register_page' ) );
	}

	/**
	 * Registers the option, section, and fields through the Settings API.
	 *
	 * @return void
	 */
	public function register_settings(): void {
		register_setting(
			self::PAGE_SLUG,
			self::OPTION_NAME,
			array(
				'type'              => 'object',
				'description'       => __( 'Global settings for Yandex Maps for Gutenberg.', 'yamap-block-gutenberg' ),
				'sanitize_callback' => array( $this, 'sanitize' ),
				'default'           => $this->get_defaults(),
				'show_in_rest'      => false,
			)
		);

		add_settings_section(
			'guyamap_yandex_api',
			__( 'Yandex Maps API', 'yamap-block-gutenberg' ),
			array( $this, 'render_section' ),
			self::PAGE_SLUG
		);

		add_settings_field(
			'api_key',
			__( 'API key', 'yamap-block-gutenberg' ),
			array( $this, 'render_api_key_field' ),
			self::PAGE_SLUG,
			'guyamap_yandex_api',
			array(
				'label_for' => 'guyamap-api-key',
			)
		);

		add_settings_field(
			'language',
			__( 'Map language', 'yamap-block-gutenberg' ),
			array( $this, 'render_language_field' ),
			self::PAGE_SLUG,
			'guyamap_yandex_api',
			array(
				'label_for' => 'guyamap-language',
			)
		);
	}

	/**
	 * Registers the settings screen under Settings.
	 *
	 * @return void
	 */
	public function register_page(): void {
		add_options_page(
			__( 'Yandex Maps', 'yamap-block-gutenberg' ),
			__( 'Yandex Maps', 'yamap-block-gutenberg' ),
			'manage_options',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	/**
	 * Adds suggested Yandex Maps text to the WordPress privacy policy guide.
	 *
	 * @return void
	 */
	public function register_privacy_policy_content(): void {
		if ( ! function_exists( 'wp_add_privacy_policy_content' ) ) {
			return;
		}

		$terms_link   = sprintf(
			'<a href="%1$s" target="_blank" rel="noopener noreferrer external">%2$s</a>',
			esc_url( 'https://yandex.com/dev/commercial/doc/en/' ),
			esc_html__( 'Yandex Maps API Terms', 'yamap-block-gutenberg' )
		);
		$privacy_link = sprintf(
			'<a href="%1$s" target="_blank" rel="noopener noreferrer external">%2$s</a>',
			esc_url( 'https://yandex.com/legal/confidential/en/' ),
			esc_html__( 'Yandex Privacy Policy', 'yamap-block-gutenberg' )
		);

		$content  = sprintf(
			'<p class="privacy-policy-tutorial"><strong>%s</strong></p>',
			esc_html__( 'Suggested text:', 'yamap-block-gutenberg' )
		);
		$content .= wpautop(
			esc_html__(
				'This site uses Yandex Maps to display interactive maps. The Yandex service is contacted only on pages that contain a map and, depending on the map settings, when the map approaches the visible area or after a visitor activates it.',
				'yamap-block-gutenberg'
			)
		);
		$content .= wpautop(
			esc_html__(
				"When a map is activated, the visitor's browser sends the configured public API key and map language to Yandex. Yandex may also receive technical request data, including the visitor's IP address, user agent, referring page, and interactions needed to provide map tiles and controls. Browser geolocation is requested only if the visitor uses the geolocation control and grants permission.",
				'yamap-block-gutenberg'
			)
		);
		$content .= wpautop(
			sprintf(
				/* translators: 1: Yandex Maps API terms link, 2: Yandex privacy policy link. */
				esc_html__( 'For more information, see the %1$s and the %2$s.', 'yamap-block-gutenberg' ),
				$terms_link,
				$privacy_link
			)
		);

		/**
		 * Filters the suggested privacy policy content.
		 *
		 * Add-ons that introduce another external service should append their own
		 * disclosure here. The result is sanitized before WordPress receives it.
		 *
		 * @since 2.0.0
		 *
		 * @param string $content Suggested privacy policy HTML.
		 */
		$filtered_content = apply_filters( 'guyamap_privacy_policy_content', $content );
		if ( is_string( $filtered_content ) ) {
			$content = $filtered_content;
		}

		wp_add_privacy_policy_content(
			__( 'Yandex Maps for Gutenberg', 'yamap-block-gutenberg' ),
			wp_kses_post( $content )
		);
	}

	/**
	 * Sanitizes the full settings payload.
	 *
	 * @param mixed $input Raw Settings API input.
	 * @return array<string, string>
	 */
	public function sanitize( $input ): array {
		$input = is_array( $input ) ? $input : array();

		$settings = array(
			'api_key'  => $this->normalize_api_key( $input['api_key'] ?? '' ),
			'language' => $this->normalize_language( $input['language'] ?? 'auto', 'auto' ),
		);

		/**
		 * Filters settings after core sanitization.
		 *
		 * @since 2.0.0
		 *
		 * @param array<string, string> $settings Sanitized settings.
		 * @param array<string, mixed>  $input    Raw settings payload.
		 */
		$settings = apply_filters( 'guyamap_sanitized_settings', $settings, $input );
		if ( ! is_array( $settings ) ) {
			return $this->get_defaults();
		}

		return array(
			'api_key'  => $this->normalize_api_key( $settings['api_key'] ?? '' ),
			'language' => $this->normalize_language( $settings['language'] ?? 'auto', 'auto' ),
		);
	}

	/**
	 * Returns all saved settings merged over defaults.
	 *
	 * @return array<string, string>
	 */
	public function get_all(): array {
		$settings = get_option( self::OPTION_NAME, array() );
		$settings = is_array( $settings ) ? $settings : array();

		return array(
			'api_key'  => $this->normalize_api_key( $settings['api_key'] ?? '' ),
			'language' => $this->normalize_language( $settings['language'] ?? 'auto', 'auto' ),
		);
	}

	/**
	 * Returns the public Yandex JavaScript API key.
	 *
	 * The key is necessarily visible to browsers. Administrators should restrict
	 * it to their HTTP referrers in the Yandex Developer Dashboard.
	 *
	 * @return string
	 */
	public function get_api_key(): string {
		$settings = $this->get_all();
		$api_key  = defined( 'GUYAMAP_YANDEX_API_KEY' )
			? GUYAMAP_YANDEX_API_KEY
			: $settings['api_key'];

		/**
		 * Filters the Yandex JavaScript API key sent to the browser.
		 *
		 * @since 2.0.0
		 *
		 * @param string $api_key Yandex JavaScript API key.
		 */
		$api_key = apply_filters( 'guyamap_yandex_api_key', $api_key );

		return $this->normalize_api_key( $api_key );
	}

	/**
	 * Returns a locale supported by the Yandex JavaScript API.
	 *
	 * @return string
	 */
	public function get_language(): string {
		$settings = $this->get_all();
		$language = (string) $settings['language'];

		if ( 'auto' === $language ) {
			$locale              = function_exists( 'determine_locale' ) ? determine_locale() : get_locale();
			$locale              = str_replace( '-', '_', (string) $locale );
			$automatic_languages = $this->get_automatic_languages();

			if ( in_array( $locale, $automatic_languages, true ) ) {
				$language = $locale;
			} elseif ( ( 0 === strpos( $locale, 'ru_' ) || 'ru' === $locale ) && in_array( 'ru_RU', $automatic_languages, true ) ) {
				$language = 'ru_RU';
			} elseif ( ( 0 === strpos( $locale, 'uk_' ) || 'uk' === $locale ) && in_array( 'uk_UA', $automatic_languages, true ) ) {
				$language = 'uk_UA';
			} elseif ( ( 0 === strpos( $locale, 'tr_' ) || 'tr' === $locale ) && in_array( 'tr_TR', $automatic_languages, true ) ) {
				$language = 'tr_TR';
			} elseif ( ( 0 === strpos( $locale, 'he_' ) || 'he' === $locale ) && in_array( 'he_IL', $automatic_languages, true ) ) {
				$language = 'he_IL';
			} else {
				$language = 'en_US';
			}
		}

		/**
		 * Filters the Yandex Maps locale.
		 *
		 * @since 2.0.0
		 *
		 * @param string $language Yandex Maps locale.
		 */
		$language = apply_filters( 'guyamap_yandex_language', $language );
		$language = $this->normalize_language( $language, 'en_US' );

		return 'auto' !== $language ? $language : 'en_US';
	}

	/**
	 * Returns the settings screen URL.
	 *
	 * @return string
	 */
	public function get_page_url(): string {
		return admin_url( 'options-general.php?page=' . self::PAGE_SLUG );
	}

	/**
	 * Returns the host name visitors' browsers send to Yandex as HTTP Referer.
	 *
	 * @return string
	 */
	public function get_site_host(): string {
		$host = wp_parse_url( home_url( '/' ), PHP_URL_HOST );

		return is_string( $host ) ? $host : '';
	}

	/**
	 * Asks Yandex whether the configured key is accepted for this site.
	 *
	 * A browser cannot read why the cross-origin API script failed to load, so
	 * this server-side request reproduces it with the site address as HTTP
	 * Referer and reports the real HTTP status. The origin is fixed, redirects
	 * are not followed, and only a small part of the response is read.
	 *
	 * @return array{status: string, code: int, message: string} Check result. Status is
	 *                                                           one of `missing`, `accepted`,
	 *                                                           `rejected`, `limited`,
	 *                                                           `unreachable`, `unexpected`.
	 */
	public function check_api_key(): array {
		$api_key = $this->get_api_key();
		if ( '' === $api_key ) {
			return array(
				'status'  => 'missing',
				'code'    => 0,
				'message' => '',
			);
		}

		$url = add_query_arg(
			array(
				'apikey' => rawurlencode( $api_key ),
				'lang'   => rawurlencode( $this->get_language() ),
			),
			self::API_ENDPOINT
		);

		$response = wp_remote_get(
			$url,
			array(
				'timeout'             => 15,
				'redirection'         => 0,
				'limit_response_size' => 2048,
				'reject_unsafe_urls'  => true,
				'headers'             => array(
					'Referer' => home_url( '/' ),
					'Accept'  => '*/*',
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return array(
				'status'  => 'unreachable',
				'code'    => 0,
				'message' => sanitize_text_field( $response->get_error_message() ),
			);
		}

		$code    = (int) wp_remote_retrieve_response_code( $response );
		$message = '';
		$body    = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		if ( is_array( $body ) && isset( $body['message'] ) && is_scalar( $body['message'] ) ) {
			$message = substr( sanitize_text_field( (string) $body['message'] ), 0, 200 );
		}

		if ( 200 === $code ) {
			$status = 'accepted';
		} elseif ( 429 === $code ) {
			$status = 'limited';
		} elseif ( in_array( $code, array( 400, 401, 403 ), true ) ) {
			$status = 'rejected';
		} else {
			$status = 'unexpected';
		}

		return array(
			'status'  => $status,
			'code'    => $code,
			'message' => $message,
		);
	}

	/**
	 * Renders the settings page.
	 *
	 * @return void
	 */
	public function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to manage these settings.', 'yamap-block-gutenberg' ) );
		}

		$check_url = wp_nonce_url(
			add_query_arg( 'guyamap-check', '1', $this->get_page_url() ),
			self::CHECK_ACTION
		);
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Yandex Maps for Gutenberg', 'yamap-block-gutenberg' ); ?></h1>
			<?php $this->render_api_key_check(); ?>
			<form action="options.php" method="post">
				<?php
				settings_fields( self::PAGE_SLUG );
				do_settings_sections( self::PAGE_SLUG );
				submit_button();
				?>
			</form>
			<p>
				<a class="button" href="<?php echo esc_url( $check_url ); ?>">
					<?php esc_html_e( 'Check API key', 'yamap-block-gutenberg' ); ?>
				</a>
			</p>
			<p class="description">
				<?php esc_html_e( 'The check sends one request with the saved key and this site address from the server to Yandex. It also runs after the settings are saved.', 'yamap-block-gutenberg' ); ?>
			</p>
		</div>
		<?php
	}

	/**
	 * Verifies the saved key after a save or an explicit request and prints the verdict.
	 *
	 * @return void
	 */
	private function render_api_key_check(): void {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Core appends this flag after its own nonce-checked save; the check is read-only.
		$after_save = isset( $_GET['settings-updated'] );
		$on_demand  = isset( $_GET['guyamap-check'], $_GET['_wpnonce'] )
			&& wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ), self::CHECK_ACTION );

		if ( ! $after_save && ! $on_demand ) {
			return;
		}

		$result = $this->check_api_key();
		$host   = $this->get_site_host();

		switch ( $result['status'] ) {
			case 'accepted':
				$type = 'success';
				$text = sprintf(
					/* translators: %s: Site host name. */
					__( 'Yandex accepts this API key for %s.', 'yamap-block-gutenberg' ),
					$host
				);
				break;
			case 'rejected':
				$type = 'error';
				$text = sprintf(
					/* translators: 1: Site host name, 2: HTTP status code, 3: Response message from Yandex. */
					__( 'Yandex rejects this API key for %1$s (HTTP %2$d: %3$s). Maps will not load on this site. Open the key in the Yandex Developer Dashboard and add %1$s to its HTTP Referer restrictions, or enter a key issued for the JavaScript API.', 'yamap-block-gutenberg' ),
					$host,
					$result['code'],
					'' !== $result['message'] ? $result['message'] : __( 'no details', 'yamap-block-gutenberg' )
				);
				break;
			case 'limited':
				$type = 'warning';
				$text = __( 'Yandex is rate limiting requests from this server (HTTP 429), so the key could not be verified. Try again in a minute.', 'yamap-block-gutenberg' );
				break;
			case 'unreachable':
				$type = 'warning';
				$text = sprintf(
					/* translators: %s: Connection error message. */
					__( 'The server could not contact Yandex to verify the key: %s This check runs from the server, so maps may still load in visitors\' browsers.', 'yamap-block-gutenberg' ),
					$result['message']
				);
				break;
			case 'missing':
				$type = 'warning';
				$text = __( 'No API key is saved. Maps cannot be displayed without a Yandex JavaScript API key.', 'yamap-block-gutenberg' );
				break;
			default:
				$type = 'warning';
				$text = sprintf(
					/* translators: %d: HTTP status code. */
					__( 'Yandex returned an unexpected response (HTTP %d), so the key could not be verified.', 'yamap-block-gutenberg' ),
					$result['code']
				);
		}

		printf(
			'<div class="notice notice-%1$s inline" data-guyamap-key-status="%2$s"><p>%3$s</p></div>',
			esc_attr( $type ),
			esc_attr( $result['status'] ),
			esc_html( $text )
		);
	}

	/**
	 * Renders the API settings introduction.
	 *
	 * @return void
	 */
	public function render_section(): void {
		printf(
			'<p>%1$s <a href="%2$s" target="_blank" rel="noopener noreferrer external">%3$s</a></p>',
			esc_html__( 'A Yandex JavaScript API key is required. The key is public by design, so restrict it to this site in the Yandex Developer Dashboard.', 'yamap-block-gutenberg' ),
			esc_url( 'https://developer.tech.yandex.ru/' ),
			esc_html__( 'Get or configure an API key', 'yamap-block-gutenberg' )
		);

		$host = $this->get_site_host();
		if ( '' !== $host ) {
			printf(
				'<p>%1$s <code>%2$s</code></p>',
				esc_html__( 'HTTP Referer to allow for this site:', 'yamap-block-gutenberg' ),
				esc_html( $host )
			);
		}
	}

	/**
	 * Renders the API key input.
	 *
	 * @return void
	 */
	public function render_api_key_field(): void {
		$settings = $this->get_all();
		?>
		<input
			type="text"
			class="regular-text code"
			id="guyamap-api-key"
			name="<?php echo esc_attr( self::OPTION_NAME ); ?>[api_key]"
			value="<?php echo esc_attr( $settings['api_key'] ); ?>"
			autocomplete="off"
			spellcheck="false"
		/>
		<?php if ( defined( 'GUYAMAP_YANDEX_API_KEY' ) ) : ?>
			<p class="description">
				<?php esc_html_e( 'The GUYAMAP_YANDEX_API_KEY constant overrides this value.', 'yamap-block-gutenberg' ); ?>
			</p>
		<?php endif; ?>
		<?php
	}

	/**
	 * Renders the map locale selector.
	 *
	 * @return void
	 */
	public function render_language_field(): void {
		$settings = $this->get_all();
		?>
		<select
			id="guyamap-language"
			name="<?php echo esc_attr( self::OPTION_NAME ); ?>[language]"
		>
			<?php foreach ( $this->get_language_choices() as $value => $label ) : ?>
				<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $settings['language'], $value ); ?>>
					<?php echo esc_html( $label ); ?>
				</option>
			<?php endforeach; ?>
		</select>
		<?php
	}

	/**
	 * Returns option defaults.
	 *
	 * @return array<string, string>
	 */
	private function get_defaults(): array {
		return array(
			'api_key'  => '',
			'language' => 'auto',
		);
	}

	/**
	 * Sanitizes a public browser API key.
	 *
	 * @param mixed $value Raw API key.
	 * @return string
	 */
	private function normalize_api_key( $value ): string {
		$value = is_scalar( $value ) ? sanitize_text_field( (string) $value ) : '';
		$value = (string) preg_replace( '/[^A-Za-z0-9._~-]/', '', $value );

		return substr( $value, 0, 256 );
	}

	/**
	 * Returns a supported Yandex Maps locale.
	 *
	 * @param mixed  $value    Raw locale.
	 * @param string $fallback Fallback locale.
	 * @return string
	 */
	private function normalize_language( $value, string $fallback ): string {
		$value = is_scalar( $value ) ? sanitize_text_field( (string) $value ) : '';
		$value = str_replace( '-', '_', $value );

		return array_key_exists( $value, $this->get_language_choices() ) ? $value : $fallback;
	}

	/**
	 * Returns locales eligible for automatic site-locale matching.
	 *
	 * @return string[]
	 */
	private function get_automatic_languages(): array {
		$languages = array(
			'ru_RU',
			'en_US',
			'en_RU',
			'ru_UA',
			'uk_UA',
			'tr_TR',
			'he_IL',
			'en_IL',
		);

		/**
		 * Filters locales eligible for automatic Yandex Maps locale matching.
		 *
		 * This legacy hook is retained for compatibility with version 1.x.
		 * Invalid or unsupported values are discarded before use.
		 *
		 * @since 1.0.1
		 *
		 * @param string[] $languages Supported automatic locales.
		 */
		$filtered_languages = apply_filters( 'guyamap_locales', $languages );
		if ( ! is_array( $filtered_languages ) ) {
			return $languages;
		}

		$normalized_languages = array();
		foreach ( $filtered_languages as $language ) {
			$language = $this->normalize_language( $language, '' );
			if ( '' !== $language && 'auto' !== $language ) {
				$normalized_languages[] = $language;
			}
		}

		return array_values( array_unique( $normalized_languages ) );
	}

	/**
	 * Returns supported Yandex Maps locales and their labels.
	 *
	 * @return array<string, string>
	 */
	private function get_language_choices(): array {
		return array(
			'auto'  => __( 'Automatic (site language)', 'yamap-block-gutenberg' ),
			'ru_RU' => __( 'Russian', 'yamap-block-gutenberg' ),
			'en_US' => __( 'English', 'yamap-block-gutenberg' ),
			'en_RU' => __( 'English (Russia)', 'yamap-block-gutenberg' ),
			'ru_UA' => __( 'Russian (Ukraine)', 'yamap-block-gutenberg' ),
			'uk_UA' => __( 'Ukrainian', 'yamap-block-gutenberg' ),
			'tr_TR' => __( 'Turkish', 'yamap-block-gutenberg' ),
			'he_IL' => __( 'Hebrew', 'yamap-block-gutenberg' ),
			'en_IL' => __( 'English (Israel)', 'yamap-block-gutenberg' ),
		);
	}
}
