import {
	prepareMapHost,
	releaseMapHost,
	waitForMapHostStyles,
} from '../../src/runtime/map-element';

afterEach( () => {
	document.head
		.querySelectorAll( 'link' )
		.forEach( ( link ) => link.remove() );
	document.body.replaceChildren();
} );

describe( 'map Web Component', () => {
	it( 'isolates the map and mirrors only trusted runtime stylesheets', async () => {
		const yandexStyle = document.createElement( 'link' );
		yandexStyle.rel = 'stylesheet';
		yandexStyle.href =
			'https://yastatic.net/s3/front-maps-static/maps-front-jsapi-3/release/main.css';
		const themeStyle = document.createElement( 'link' );
		themeStyle.rel = 'stylesheet';
		themeStyle.href = 'https://theme.example.test/style.css';
		document.head.append( yandexStyle, themeStyle );

		const host = document.createElement( 'guyamap-map-view' );
		document.body.appendChild( host );
		const surface = prepareMapHost( host, {
			editor: true,
			styleUrl: 'https://example.test/plugin-style.css',
		} );
		const shadowLinks = [
			...host.shadowRoot.querySelectorAll( 'link[rel="stylesheet"]' ),
		];

		expect( surface ).toBe(
			host.shadowRoot.querySelector( '[part="canvas"]' )
		);
		expect( host.hasAttribute( 'inert' ) ).toBe( true );
		expect( shadowLinks.map( ( link ) => link.href ) ).toEqual(
			expect.arrayContaining( [
				'https://example.test/plugin-style.css',
				yandexStyle.href,
			] )
		);
		expect( shadowLinks.map( ( link ) => link.href ) ).not.toContain(
			themeStyle.href
		);

		shadowLinks.forEach( ( link ) =>
			link.dispatchEvent( new Event( 'load' ) )
		);
		await waitForMapHostStyles( host );
		releaseMapHost( host );
	} );

	it( 'mirrors trusted styles added after mount and releases its observer', async () => {
		const host = document.createElement( 'guyamap-map-view' );
		document.body.appendChild( host );
		prepareMapHost( host );

		const runtimeStyle = document.createElement( 'link' );
		runtimeStyle.rel = 'stylesheet';
		runtimeStyle.href =
			'https://yastatic.net/s3/front-maps-static/maps-front-jsapi-3/release/runtime.css';
		document.head.appendChild( runtimeStyle );
		await Promise.resolve();

		const mirroredStyle = host.shadowRoot.querySelector(
			`link[href="${ runtimeStyle.href }"]`
		);
		expect( mirroredStyle ).not.toBeNull();
		mirroredStyle.dispatchEvent( new Event( 'load' ) );
		await waitForMapHostStyles( host );

		releaseMapHost( host );
		const laterStyle = document.createElement( 'link' );
		laterStyle.rel = 'stylesheet';
		laterStyle.href =
			'https://yastatic.net/s3/front-maps-static/maps-front-jsapi-3/release/later.css';
		document.head.appendChild( laterStyle );
		await Promise.resolve();

		expect(
			host.shadowRoot.querySelector( `link[href="${ laterStyle.href }"]` )
		).toBeNull();
	} );

	it( 'mirrors SDK styles from a separate Gutenberg loader document', async () => {
		const frame = document.createElement( 'iframe' );
		const host = document.createElement( 'guyamap-map-view' );
		document.body.append( frame, host );
		prepareMapHost( host );

		const sdkStyle = frame.contentDocument.createElement( 'link' );
		sdkStyle.rel = 'stylesheet';
		sdkStyle.href =
			'https://yastatic.net/s3/front-maps-static/maps-front-jsapi-3/release/editor.css';
		frame.contentDocument.head.appendChild( sdkStyle );
		const stylesReady = waitForMapHostStyles( host, frame.contentDocument );
		const mirroredStyle = host.shadowRoot.querySelector(
			`link[href="${ sdkStyle.href }"]`
		);

		expect( mirroredStyle ).not.toBeNull();
		mirroredStyle.dispatchEvent( new Event( 'load' ) );
		await stylesReady;
		releaseMapHost( host );
	} );
} );
