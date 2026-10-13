import { destroyMap, mountMap, updateMap } from '../../src/runtime/map';

const createFrame = () => {
	const frame = document.createElement( 'iframe' );
	document.body.appendChild( frame );
	return frame;
};

const installCoreMock = ( targetWindow ) => {
	const markerEntities = [];
	const maps = [];

	class YMap {
		constructor( container, props ) {
			this.container = container;
			this.props = props;
			this.zoom = props.location.zoom;
			this.children = [];
			this.updates = [];
			this.calls = [];
			maps.push( this );
		}

		addChild( child ) {
			this.children.push( child );
			return this;
		}

		removeChild( child ) {
			this.children = this.children.filter(
				( current ) => current !== child
			);
			return this;
		}

		setRestrictMapArea( area ) {
			this.calls.push( [ 'setRestrictMapArea', area ] );
		}

		update( props ) {
			this.calls.push( [ 'update', props.restrictMapArea ] );
			this.updates.push( props );
			this.props = { ...this.props, ...props };
			if ( Number.isFinite( props.location?.zoom ) ) {
				this.zoom = props.location.zoom;
			}
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

		update( props ) {
			this.props = { ...this.props, ...props };
		}
	}

	class Layer {
		constructor( props ) {
			this.props = props;
		}

		update( props ) {
			this.props = { ...this.props, ...props };
			this.updated = true;
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

	return { maps, markerEntities };
};

afterEach( () => {
	document.body.replaceChildren();
} );

describe( 'map runtime', () => {
	it( 'keeps click-to-activate readiness pending until activation', async () => {
		const container = document.createElement( 'div' );
		document.body.appendChild( container );
		const states = [];
		container.addEventListener( 'guyamap:statechange', ( event ) => {
			states.push( event.detail.state );
		} );
		const controller = mountMap( container, {
			fallbackText: 'Open fallback map',
			fallbackUrl: 'https://example.test/map',
			loading: { clickToActivate: true },
		} );
		let settled = false;
		controller.ready.then( () => {
			settled = true;
		} );

		await Promise.resolve();
		expect( settled ).toBe( false );
		expect( container.dataset.state ).toBe( 'awaiting-activation' );

		controller.surface.querySelector( 'button' ).click();
		await controller.ready;

		expect( settled ).toBe( true );
		expect( container.dataset.state ).toBe( 'error' );
		expect(
			controller.surface.querySelector( '[role="alert"]' )
		).not.toBeNull();
		expect(
			controller.surface.querySelector( '.guyamap-map__error-link' ).href
		).toBe( 'https://example.test/map' );
		expect( states ).toEqual( [
			'awaiting-activation',
			'loading',
			'error',
		] );
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
		const { markerEntities } = installCoreMock( targetWindow );
		const container =
			frame.contentDocument.createElement( 'guyamap-map-view' );
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
		expect( controller.map.container ).toBe( controller.surface );
		expect( container.shadowRoot ).not.toBeNull();
		expect( container.hasAttribute( 'inert' ) ).toBe( true );
		expect( controller.map.props.behaviors ).toEqual( [] );
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
		const { markerEntities } = installCoreMock( targetWindow );
		const container =
			frame.contentDocument.createElement( 'guyamap-map-view' );
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

	it( 'updates a locked editor preview without recreating its YMap', async () => {
		const frame = createFrame();
		const targetWindow = frame.contentWindow;
		const { maps, markerEntities } = installCoreMock( targetWindow );
		const container =
			frame.contentDocument.createElement( 'guyamap-map-view' );
		frame.contentDocument.body.appendChild( container );
		const controller = mountMap(
			container,
			{
				apiKey: 'test-key',
				center: { latitude: 55.75, longitude: 37.61 },
				zoom: 10,
				behaviors: [ 'drag', 'scrollZoom' ],
				controls: {
					zoom: true,
					geolocation: false,
					fullscreen: false,
				},
				markers: [
					{
						id: 'office',
						coordinates: {
							latitude: 55.75,
							longitude: 37.61,
						},
					},
				],
			},
			{ editor: true, interactive: false }
		);
		await controller.ready;
		const originalMap = controller.map;

		await updateMap(
			controller,
			{
				apiKey: 'test-key',
				center: { latitude: 53.9, longitude: 27.56 },
				zoom: 15,
				theme: 'dark',
				camera: { tilt: 20, azimuth: 30 },
				behaviors: [ 'drag' ],
				customization: [
					{
						tags: { all: [ 'road' ] },
						stylers: { color: '#ff0000' },
					},
				],
				controls: {
					zoom: false,
					geolocation: false,
					fullscreen: false,
				},
				markers: [
					{
						id: 'office',
						coordinates: {
							latitude: 53.9,
							longitude: 27.56,
						},
						title: 'Updated office',
					},
				],
			},
			{ editor: true, interactive: false }
		);

		expect( maps ).toHaveLength( 1 );
		expect( controller.map ).toBe( originalMap );
		expect( originalMap.updates ).toHaveLength( 1 );
		expect( originalMap.updates[ 0 ].location ).toMatchObject( {
			center: [ 27.56, 53.9 ],
			zoom: 15,
		} );
		expect( originalMap.updates[ 0 ].behaviors ).toEqual( [] );
		expect( originalMap.updates[ 0 ].theme ).toBe( 'dark' );
		expect( controller.schemeLayer.updated ).toBe( true );
		expect( markerEntities ).toHaveLength( 2 );
		expect( container.hasAttribute( 'inert' ) ).toBe( true );
		destroyMap( controller );
	} );

	const mountFrameMap = ( config, options = {} ) => {
		const frame = createFrame();
		const targetWindow = frame.contentWindow;
		const mocks = installCoreMock( targetWindow );
		const container =
			frame.contentDocument.createElement( 'guyamap-map-view' );
		frame.contentDocument.body.appendChild( container );
		const controller = mountMap(
			container,
			{ apiKey: 'test-key', ...config },
			options
		);

		return { ...mocks, container, controller, frame, targetWindow };
	};

	const marker = ( id, extra = {} ) => ( {
		id,
		coordinates: { latitude: 55.75, longitude: 37.61 },
		title: id,
		...extra,
	} );

	it( 'reports why the map failed and explains it to administrators only', async () => {
		const container = document.createElement( 'div' );
		document.body.appendChild( container );
		let errorEvent;
		container.addEventListener( 'guyamap:error', ( event ) => {
			errorEvent = event;
		} );
		const i18n = {
			errorDetails: {
				missing_api_key: 'Add a key in the settings.',
				unknown_code: 'must be ignored',
			},
			openSettings: 'Open settings',
			adminOnly: 'Admins only.',
		};

		const visitor = mountMap( container, {
			fallbackText: 'Open fallback map',
			fallbackUrl: 'https://example.test/map',
			i18n,
		} );
		await visitor.ready;

		expect( container.dataset.state ).toBe( 'error' );
		expect( container.dataset.errorCode ).toBe( 'missing_api_key' );
		expect( errorEvent.detail.code ).toBe( 'missing_api_key' );
		expect( visitor.errorCode ).toBe( 'missing_api_key' );
		expect(
			visitor.surface.querySelector( '.guyamap-map__error-details' )
		).toBeNull();
		expect( visitor.surface.textContent ).not.toContain( 'Add a key' );

		const admin = mountMap( container, {
			diagnostics: true,
			settingsUrl: 'https://example.test/wp-admin/options.php',
			i18n,
		} );
		await admin.ready;

		const details = admin.surface.querySelector(
			'.guyamap-map__error-details'
		);
		expect( details.textContent ).toContain( 'Add a key in the settings.' );
		expect( details.textContent ).toContain( 'Admins only.' );
		expect(
			details.querySelector( '.guyamap-map__error-settings' ).href
		).toBe( 'https://example.test/wp-admin/options.php' );

		destroyMap( admin );
		expect( container.dataset.errorCode ).toBeUndefined();
	} );

	it( 'never links diagnostics to an unsafe settings URL', async () => {
		const container = document.createElement( 'div' );
		document.body.appendChild( container );
		const controller = mountMap( container, {
			diagnostics: true,
			settingsUrl: 'javascript:alert(1)',
			i18n: { errorDetails: { missing_api_key: 'No key.' } },
		} );
		await controller.ready;

		expect(
			controller.surface.querySelector( '.guyamap-map__error-details' )
		).not.toBeNull();
		expect(
			controller.surface.querySelector( '.guyamap-map__error-settings' )
		).toBeNull();
		destroyMap( controller );
	} );

	it( 'keeps one popup open, lifts it above other markers and closes it on Escape', async () => {
		const { controller, markerEntities, targetWindow } = mountFrameMap( {
			cluster: { enabled: false },
			controls: { zoom: false, geolocation: false, fullscreen: false },
			markers: [
				marker( 'first', { zIndex: 3 } ),
				marker( 'second', { zIndex: 7 } ),
			],
		} );
		await controller.ready;

		const [ first, second ] = markerEntities;
		const firstButton = first.element.querySelector( 'button' );
		const secondButton = second.element.querySelector( 'button' );
		const firstPopup = first.element.querySelector( '.guyamap-popup' );
		const secondPopup = second.element.querySelector( '.guyamap-popup' );

		firstButton.click();
		expect( firstPopup.hidden ).toBe( false );
		expect( first.props.zIndex ).toBeGreaterThan( 100000 );

		secondButton.click();
		expect( firstPopup.hidden ).toBe( true );
		expect( firstButton.getAttribute( 'aria-expanded' ) ).toBe( 'false' );
		expect( first.props.zIndex ).toBe( 3 );
		expect( secondPopup.hidden ).toBe( false );
		expect( second.props.zIndex ).toBeGreaterThan( 100000 );

		second.element.dispatchEvent(
			new targetWindow.KeyboardEvent( 'keydown', {
				key: 'Escape',
				bubbles: true,
			} )
		);
		expect( secondPopup.hidden ).toBe( true );
		expect( second.props.zIndex ).toBe( 7 );
		expect( controller.openPopup ).toBeNull();
		destroyMap( controller );
	} );

	it( 'closes the popup on an outside click but not on a map drag', async () => {
		const { controller, frame, markerEntities, targetWindow } =
			mountFrameMap( {
				controls: {
					zoom: false,
					geolocation: false,
					fullscreen: false,
				},
				markers: [ marker( 'only' ) ],
			} );
		await controller.ready;

		const popup =
			markerEntities[ 0 ].element.querySelector( '.guyamap-popup' );
		const pointer = ( type, x, y ) =>
			frame.contentDocument.body.dispatchEvent(
				Object.assign(
					new targetWindow.Event( type, {
						bubbles: true,
						composed: true,
					} ),
					{ clientX: x, clientY: y }
				)
			);

		markerEntities[ 0 ].element.querySelector( 'button' ).click();
		pointer( 'pointerdown', 10, 10 );
		pointer( 'pointerup', 120, 90 );
		expect( popup.hidden ).toBe( false );

		pointer( 'pointerdown', 10, 10 );
		pointer( 'pointerup', 11, 10 );
		expect( popup.hidden ).toBe( true );
		destroyMap( controller );
	} );

	it( 'shows the marker hint as a tooltip that does not duplicate the accessible name', async () => {
		const { controller, markerEntities } = mountFrameMap( {
			controls: { zoom: false, geolocation: false, fullscreen: false },
			markers: [ marker( 'hinted', { hint: 'Main office' } ) ],
		} );
		await controller.ready;

		const element = markerEntities[ 0 ].element;
		const hint = element.querySelector( '.guyamap-marker-hint' );
		expect( hint.textContent ).toBe( 'Main office' );
		expect( hint.getAttribute( 'aria-hidden' ) ).toBe( 'true' );
		expect(
			element.querySelector( 'button' ).getAttribute( 'aria-label' )
		).toBe( 'Main office' );
		destroyMap( controller );
	} );

	it( 'replaces a missing preset icon with the bundled fallback glyph', async () => {
		const { controller, markerEntities, targetWindow } = mountFrameMap( {
			iconBaseUrl: 'https://example.test/icons/',
			controls: { zoom: false, geolocation: false, fullscreen: false },
			markers: [ marker( 'iconic', { icon: { name: 'not_bundled' } } ) ],
		} );
		await controller.ready;

		const icon = markerEntities[ 0 ].element.querySelector(
			'.guyamap-default-marker__icon'
		);
		expect( icon.src ).toBe(
			'https://example.test/icons/not_bundled_24.svg'
		);
		icon.dispatchEvent( new targetWindow.Event( 'error' ) );
		expect( icon.src ).toBe( 'https://example.test/icons/fallback_24.svg' );
		// The mocked SDK never inserts marker elements into the document.
		expect( icon.parentNode ).not.toBeNull();
		icon.dispatchEvent( new targetWindow.Event( 'error' ) );
		expect( icon.parentNode ).toBeNull();
		destroyMap( controller );
	} );

	it( 'steps zoom buttons from the pending target during an animation', async () => {
		const { controller, maps } = mountFrameMap( {
			zoom: 12,
			controls: { zoom: true, geolocation: false, fullscreen: false },
		} );
		await controller.ready;

		const [ zoomIn, zoomOut ] = controller.surface.querySelectorAll(
			'.guyamap-map__control'
		);
		const map = maps[ 0 ];
		zoomIn.click();
		expect( map.location.zoom ).toBe( 13 );
		// The SDK reports an intermediate zoom while the animation runs.
		map.zoom = 12.4;
		zoomOut.click();
		zoomOut.click();
		expect( map.location.zoom ).toBe( 11 );
		destroyMap( controller );
	} );

	it( 'fits several markers with room for their pins and falls back for one point', async () => {
		const spread = mountFrameMap( {
			zoom: 9,
			mapOptions: { fitToMarkers: true },
			controls: { zoom: false, geolocation: false, fullscreen: false },
			markers: [
				marker( 'north', {
					coordinates: { latitude: 59.93, longitude: 30.33 },
				} ),
				marker( 'south', {
					coordinates: { latitude: 55.75, longitude: 37.61 },
				} ),
			],
		} );
		await spread.controller.ready;
		const { bounds } = spread.maps[ 0 ].props.location;
		expect( bounds[ 0 ][ 0 ] ).toBeLessThan( 30.33 );
		expect( bounds[ 0 ][ 1 ] ).toBeGreaterThan( 59.93 );
		expect( bounds[ 1 ][ 0 ] ).toBeGreaterThan( 37.61 );
		expect( bounds[ 1 ][ 1 ] ).toBeLessThan( 55.75 );
		destroyMap( spread.controller );

		const stacked = mountFrameMap( {
			zoom: 9,
			mapOptions: { fitToMarkers: true },
			controls: { zoom: false, geolocation: false, fullscreen: false },
			markers: [ marker( 'a' ), marker( 'b' ) ],
		} );
		await stacked.controller.ready;
		expect( stacked.maps[ 0 ].props.location ).toEqual( {
			center: [ 37.61, 55.75 ],
			zoom: 9,
		} );
		destroyMap( stacked.controller );
	} );

	it( 'marks the visitor location and reports a denied request visibly', async () => {
		const { controller, markerEntities, maps, targetWindow } =
			mountFrameMap( {
				controls: { zoom: false, geolocation: true, fullscreen: false },
				i18n: {
					geolocationDenied: 'Location access was denied.',
					geolocationError: 'Location unavailable.',
					userLocation: 'You are here',
				},
			} );
		await controller.ready;

		const callbacks = {};
		Object.defineProperty( targetWindow.navigator, 'geolocation', {
			configurable: true,
			value: {
				getCurrentPosition: ( success, failure ) => {
					callbacks.success = success;
					callbacks.failure = failure;
				},
			},
		} );
		const button = controller.surface.querySelector(
			'.guyamap-map__control'
		);

		button.click();
		expect( button.disabled ).toBe( true );
		callbacks.success( { coords: { longitude: 30.3, latitude: 59.9 } } );
		expect( button.disabled ).toBe( false );
		expect( maps[ 0 ].location.center ).toEqual( [ 30.3, 59.9 ] );
		const dot = markerEntities.find( ( entity ) =>
			entity.element.classList.contains( 'guyamap-user-location' )
		);
		expect( dot.props.coordinates ).toEqual( [ 30.3, 59.9 ] );
		expect( dot.element.getAttribute( 'aria-label' ) ).toBe(
			'You are here'
		);
		expect( maps[ 0 ].children ).toContain( dot );

		button.click();
		callbacks.failure( { code: 1 } );
		let notice = controller.surface.querySelector( '.guyamap-map__notice' );
		expect( notice.textContent ).toBe( 'Location access was denied.' );
		expect( notice.getAttribute( 'role' ) ).toBe( 'status' );

		button.click();
		callbacks.failure( { code: 2 } );
		notice = controller.surface.querySelector( '.guyamap-map__notice' );
		expect( notice.textContent ).toBe( 'Location unavailable.' );
		expect(
			controller.surface.querySelectorAll( '.guyamap-map__notice' )
		).toHaveLength( 1 );
		destroyMap( controller );
	} );

	it( 'keeps keyboard focus inside the map after activating a gated map', async () => {
		const frame = createFrame();
		const targetWindow = frame.contentWindow;
		installCoreMock( targetWindow );
		const container =
			frame.contentDocument.createElement( 'guyamap-map-view' );
		frame.contentDocument.body.appendChild( container );
		const controller = mountMap( container, {
			apiKey: 'test-key',
			loading: { clickToActivate: true },
		} );

		const button = controller.surface.querySelector(
			'.guyamap-map__activation-button'
		);
		button.focus();
		expect( container.shadowRoot.activeElement ).toBe( button );
		button.click();

		expect( frame.contentDocument.activeElement ).toBe( container );
		expect( container.getAttribute( 'tabindex' ) ).toBe( '-1' );
		await controller.ready;
		expect( container.dataset.state ).toBe( 'ready' );
		destroyMap( controller );
	} );

	it( 'releases a map-area restriction through the dedicated SDK setter', async () => {
		const area = [
			[ 36.5, 56.5 ],
			[ 38.5, 55 ],
		];
		const base = {
			controls: { zoom: false, geolocation: false, fullscreen: false },
		};
		const { controller, maps } = mountFrameMap( {
			...base,
			mapOptions: { restrictMapArea: false },
		} );
		await controller.ready;
		const map = maps[ 0 ];

		// An unrelated change must not touch the restriction.
		await updateMap( controller, { apiKey: 'test-key', ...base, zoom: 9 } );
		expect( map.calls ).toEqual( [ [ 'update', false ] ] );

		await updateMap( controller, {
			apiKey: 'test-key',
			...base,
			zoom: 9,
			mapOptions: { restrictMapArea: area },
		} );
		await updateMap( controller, {
			apiKey: 'test-key',
			...base,
			zoom: 9,
			mapOptions: { restrictMapArea: false },
		} );

		// The SDK enforces south-west and north-east corners, not the stored
		// top-left and bottom-right ones.
		const sdkArea = [
			[ 36.5, 55 ],
			[ 38.5, 56.5 ],
		];
		// The setter always runs before the general update that follows it.
		expect( map.calls.slice( 1 ) ).toEqual( [
			[ 'setRestrictMapArea', sdkArea ],
			[ 'update', sdkArea ],
			[ 'setRestrictMapArea', false ],
			[ 'update', false ],
		] );
		destroyMap( controller );
	} );

	it( 'never makes a marker draggable, whatever older content asks for', async () => {
		const { controller, markerEntities } = mountFrameMap( {
			cluster: { enabled: false },
			markers: [
				marker( 'office', { draggable: true, mapFollowsOnDrag: true } ),
			],
		} );
		await controller.ready;

		expect( markerEntities ).toHaveLength( 1 );
		[ 'draggable', 'mapFollowsOnDrag', 'onDragEnd' ].forEach( ( prop ) =>
			expect( markerEntities[ 0 ].props ).not.toHaveProperty( prop )
		);
		destroyMap( controller );
	} );

	it( 'turns the camera the short way when the azimuth changes', async () => {
		const base = {
			controls: { zoom: false, geolocation: false, fullscreen: false },
		};
		const { controller, maps } = mountFrameMap( base );
		await controller.ready;
		const map = maps[ 0 ];
		const degrees = ( radians ) => ( radians * 180 ) / Math.PI;
		// The SDK reports its azimuth within one turn: 0 to 360 degrees.
		const turn = async ( from, to ) => {
			map.azimuth = ( from * Math.PI ) / 180;
			await updateMap( controller, {
				apiKey: 'test-key',
				...base,
				camera: { tilt: 0, azimuth: to },
			} );

			return degrees(
				map.updates[ map.updates.length - 1 ].camera.azimuth
			);
		};

		// 170 to -170 is 20 degrees further, not 340 degrees back.
		expect( await turn( 170, -170 ) ).toBeCloseTo( 190 );
		// The SDK holds -25 as 335; 10 is 35 degrees ahead of it.
		expect( await turn( 335, 10 ) ).toBeCloseTo( 370 );
		expect( await turn( 10, -25 ) ).toBeCloseTo( -25 );
		// 180 and -180 are the same direction: the camera does not move.
		expect( await turn( 180, -180 ) ).toBeCloseTo( 180 );
		expect( await turn( 0, 90 ) ).toBeCloseTo( 90 );
		destroyMap( controller );
	} );
} );
