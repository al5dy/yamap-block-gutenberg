const GLOBAL_STATE = '__guyamapYandexMapsV3';
const API_ORIGIN = 'https://api-maps.yandex.ru';
const API_BASE = `${ API_ORIGIN }/v3/`;
const SCRIPT_SELECTOR = 'script[data-guyamap-yandex-api="v3"]';
const LOAD_TIMEOUT = 20000;
const PROBE_TIMEOUT = 8000;
const FAILURE_TTL = 60000;

/**
 * Failure causes that cannot change without a page reload or a change in the
 * Yandex Developer Dashboard. They are remembered briefly so a page with many
 * lazy maps does not repeat a request that is known to be refused.
 */
const STICKY_FAILURES = new Set( [ 'api_key_rejected', 'csp' ] );

function getState( targetWindow ) {
	if ( ! targetWindow[ GLOBAL_STATE ] ) {
		targetWindow[ GLOBAL_STATE ] = {
			promise: null,
			apiKey: '',
			language: '',
			status: 'idle',
			failure: null,
		};
	}

	return targetWindow[ GLOBAL_STATE ];
}

/**
 * Creates a loader error carrying a stable, machine-readable `code`.
 *
 * Codes: `missing_api_key`, `api_key_rejected`, `network`, `csp`, `timeout`,
 * `api_unavailable`, `load_failed` (cause could not be determined) and
 * `unavailable` (no usable document).
 *
 * @param {Window} ownerWindow Realm that owns the error.
 * @param {string} message     Internal error identifier.
 * @param {string} code        Public error code.
 * @param {*}      cause       Underlying event or error.
 * @return {Error} Coded error.
 */
const createError = ( ownerWindow, message, code, cause ) => {
	const error = new ownerWindow.Error( message );
	error.code = code;
	if ( cause !== undefined ) {
		error.cause = cause;
	}

	return error;
};

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
 * Checks whether the SDK endpoint answers at all.
 *
 * The SDK is a cross-origin script, so a failed load never exposes its HTTP
 * status. An opaque `no-cors` request still settles differently: it resolves
 * when Yandex answered (for example with HTTP 403 for a rejected key) and
 * rejects when the request never reached Yandex.
 *
 * @param {Window} loaderWindow Realm that owns the request.
 * @param {string} url          SDK URL that failed to load.
 * @return {Promise<string>} `reachable`, `unreachable` or `unknown`.
 */
const probeEndpoint = async ( loaderWindow, url ) => {
	if ( loaderWindow.navigator?.onLine === false ) {
		return 'unreachable';
	}
	if ( typeof loaderWindow.fetch !== 'function' ) {
		return 'unknown';
	}

	const abortController =
		typeof loaderWindow.AbortController === 'function'
			? new loaderWindow.AbortController()
			: null;
	let timeoutId;
	// A slow answer proves nothing either way, so a timeout is inconclusive
	// rather than "unreachable": Yandex can take seconds to refuse a key.
	const timeout = new loaderWindow.Promise( ( settle ) => {
		timeoutId = loaderWindow.setTimeout( () => {
			settle( 'unknown' );
			abortController?.abort();
		}, PROBE_TIMEOUT );
	} );
	const request = loaderWindow
		.fetch( url, {
			mode: 'no-cors',
			cache: 'no-store',
			credentials: 'omit',
			referrerPolicy: 'strict-origin-when-cross-origin',
			signal: abortController?.signal,
		} )
		.then(
			() => 'reachable',
			() => 'unreachable'
		);
	const result = await loaderWindow.Promise.race( [ timeout, request ] );
	loaderWindow.clearTimeout( timeoutId );

	return result;
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
 * Forgets a remembered SDK failure so the next load performs a real request.
 *
 * Used by explicit "retry" actions after an administrator changed the key or
 * its HTTP Referer restrictions.
 *
 * @param {Window} targetWindow Window that owns the map container.
 */
export function resetYandexApi( targetWindow = globalThis.window ) {
	if ( ! targetWindow?.document ) {
		return;
	}

	const loaderWindow = getYandexApiWindow( targetWindow );
	if ( loaderWindow?.[ GLOBAL_STATE ] ) {
		loaderWindow[ GLOBAL_STATE ].failure = null;
	}
}

/**
 * Loads one Yandex Maps v3 runtime per resolved SDK loader realm.
 *
 * API keys used by browser SDKs are public by design. They must be protected
 * with HTTP Referer restrictions in the Yandex developer dashboard.
 *
 * Rejections carry a `code` property describing why the SDK is unavailable.
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
		return Promise.reject(
			createError(
				globalThis,
				'guyamap_document_unavailable',
				'unavailable'
			)
		);
	}

	const loaderWindow = getYandexApiWindow( targetWindow );
	const targetDocument = loaderWindow?.document;
	if ( ! loaderWindow || ! targetDocument ) {
		return Promise.reject(
			createError(
				globalThis,
				'guyamap_document_unavailable',
				'unavailable'
			)
		);
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
				.catch( ( cause ) => {
					state.promise = null;
					state.status = 'failed';
					clearFailedApi( loaderWindow );
					throw createError(
						loaderWindow,
						'guyamap_api_load_failed',
						'api_unavailable',
						cause
					);
				} );
		}

		return state.promise;
	}

	if ( ! apiKey ) {
		return loaderWindow.Promise.reject(
			createError(
				loaderWindow,
				'guyamap_missing_api_key',
				'missing_api_key'
			)
		);
	}

	if ( state.promise ) {
		return state.promise;
	}

	if (
		state.failure &&
		state.failure.apiKey === apiKey &&
		state.failure.language === language &&
		state.failure.expires > loaderWindow.Date.now()
	) {
		return loaderWindow.Promise.reject( state.failure.error );
	}

	state.apiKey = apiKey;
	state.language = language;
	state.status = 'loading';
	state.failure = null;
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
		let scriptBlockedByPolicy = false;
		let probeBlockedByPolicy = false;

		const handlePolicyViolation = ( event ) => {
			if (
				typeof event.blockedURI !== 'string' ||
				! event.blockedURI.startsWith( API_ORIGIN )
			) {
				return;
			}

			const directive = String(
				event.effectiveDirective || event.violatedDirective || ''
			);
			if ( directive.startsWith( 'script-src' ) ) {
				scriptBlockedByPolicy = true;
			} else {
				probeBlockedByPolicy = true;
			}
		};

		const cleanup = () => {
			loaderWindow.clearTimeout( timeoutId );
			script.removeEventListener( 'load', ready );
			script.removeEventListener( 'error', handleScriptError );
		};

		const classifyScriptFailure = async ( url ) => {
			const reachability = await probeEndpoint( loaderWindow, url );
			// Policy violation events are queued; let a pending one arrive.
			await new loaderWindow.Promise( ( settle ) =>
				loaderWindow.setTimeout( settle, 0 )
			);

			if ( scriptBlockedByPolicy ) {
				return 'csp';
			}
			if ( reachability === 'reachable' ) {
				return 'api_key_rejected';
			}
			if ( reachability === 'unreachable' && ! probeBlockedByPolicy ) {
				return 'network';
			}

			return 'load_failed';
		};

		const fail = ( cause, knownCode ) => {
			if ( settled ) {
				return;
			}

			settled = true;
			cleanup();
			const url = script.src;
			script.dataset.guyamapLoadState = 'failed';
			script.remove();
			clearFailedApi( loaderWindow );

			const finish = ( code ) => {
				targetDocument.removeEventListener(
					'securitypolicyviolation',
					handlePolicyViolation
				);
				const error = createError(
					loaderWindow,
					'guyamap_api_load_failed',
					code,
					cause
				);
				state.promise = null;
				state.status = 'failed';
				state.failure = STICKY_FAILURES.has( code )
					? {
							apiKey,
							language,
							error,
							expires: loaderWindow.Date.now() + FAILURE_TTL,
					  }
					: null;
				reject( error );
			};

			if ( knownCode ) {
				finish( knownCode );
				return;
			}

			classifyScriptFailure( url ).then( finish, () =>
				finish( 'load_failed' )
			);
		};

		const handleScriptError = ( event ) => fail( event );

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
				targetDocument.removeEventListener(
					'securitypolicyviolation',
					handlePolicyViolation
				);
				state.status = 'ready';
				script.dataset.guyamapLoadState = 'ready';
				resolve( loaderWindow.ymaps3 );
			} catch ( error ) {
				fail( error, 'api_unavailable' );
			}
		};

		const timeoutId = loaderWindow.setTimeout(
			() =>
				fail(
					new loaderWindow.Error( 'guyamap_api_load_timeout' ),
					'timeout'
				),
			LOAD_TIMEOUT
		);
		targetDocument.addEventListener(
			'securitypolicyviolation',
			handlePolicyViolation
		);
		script.addEventListener( 'load', ready, { once: true } );
		script.addEventListener( 'error', handleScriptError, { once: true } );

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
