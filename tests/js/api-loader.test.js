import { loadYandexApi } from '../../src/runtime/api-loader';

const STATE_KEY = '__guyamapYandexMapsV3';

const createFrame = () => {
	const frame = document.createElement( 'iframe' );
	document.body.appendChild( frame );
	return frame;
};

afterEach( () => {
	document.body.replaceChildren();
	delete window[ STATE_KEY ];
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
} );
