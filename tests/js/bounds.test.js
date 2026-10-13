import {
	fitBoundsToViewport,
	getFeatureBounds,
	isPointBounds,
} from '../../src/runtime/bounds';

const point = ( longitude, latitude ) => ( {
	geometry: { coordinates: [ longitude, latitude ] },
} );

describe( 'marker bounds', () => {
	it( 'returns Yandex top-left / bottom-right bounds', () => {
		expect(
			getFeatureBounds( [
				point( 37.6, 55.7 ),
				point( 30.3, 59.9 ),
				point( 39.7, 47.2 ),
			] )
		).toEqual( [
			[ 30.3, 59.9 ],
			[ 39.7, 47.2 ],
		] );
	} );

	it( 'detects bounds that cannot define a zoom level', () => {
		expect(
			isPointBounds(
				getFeatureBounds( [ point( 37.6, 55.7 ), point( 37.6, 55.7 ) ] )
			)
		).toBe( true );
		expect(
			isPointBounds(
				getFeatureBounds( [ point( 37.6, 55.7 ), point( 37.6, 55.8 ) ] )
			)
		).toBe( false );
	} );

	it( 'pads bounds so a pin anchored at its tip stays inside the viewport', () => {
		const bounds = [
			[ 30, 60 ],
			[ 40, 50 ],
		];
		const [ [ west, north ], [ east, south ] ] = fitBoundsToViewport(
			bounds,
			{ width: 640, height: 480 }
		);

		expect( west ).toBeLessThan( 30 );
		expect( east ).toBeGreaterThan( 40 );
		expect( north ).toBeGreaterThan( 60 );
		expect( south ).toBeLessThan( 50 );
		// Horizontal padding is symmetric: 32px of a 640px viewport per side.
		expect( 30 - west ).toBeCloseTo( east - 40, 8 );
		expect( ( 30 - west ) / ( east - west ) ).toBeCloseTo( 32 / 640, 8 );
		// A pin grows upwards, so the top needs more room than the bottom.
		expect( north - 60 ).toBeGreaterThan( 50 - south );
	} );

	it( 'uses proportional padding when the viewport is not laid out yet', () => {
		const padded = fitBoundsToViewport(
			[
				[ 30, 60 ],
				[ 40, 50 ],
			],
			{ width: 0, height: 0 }
		);

		expect( padded[ 0 ][ 0 ] ).toBeLessThan( 30 );
		expect( padded[ 0 ][ 1 ] ).toBeGreaterThan( 60 );
		padded
			.flat()
			.forEach( ( value ) =>
				expect( Number.isFinite( value ) ).toBe( true )
			);
	} );

	it( 'keeps padded bounds inside valid coordinates', () => {
		const [ [ west, north ], [ east, south ] ] = fitBoundsToViewport(
			[
				[ -179.9, 84.9 ],
				[ 179.9, -84.9 ],
			],
			{ width: 320, height: 200 }
		);

		expect( west ).toBeGreaterThanOrEqual( -180 );
		expect( east ).toBeLessThanOrEqual( 180 );
		expect( north ).toBeLessThanOrEqual( 90 );
		expect( south ).toBeGreaterThanOrEqual( -90 );
	} );
} );
