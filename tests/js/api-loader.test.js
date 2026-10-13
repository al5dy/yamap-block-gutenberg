import {
	getYandexApiWindow,
	loadYandexApi,
	resetYandexApi,
} from '../../src/runtime/api-loader';

const STATE_KEY = '__guyamapYandexMapsV3';

const createFrame = () => {
	const frame = document.createElement( 'iframe' );
	document.body.appendChild( frame );
	return frame;
};

afterEach( () => {
	document.body.replaceChildren();
	delete window[ STATE_KEY ];
	delete window.guyamapEditorSettings;
	delete window.ymaps3;
} );

describe( 'loadYandexApi', () => {
	it( 'loads and resolves the SDK in the map container realm', async () => {
		const frame = createFrame();
		const targetWindow = frame.contentWindow;
		const promise = loadYandexApi( 'test-key', 'en_US', targetWindow );
		const script = frame.contentDocument.querySelector(
			'script[data-guyamap-yandex-api="v3"]'
		);

		expect( script ).not.toBeNull();
		expect( script.ownerDocument ).toBe( frame.contentDocument );
		expect( script.src ).toContain( 'apikey=test-key' );
		expect( script.src ).toContain( 'lang=en_US' );
		expect( script.referrerPolicy ).toBe(
			'strict-origin-when-cross-origin'
		);
		expect( window[ STATE_KEY ] ).toBeUndefined();

		targetWindow.ymaps3 = {
			ready: targetWindow.Promise.resolve(),
		};
		script.dispatchEvent( new targetWindow.Event( 'load' ) );

		await expect( promise ).resolves.toBe( targetWindow.ymaps3 );
		expect( targetWindow[ STATE_KEY ].apiKey ).toBe( 'test-key' );
	} );

	it( 'keeps independent loader state for multiple document realms', async () => {
		const first = createFrame();
		const second = createFrame();

		const firstPromise = loadYandexApi(
			'first-key',
			'en_US',
			first.contentWindow
		);
		const secondPromise = loadYandexApi(
			'second-key',
			'ru_RU',
			second.contentWindow
		);

		expect( first.contentWindow[ STATE_KEY ].apiKey ).toBe( 'first-key' );
		expect( second.contentWindow[ STATE_KEY ].apiKey ).toBe( 'second-key' );
		expect(
			first.contentDocument.querySelector( 'script' ).ownerDocument
		).toBe( first.contentDocument );
		expect(
			second.contentDocument.querySelector( 'script' ).ownerDocument
		).toBe( second.contentDocument );

		first.contentWindow.ymaps3 = {
			ready: first.contentWindow.Promise.resolve(),
		};
		second.contentWindow.ymaps3 = {
			ready: second.contentWindow.Promise.resolve(),
		};
		first.contentDocument
			.querySelector( 'script' )
			.dispatchEvent( new first.contentWindow.Event( 'load' ) );
		second.contentDocument
			.querySelector( 'script' )
			.dispatchEvent( new second.contentWindow.Event( 'load' ) );
		await Promise.all( [ firstPromise, secondPromise ] );
	} );

	it( 'loads Gutenberg iframe SDK requests from the stable parent realm', async () => {
		const frame = createFrame();
		window.guyamapEditorSettings = { apiKey: 'test-key' };

		expect( getYandexApiWindow( frame.contentWindow ) ).toBe( window );
		const promise = loadYandexApi(
			'test-key',
			'en_US',
			frame.contentWindow
		);
		const script = document.querySelector(
			'script[data-guyamap-yandex-api="v3"]'
		);

		expect( script ).not.toBeNull();
		expect( script.ownerDocument ).toBe( document );
		expect( frame.contentDocument.querySelector( 'script' ) ).toBeNull();

		window.ymaps3 = { ready: Promise.resolve() };
		script.dispatchEvent( new Event( 'load' ) );

		await expect( promise ).resolves.toBe( window.ymaps3 );
	} );

	it( 'removes a failed script so a later call can retry cleanly', async () => {
		const frame = createFrame();
		const targetWindow = frame.contentWindow;
		const firstPromise = loadYandexApi( 'test-key', 'en_US', targetWindow );
		const failedScript = frame.contentDocument.querySelector( 'script' );

		failedScript.dispatchEvent( new targetWindow.Event( 'error' ) );
		await expect( firstPromise ).rejects.toThrow(
			'guyamap_api_load_failed'
		);
		expect( failedScript.isConnected ).toBe( false );

		const retryPromise = loadYandexApi( 'test-key', 'en_US', targetWindow );
		const retryScript = frame.contentDocument.querySelector( 'script' );
		expect( retryScript ).not.toBe( failedScript );
		targetWindow.ymaps3 = {
			ready: targetWindow.Promise.resolve(),
		};
		retryScript.dispatchEvent( new targetWindow.Event( 'load' ) );

		await expect( retryPromise ).resolves.toBe( targetWindow.ymaps3 );
		expect( retryScript.dataset.guyamapLoadState ).toBe( 'ready' );
	} );

	it( 'clears a rejected partial API before retrying', async () => {
		const frame = createFrame();
		const targetWindow = frame.contentWindow;
		const firstPromise = loadYandexApi( 'test-key', 'en_US', targetWindow );
		const firstScript = frame.contentDocument.querySelector( 'script' );
		targetWindow.ymaps3 = {
			ready: targetWindow.Promise.reject(
				new targetWindow.Error( 'temporary SDK failure' )
			),
		};
		firstScript.dispatchEvent( new targetWindow.Event( 'load' ) );

		await expect( firstPromise ).rejects.toThrow(
			'guyamap_api_load_failed'
		);
		expect( targetWindow.ymaps3 ).toBeUndefined();

		const retryPromise = loadYandexApi( 'test-key', 'en_US', targetWindow );
		const retryScript = frame.contentDocument.querySelector( 'script' );
		targetWindow.ymaps3 = {
			ready: targetWindow.Promise.resolve(),
		};
		retryScript.dispatchEvent( new targetWindow.Event( 'load' ) );

		await expect( retryPromise ).resolves.toBe( targetWindow.ymaps3 );
	} );
} );

describe( 'loadYandexApi failure diagnosis', () => {
	const failScript = ( frame ) => {
		const script = frame.contentDocument.querySelector( 'script' );
		script.dispatchEvent( new frame.contentWindow.Event( 'error' ) );
		return script;
	};

	it( 'reports a missing key without requesting the SDK', async () => {
		const frame = createFrame();

		await expect(
			loadYandexApi( '', 'en_US', frame.contentWindow )
		).rejects.toMatchObject( {
			message: 'guyamap_missing_api_key',
			code: 'missing_api_key',
		} );
		expect( frame.contentDocument.querySelector( 'script' ) ).toBeNull();
	} );

	it( 'reports a rejected key when Yandex answers without serving the SDK', async () => {
		const frame = createFrame();
		const targetWindow = frame.contentWindow;
		targetWindow.fetch = jest.fn( () =>
			targetWindow.Promise.resolve( { type: 'opaque' } )
		);

		const promise = loadYandexApi( 'bad-key', 'en_US', targetWindow );
		failScript( frame );

		await expect( promise ).rejects.toMatchObject( {
			message: 'guyamap_api_load_failed',
			code: 'api_key_rejected',
		} );
		expect( targetWindow.fetch ).toHaveBeenCalledTimes( 1 );
		const [ url, options ] = targetWindow.fetch.mock.calls[ 0 ];
		expect( url ).toContain(
			'https://api-maps.yandex.ru/v3/?apikey=bad-key'
		);
		expect( options ).toMatchObject( {
			mode: 'no-cors',
			credentials: 'omit',
		} );
	} );

	it( 'remembers a rejected key so other maps do not repeat the request', async () => {
		const frame = createFrame();
		const targetWindow = frame.contentWindow;
		targetWindow.fetch = jest.fn( () =>
			targetWindow.Promise.resolve( { type: 'opaque' } )
		);

		const first = loadYandexApi( 'bad-key', 'en_US', targetWindow );
		failScript( frame );
		await expect( first ).rejects.toMatchObject( {
			code: 'api_key_rejected',
		} );

		await expect(
			loadYandexApi( 'bad-key', 'en_US', targetWindow )
		).rejects.toMatchObject( { code: 'api_key_rejected' } );
		expect( frame.contentDocument.querySelector( 'script' ) ).toBeNull();
		expect( targetWindow.fetch ).toHaveBeenCalledTimes( 1 );

		// A different key, or an explicit retry, reaches Yandex again.
		const otherKey = loadYandexApi( 'other-key', 'en_US', targetWindow );
		expect( frame.contentDocument.querySelector( 'script' ).src ).toContain(
			'apikey=other-key'
		);
		failScript( frame );
		await expect( otherKey ).rejects.toMatchObject( {
			code: 'api_key_rejected',
		} );

		resetYandexApi( targetWindow );
		const retry = loadYandexApi( 'other-key', 'en_US', targetWindow );
		const retryScript = frame.contentDocument.querySelector( 'script' );
		expect( retryScript ).not.toBeNull();
		targetWindow.ymaps3 = { ready: targetWindow.Promise.resolve() };
		retryScript.dispatchEvent( new targetWindow.Event( 'load' ) );
		await expect( retry ).resolves.toBe( targetWindow.ymaps3 );
	} );

	it( 'reports a network failure when Yandex cannot be reached and allows an immediate retry', async () => {
		const frame = createFrame();
		const targetWindow = frame.contentWindow;
		targetWindow.fetch = jest.fn( () =>
			targetWindow.Promise.reject(
				new targetWindow.TypeError( 'offline' )
			)
		);

		const promise = loadYandexApi( 'test-key', 'en_US', targetWindow );
		failScript( frame );
		await expect( promise ).rejects.toMatchObject( { code: 'network' } );

		const retry = loadYandexApi( 'test-key', 'en_US', targetWindow );
		const retryScript = frame.contentDocument.querySelector( 'script' );
		expect( retryScript ).not.toBeNull();
		targetWindow.ymaps3 = { ready: targetWindow.Promise.resolve() };
		retryScript.dispatchEvent( new targetWindow.Event( 'load' ) );
		await expect( retry ).resolves.toBe( targetWindow.ymaps3 );
	} );

	it( 'reports a Content Security Policy block instead of blaming the key', async () => {
		const frame = createFrame();
		const targetWindow = frame.contentWindow;
		targetWindow.fetch = jest.fn( () =>
			targetWindow.Promise.resolve( { type: 'opaque' } )
		);

		const promise = loadYandexApi( 'test-key', 'en_US', targetWindow );
		frame.contentDocument.dispatchEvent(
			Object.assign(
				new targetWindow.Event( 'securitypolicyviolation' ),
				{
					blockedURI: 'https://api-maps.yandex.ru',
					effectiveDirective: 'script-src-elem',
				}
			)
		);
		failScript( frame );

		await expect( promise ).rejects.toMatchObject( { code: 'csp' } );
	} );

	it( 'does not trust a probe that the page policy blocked', async () => {
		const frame = createFrame();
		const targetWindow = frame.contentWindow;
		targetWindow.fetch = jest.fn( () => {
			frame.contentDocument.dispatchEvent(
				Object.assign(
					new targetWindow.Event( 'securitypolicyviolation' ),
					{
						blockedURI: 'https://api-maps.yandex.ru',
						effectiveDirective: 'connect-src',
					}
				)
			);
			return targetWindow.Promise.reject(
				new targetWindow.TypeError( 'blocked' )
			);
		} );

		const promise = loadYandexApi( 'test-key', 'en_US', targetWindow );
		failScript( frame );

		await expect( promise ).rejects.toMatchObject( {
			code: 'load_failed',
		} );
	} );

	it( 'does not report a slow answer as an unreachable network', async () => {
		const frame = createFrame();
		const targetWindow = frame.contentWindow;
		const realSetTimeout = targetWindow.setTimeout.bind( targetWindow );
		// Fire only the probe deadline immediately; the request never settles.
		targetWindow.setTimeout = ( callback, delay, ...rest ) =>
			delay === 8000
				? realSetTimeout( callback, 0 )
				: realSetTimeout( callback, delay, ...rest );
		const abort = jest.fn();
		targetWindow.AbortController = class {
			constructor() {
				this.signal = {};
				this.abort = abort;
			}
		};
		targetWindow.fetch = jest.fn(
			() => new targetWindow.Promise( () => {} )
		);

		const promise = loadYandexApi( 'slow-key', 'en_US', targetWindow );
		failScript( frame );

		await expect( promise ).rejects.toMatchObject( {
			code: 'load_failed',
		} );
		expect( abort ).toHaveBeenCalledTimes( 1 );

		// An inconclusive result is not remembered: the next map retries.
		loadYandexApi( 'slow-key', 'en_US', targetWindow ).catch( () => {} );
		expect(
			frame.contentDocument.querySelector( 'script' )
		).not.toBeNull();
	} );

	it( 'falls back to an undetermined cause when the browser cannot probe', async () => {
		const frame = createFrame();
		const targetWindow = frame.contentWindow;
		targetWindow.fetch = undefined;

		const promise = loadYandexApi( 'test-key', 'en_US', targetWindow );
		failScript( frame );

		await expect( promise ).rejects.toMatchObject( {
			code: 'load_failed',
		} );
	} );

	it( 'reports an SDK that loads but never becomes ready', async () => {
		const frame = createFrame();
		const targetWindow = frame.contentWindow;
		const promise = loadYandexApi( 'test-key', 'en_US', targetWindow );
		const script = frame.contentDocument.querySelector( 'script' );
		script.dispatchEvent( new targetWindow.Event( 'load' ) );

		await expect( promise ).rejects.toMatchObject( {
			message: 'guyamap_api_load_failed',
			code: 'api_unavailable',
		} );
	} );
} );
