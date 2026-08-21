const GLOBAL_STATE = '__guyamapYandexMapsV3';
const API_BASE = 'https://api-maps.yandex.ru/v3/';
const SCRIPT_SELECTOR = 'script[data-guyamap-yandex-api="v3"]';
const LOAD_TIMEOUT = 20000;

function getState( targetWindow ) {
	if ( ! targetWindow[ GLOBAL_STATE ] ) {
		targetWindow[ GLOBAL_STATE ] = {
			promise: null,
			apiKey: '',
			language: '',
			status: 'idle',
		};
	}

	return targetWindow[ GLOBAL_STATE ];
}

const clearFailedApi = ( targetWindow ) => {
	if ( ! targetWindow.ymaps3 ) {
		return;
	}

	try {
		Reflect.deleteProperty( targetWindow, 'ymaps3' );
	} catch {
		// A non-configurable third-party global cannot be recovered in place.
	}
};

/**
 * Returns the realm that can safely own the remote SDK request.
 *
 * WordPress renders the iframe-based Gutenberg canvas from a `blob:` URL. A
 * cross-origin script requested by a blob document has no HTTP Referer in
 * Chromium, regardless of the script's referrer policy. Yandex consequently
 * rejects an otherwise valid, domain-restricted API key. The editor bundle is
 * executed in the stable wp-admin parent, so that realm must own the SDK while
 * the YMap root continues to be the actual iframe element.
 *
 * The bootstrap-object and direct-parent checks intentionally keep ordinary
 * frontend iframes isolated in their own realm.
 *
 * @param {Window} targetWindow Window that owns the map container.
 * @return {Window} Window that should own the Yandex SDK.
 */
export function getYandexApiWindow( targetWindow ) {
	const moduleWindow =
		typeof globalThis.window !== 'undefined' ? globalThis.window : null;

	if (
		! moduleWindow ||
		moduleWindow === targetWindow ||
		! moduleWindow.document ||
		! moduleWindow.guyamapEditorSettings
	) {
		return targetWindow;
	}

	try {
		return targetWindow?.parent === moduleWindow
			? moduleWindow
			: targetWindow;
	} catch {
		// A cross-origin parent is never a valid loader realm.
		return targetWindow;
	}
}

/**
 * Loads one Yandex Maps v3 runtime per resolved SDK loader realm.
 *
 * API keys used by browser SDKs are public by design. They must be protected
 * with HTTP Referer restrictions in the Yandex developer dashboard.
 *
 * @param {string} apiKey       JavaScript API key.
 * @param {string} language     Supported Yandex locale.
 * @param {Window} targetWindow Window that owns the map container.
 * @return {Promise<Object>} The global ymaps3 API.
 */
export function loadYandexApi(
	apiKey,
	language,
	targetWindow = globalThis.window
) {
	if ( ! targetWindow?.document ) {
		return Promise.reject( new Error( 'guyamap_document_unavailable' ) );
	}

	const loaderWindow = getYandexApiWindow( targetWindow );
	const targetDocument = loaderWindow?.document;
	if ( ! loaderWindow || ! targetDocument ) {
		return Promise.reject( new Error( 'guyamap_document_unavailable' ) );
	}

	const state = getState( loaderWindow );
	if ( loaderWindow.ymaps3?.ready ) {
		if ( ! state.promise ) {
			state.status = 'loading';
			state.promise = loaderWindow.Promise.resolve(
				loaderWindow.ymaps3.ready
			)
				.then( () => {
					state.status = 'ready';
					return loaderWindow.ymaps3;
				} )
				.catch( ( error ) => {
					state.promise = null;
					state.status = 'failed';
					clearFailedApi( loaderWindow );
					throw error;
				} );
		}

		return state.promise;
	}

	if ( ! apiKey ) {
		return loaderWindow.Promise.reject(
			new loaderWindow.Error( 'guyamap_missing_api_key' )
		);
	}

	if ( state.promise ) {
		return state.promise;
	}

	state.apiKey = apiKey;
	state.language = language;
	state.status = 'loading';
	state.promise = new loaderWindow.Promise( ( resolve, reject ) => {
		const staleScript = targetDocument.querySelector( SCRIPT_SELECTOR );
		if (
			staleScript &&
			( staleScript.dataset.guyamapLoadState === 'failed' ||
				! loaderWindow.ymaps3 )
		) {
			staleScript.remove();
		}

		const existing = targetDocument.querySelector( SCRIPT_SELECTOR );
		const script = existing ?? targetDocument.createElement( 'script' );
		let settled = false;

		const cleanup = () => {
			loaderWindow.clearTimeout( timeoutId );
			script.removeEventListener( 'load', ready );
			script.removeEventListener( 'error', fail );
		};

		const fail = ( cause ) => {
			if ( settled ) {
				return;
			}

			settled = true;
			cleanup();
			state.promise = null;
			state.status = 'failed';
			script.dataset.guyamapLoadState = 'failed';
			script.remove();
			clearFailedApi( loaderWindow );

			const error = new loaderWindow.Error( 'guyamap_api_load_failed' );
			error.cause = cause;
			reject( error );
		};

		const ready = async () => {
			if ( settled ) {
				return;
			}

			try {
				if ( ! loaderWindow.ymaps3?.ready ) {
					throw new loaderWindow.Error( 'guyamap_api_unavailable' );
				}
				await loaderWindow.ymaps3.ready;
				if ( settled ) {
					return;
				}

				settled = true;
				cleanup();
				state.status = 'ready';
				script.dataset.guyamapLoadState = 'ready';
				resolve( loaderWindow.ymaps3 );
			} catch ( error ) {
				fail( error );
			}
		};

		const timeoutId = loaderWindow.setTimeout(
			() => fail( new loaderWindow.Error( 'guyamap_api_load_timeout' ) ),
			LOAD_TIMEOUT
		);
		script.addEventListener( 'load', ready, { once: true } );
		script.addEventListener( 'error', fail, { once: true } );

		if ( ! existing ) {
			const url = new loaderWindow.URL( API_BASE );
			url.searchParams.set( 'apikey', apiKey );
			url.searchParams.set( 'lang', language );
			script.src = url.toString();
			script.async = true;
			script.referrerPolicy = 'strict-origin-when-cross-origin';
			script.dataset.guyamapYandexApi = 'v3';
			script.dataset.guyamapLoadState = 'loading';
			(
				targetDocument.head || targetDocument.documentElement
			).appendChild( script );
		} else if ( loaderWindow.ymaps3?.ready ) {
			ready();
		}
	} );

	return state.promise;
}
