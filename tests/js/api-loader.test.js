import {
	getYandexApiWindow,
	loadYandexApi,
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
