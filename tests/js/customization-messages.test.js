import {
	getCustomizationErrors,
	getCustomizationWarning,
} from '../../src/components/customization-messages';
import { RASTER_STYLE_SAFE_LENGTH } from '../../src/runtime/customization';

const longStyle = () =>
	Array.from( { length: 120 }, ( unused, index ) => ( {
		tags: { any: [ 'water', 'road', 'admin', 'poi' ] },
		elements: [ 'geometry', 'label.text.fill' ],
		stylers: [
			{
				color: `#${ ( 0x100000 + index ).toString( 16 ) }`,
				opacity: 0.9,
				zoom: [ 1, 21 ],
			},
		],
	} ) );

describe( 'customization messages', () => {
	it( 'accepts a documented style', () => {
		expect(
			getCustomizationErrors( [
				{ tags: 'water', stylers: { color: '#00aaff' } },
			] )
		).toEqual( [] );
	} );

	it( 'names the rule and the property of each problem', () => {
		expect(
			getCustomizationErrors( [
				null,
				{ tags: 'water', stylers: [ { color: 'blue', glow: 1 } ] },
				{ types: 'circle', stylers: { opacity: 1 } },
			] )
		).toEqual( [
			'Rule 1 must be an object.',
			'Rule 2: "stylers[0].glow" is not a supported styler property.',
			'Rule 2: "stylers[0].color" has an unsupported value.',
			'Rule 2 needs at least one styler with a supported property.',
			'Rule 3: "types" has an unsupported value.',
		] );
	} );

	it( 'summarizes a long list of problems', () => {
		const messages = getCustomizationErrors( new Array( 9 ).fill( null ) );

		expect( messages ).toHaveLength( 6 );
		expect( messages[ 5 ] ).toBe( 'And 4 more problems.' );
		expect( getCustomizationErrors( new Array( 6 ).fill( 1 ) )[ 5 ] ).toBe(
			'And 1 more problem.'
		);
	} );

	it( 'warns about styles raster tiles cannot carry', () => {
		const style = longStyle();

		expect( RASTER_STYLE_SAFE_LENGTH ).toBeLessThan( 11700 );
		expect( getCustomizationWarning( style, 'raster' ) ).toMatch(
			/map stays empty/
		);
		// A device without a usable GPU falls back to raster tiles in the
		// automatic and in the vector mode alike.
		[ 'auto', 'vector' ].forEach( ( mode ) =>
			expect( getCustomizationWarning( style, mode ) ).toMatch(
				/cannot draw the vector map/
			)
		);
		expect(
			getCustomizationWarning( style.slice( 0, 90 ), 'raster' )
		).toBe( '' );
		expect(
			getCustomizationWarning( style.slice( 0, 90 ), 'vector' )
		).toBe( '' );
		expect( getCustomizationWarning( [], 'auto' ) ).toBe( '' );
	} );
} );
