import { normalizeConfig, toLngLat } from '../../src/runtime/normalize';

describe( 'normalizeConfig', () => {
	it( 'clamps coordinates and swaps an inverted zoom range', () => {
		const config = normalizeConfig( {
			center: { latitude: 120, longitude: -250 },
			zoom: 50,
			zoomRange: { min: 18, max: 4 },
		} );

		expect( config.center ).toEqual( {
			latitude: 90,
			longitude: -180,
		} );
		expect( config.zoomRange ).toEqual( { min: 4, max: 18 } );
		expect( config.zoom ).toBe( 18 );
	} );

	it( 'keeps only supported, unique map behaviors', () => {
		const config = normalizeConfig( {
			behaviors: [ 'drag', 'invalid', 'drag', 'pinchRotate' ],
		} );

		expect( config.behaviors ).toEqual( [ 'drag', 'pinchRotate' ] );
	} );

	it( 'clamps camera angles to the Yandex Maps v3 contract', () => {
		const config = normalizeConfig( {
			camera: { tilt: 80, azimuth: -360 },
		} );

		expect( config.camera ).toEqual( { tilt: 50, azimuth: -180 } );
	} );

	it( 'normalizes markers into the versioned runtime shape', () => {
		const config = normalizeConfig( {
			markers: [
				{
					id: 'office',
					latitude: 55.75,
					longitude: 37.61,
					icon: { type: 'image', size: [ 0, 900 ] },
				},
			],
		} );

		expect( config.markers[ 0 ].coordinates ).toEqual( {
			latitude: 55.75,
			longitude: 37.61,
		} );
		expect( config.markers[ 0 ].icon.size ).toEqual( [ 1, 512 ] );
		expect( config.markers[ 0 ].mapFollowsOnDrag ).toBe( true );
	} );

	it( 'rejects executable CSS values for marker and cluster colors', () => {
		const config = normalizeConfig( {
			cluster: { color: 'url(https://example.com/tracker)' },
			markers: [
				{
					coordinates: {},
					icon: { color: 'var(--theme-color)' },
				},
			],
		} );

		expect( config.cluster.color ).toBe( '#ff4433' );
		expect( config.markers[ 0 ].icon.color ).toBe( '#ff4433' );
	} );

	it( 'normalizes map restrictions to Yandex top-left/bottom-right bounds', () => {
		const config = normalizeConfig( {
			mapOptions: {
				restrictMapArea: [
					[ 40, 50 ],
					[ 20, 60 ],
				],
			},
		} );

		expect( config.mapOptions.restrictMapArea ).toEqual( [
			[ 20, 60 ],
			[ 40, 50 ],
		] );
		expect(
			normalizeConfig( {
				mapOptions: { restrictMapArea: true },
			} ).mapOptions.restrictMapArea
		).toBe( false );
	} );

	it( 'deduplicates marker identifiers deterministically', () => {
		const config = normalizeConfig( {
			markers: [
				{ id: 'office', coordinates: {} },
				{ id: 'office', coordinates: {} },
				{ id: 'office', coordinates: {} },
			],
		} );

		expect( config.markers.map( ( marker ) => marker.id ) ).toEqual( [
			'office',
			'office-2',
			'office-3',
		] );
	} );

	it( 'removes prototype keys from advanced customization', () => {
		const customization = JSON.parse(
			'[{"tags":{"all":["road"]},"__proto__":{"polluted":true}}]'
		);
		const config = normalizeConfig( { customization } );

		expect( config.customization[ 0 ].tags ).toEqual( {
			all: [ 'road' ],
		} );
		expect(
			Object.prototype.hasOwnProperty.call(
				config.customization[ 0 ],
				'__proto__'
			)
		).toBe( false );
	} );

	it( 'preserves bounded extension namespaces for optional add-ons', () => {
		const config = normalizeConfig( {
			templateId: 42,
			overrides: { theme: 'dark' },
			extensions: { guyamapPro: { sourceId: 'locations' } },
		} );

		expect( config.templateId ).toBe( 42 );
		expect( config.overrides ).toEqual( { theme: 'dark' } );
		expect( config.extensions ).toEqual( {
			guyamapPro: { sourceId: 'locations' },
		} );
	} );

	it( 'normalizes the customizable preloader contract', () => {
		const config = normalizeConfig( {
			loading: {
				preloader: {
					enabled: true,
					type: 'unknown',
					color: 'url(https://example.test/tracker)',
					backgroundColor: '#ABCDEF',
					size: 500,
					transitionDuration: -100,
					label: 'Custom loading state',
				},
			},
		} );

		expect( config.loading.preloader ).toEqual( {
			enabled: true,
			type: 'spinner',
			color: '#3858e9',
			backgroundColor: '#abcdef',
			size: 96,
			transitionDuration: 0,
			label: 'Custom loading state',
		} );
	} );
} );

describe( 'toLngLat', () => {
	it( 'converts the editor coordinate object to Yandex order', () => {
		expect(
			toLngLat( { latitude: 55.751244, longitude: 37.618423 } )
		).toEqual( [ 37.618423, 55.751244 ] );
	} );
} );
