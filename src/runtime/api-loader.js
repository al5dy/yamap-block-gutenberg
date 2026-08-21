const GLOBAL_STATE = '__guyamapYandexMapsV3';
const API_BASE = 'https://api-maps.yandex.ru/v3/';
const SCRIPT_SELECTOR = 'script[data-guyamap-yandex-api="v3"]';

function getState( targetWindow ) {
	if ( ! targetWindow[ GLOBAL_STATE ] ) {
		targetWindow[ GLOBAL_STATE ] = {
			promise: null,
			apiKey: '',
			language: '',
		};
	}

	return targetWindow[ GLOBAL_STATE ];
}

/**
 * Resolve the document realm that should own the remote Yandex SDK script.
 *
 * Gutenberg's iframe editor is a special case: the editor JavaScript bundle is
 * executed in the parent wp-admin window while the block DOM lives in the
 * editor-canvas iframe. Loading JS API v3 from that transient iframe makes the
 * request depend on the iframe's Referer and lifecycle. Yandex JS API v3 uses
 * strict HTTP Referer checks, so the stable wp-admin document is the correct
 * place to own the SDK request.
 *
 * We only opt into the parent realm when all of the following are true:
 * - this module is running in another window than the map container;
 * - that window is the direct parent of the map container's window;
 * - the parent contains the editor bootstrap object registered by the plugin.
 *
 * Normal frontend maps, including maps rendered inside ordinary iframes, keep
 * using their own document realm.
 *
 * @param {Window} targetWindow Window that owns the map container.
 * @return {Window} Window that should load and own the Yandex SDK.
 */
function resolveLoaderWindow( targetWindow ) {
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
		return targetWindow.parent === moduleWindow
			? moduleWindow
			: targetWindow;
	} catch {
		// Cross-origin parents must never be accessed by the loader.
		return targetWindow;
	}
}

/**
 * Loads one Yandex Maps v3 runtime per SDK document realm.
 *
 * API keys used by browser SDKs are public by design. They must be protected
 * with HTTP Referer restrictions in the Yandex developer dashboard.
 *
 * In the Gutenberg iframe editor, the SDK itself is deliberately loaded in the
 * parent wp-admin document while the map still receives the actual iframe
 * HTMLElement as its root container. This keeps editor DOM ownership correct
 * and gives the Yandex request a stable site Referer.
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
	const targetDocument = targetWindow?.document;
	if ( ! targetWindow || ! targetDocument ) {
		return Promise.reject( new Error( 'guyamap_document_unavailable' ) );
	}

	// If this exact realm already has a ready SDK, prefer it. This preserves the
	// normal frontend behavior and avoids replacing a valid iframe-local runtime.
	if ( targetWindow.ymaps3?.ready ) {
		return targetWindow.ymaps3.ready.then( () => targetWindow.ymaps3 );
	}

	const loaderWindow = resolveLoaderWindow( targetWindow );
	const loaderDocument = loaderWindow.document;

	if ( loaderWindow.ymaps3?.ready ) {
		return loaderWindow.ymaps3.ready.then( () => loaderWindow.ymaps3 );
	}

	if ( ! apiKey ) {
		return loaderWindow.Promise.reject(
			new loaderWindow.Error( 'guyamap_missing_api_key' )
		);
	}

	const state = getState( loaderWindow );
	if ( state.promise ) {
		return state.promise;
	}

	state.apiKey = apiKey;
	state.language = language;

	state.promise = new loaderWindow.Promise( ( resolve, reject ) => {
		const existing = loaderDocument.querySelector( SCRIPT_SELECTOR );
		const script = existing || loaderDocument.createElement( 'script' );
		let settled = false;

		const cleanup = () => {
			loaderWindow.clearTimeout( timeout );
			script.removeEventListener( 'load', ready );
			script.removeEventListener( 'error', fail );
		};

		const fail = () => {
			if ( settled ) {
				return;
			}

			settled = true;
			cleanup();
			state.promise = null;

			if ( ! existing ) {
				script.remove();
			}

			reject(
				new loaderWindow.Error( 'guyamap_api_load_failed' )
			);
		};

		const ready = async () => {
			if ( settled ) {
				return;
			}

			try {
				if ( ! loaderWindow.ymaps3?.ready ) {
					throw new loaderWindow.Error(
						'guyamap_api_unavailable'
					);
				}

				await loaderWindow.ymaps3.ready;

				if ( settled ) {
					return;
				}

				settled = true;
				cleanup();

				resolve( loaderWindow.ymaps3 );
			} catch ( error ) {
				if ( settled ) {
					return;
				}

				settled = true;
				cleanup();
				state.promise = null;

				reject( error );
			}
		};

		const timeout = loaderWindow.setTimeout( fail, 20000 );

		script.addEventListener( 'load', ready, { once: true } );
		script.addEventListener( 'error', fail, { once: true } );

		if ( ! existing ) {
			const url = new loaderWindow.URL( API_BASE );

			url.searchParams.set( 'apikey', apiKey );
			url.searchParams.set( 'lang', language );

			script.src = url.toString();
			script.async = true;

			/*
			 * Yandex JS API v3 requires HTTP Referer restrictions.
			 * Explicitly preserve the origin for the cross-origin SDK request.
			 */
			script.referrerPolicy = 'strict-origin-when-cross-origin';

			script.dataset.guyamapYandexApi = 'v3';

			(
				loaderDocument.head ||
				loaderDocument.documentElement
			).appendChild( script );
		}
	} );

	return state.promise;
}
