import { destroyMap, mountMap } from '../../src/runtime/map';

const createFrame = () => {
	const frame = document.createElement( 'iframe' );
	document.body.appendChild( frame );
	return frame;
};

const installCoreMock = ( targetWindow ) => {
	const markerEntities = [];

	class YMap {
		constructor( container, props ) {
			this.container = container;
			this.props = props;
			this.zoom = props.location.zoom;
			this.children = [];
		}

		addChild( child ) {
			this.children.push( child );
			return this;
		}

		setLocation( location ) {
			this.location = location;
			if ( Number.isFinite( location.zoom ) ) {
				this.zoom = location.zoom;
			}
		}

		destroy() {
			this.destroyed = true;
		}
	}

	class YMapMarker {
		constructor( props, element ) {
			this.props = props;
			this.element = element;
			markerEntities.push( this );
		}
	}

	class Layer {
		constructor( props ) {
			this.props = props;
		}
	}

	targetWindow.ymaps3 = {
		ready: targetWindow.Promise.resolve(),
		YMap,
		YMapDefaultFeaturesLayer: Layer,
		YMapDefaultSchemeLayer: Layer,
		YMapListener: Layer,
		YMapMarker,
	};

	return markerEntities;
};

afterEach( () => {
	document.body.replaceChildren();
} );

describe( 'map runtime', () => {
	it( 'keeps click-to-activate readiness pending until activation', async () => {
		const container = document.createElement( 'div' );
		document.body.appendChild( container );
		const controller = mountMap( container, {
			loading: { clickToActivate: true },
		} );
		let settled = false;
		controller.ready.then( () => {
			settled = true;
		} );

		await Promise.resolve();
		expect( settled ).toBe( false );
		expect( container.dataset.state ).toBe( 'awaiting-activation' );

		container.querySelector( 'button' ).click();
		await controller.ready;

		expect( settled ).toBe( true );
		expect( container.dataset.state ).toBe( 'error' );
		expect( container.querySelector( '[role="alert"]' ) ).not.toBeNull();
		destroyMap( controller );
	} );

	it( 'settles a gated controller when it is destroyed before activation', async () => {
		const container = document.createElement( 'div' );
		document.body.appendChild( container );
		const controller = mountMap( container, {
			loading: { clickToActivate: true },
		} );

		destroyMap( controller );

		await expect( controller.ready ).resolves.toBe( controller );
		expect( container.dataset.state ).toBe( 'destroyed' );
	} );

	it( 'creates accessible, XSS-safe markers in an iframe owner realm', async () => {
		const frame = createFrame();
		const targetWindow = frame.contentWindow;
		const markerEntities = installCoreMock( targetWindow );
		const container = frame.contentDocument.createElement( 'div' );
		frame.contentDocument.body.appendChild( container );
		let readyEvent;
		container.addEventListener( 'guyamap:ready', ( event ) => {
			readyEvent = event;
		} );

		const controller = mountMap(
			container,
			{
				apiKey: 'test-key',
				baseUrl: 'https://example.test/',
				iconBaseUrl: 'https://example.test/icons/',
				controls: {
					zoom: false,
					geolocation: false,
					fullscreen: false,
				},
				markers: [
					{
						id: '__proto__',
						coordinates: {
							latitude: 55.75,
							longitude: 37.61,
						},
						title: '<img src=x onerror=alert(1)>',
						description: '<script>alert(1)</script>',
						link: { url: 'javascript:alert(1)' },
						icon: {
							type: 'default',
							name: '../escape',
							color: '#123456',
							markerSize: 'normal',
						},
					},
				],
			},
			{ editor: true }
		);
		await controller.ready;

		expect( controller.ownerWindow ).toBe( targetWindow );
		expect( controller.map.container ).toBe( container );
		expect( readyEvent ).toBeInstanceOf( targetWindow.CustomEvent );
		expect( markerEntities ).toHaveLength( 1 );
		expect( markerEntities[ 0 ].props.id ).not.toBe( '__proto__' );
		expect( markerEntities[ 0 ].element.ownerDocument ).toBe(
			frame.contentDocument
		);

		const marker = markerEntities[ 0 ].element;
		const button = marker.querySelector( 'button' );
		const popup = marker.querySelector( '.guyamap-popup' );
		const icon = marker.querySelector( '.guyamap-default-marker__icon' );
		expect( button.getAttribute( 'aria-expanded' ) ).toBe( 'false' );
		expect( popup.textContent ).toContain( '<script>alert(1)</script>' );
		expect( popup.querySelector( 'script' ) ).toBeNull();
		expect( popup.querySelector( 'a' ) ).toBeNull();
		expect( icon.src ).toBe( 'https://example.test/icons/fallback_24.svg' );

		button.click();
		expect( popup.hidden ).toBe( false );
		expect( button.getAttribute( 'aria-expanded' ) ).toBe( 'true' );
		destroyMap( controller );
	} );

	it( 'uses a labelled non-action element when a marker has no popup content', async () => {
		const frame = createFrame();
		const targetWindow = frame.contentWindow;
		const markerEntities = installCoreMock( targetWindow );
		const container = frame.contentDocument.createElement( 'div' );
		frame.contentDocument.body.appendChild( container );
		const controller = mountMap(
			container,
			{
				apiKey: 'test-key',
				i18n: { marker: 'Маркер карты' },
				controls: {
					zoom: false,
					geolocation: false,
					fullscreen: false,
				},
				markers: [
					{
						coordinates: {
							latitude: 55.75,
							longitude: 37.61,
						},
					},
				],
			},
			{ editor: true }
		);
		await controller.ready;

		const marker = markerEntities[ 0 ].element;
		const label = marker.querySelector( '[role="img"]' );
		expect( marker.querySelector( 'button' ) ).toBeNull();
		expect( marker.querySelector( '.guyamap-popup' ) ).toBeNull();
		expect( label.getAttribute( 'aria-label' ) ).toBe( 'Маркер карты' );
		expect( label.tabIndex ).toBe( -1 );
		destroyMap( controller );
	} );
} );
