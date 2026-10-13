import {
	getWidthRatio,
	toColorInputValue,
	validateAspectRatio,
	validateColor,
	validateDimension,
	validateRootMargin,
} from '../../src/components/validators';

describe( 'editor validators mirror the server normalizer', () => {
	it( 'accepts CSS lengths with supported units only', () => {
		expect( validateDimension( ' 480px ' ) ).toBe( '480px' );
		expect( validateDimension( '60vh' ) ).toBe( '60vh' );
		expect( validateDimension( '.5rem' ) ).toBe( '.5rem' );
		expect( validateDimension( '0' ) ).toBe( '0' );
		expect( validateDimension( '300' ) ).toBeNull();
		expect( validateDimension( 'abc' ) ).toBeNull();
		expect( validateDimension( '100%;background:red' ) ).toBeNull();
		expect( validateDimension( 'calc(100% - 1px)' ) ).toBeNull();
	} );

	it( 'normalizes aspect ratios and rejects impossible ones', () => {
		expect( validateAspectRatio( '' ) ).toBe( '' );
		expect( validateAspectRatio( '16/9' ) ).toBe( '16 / 9' );
		expect( validateAspectRatio( ' 4 / 3 ' ) ).toBe( '4 / 3' );
		expect( validateAspectRatio( '1.5' ) ).toBe( '1.5' );
		expect( validateAspectRatio( '1/0' ) ).toBeNull();
		expect( validateAspectRatio( '0' ) ).toBeNull();
		expect( validateAspectRatio( '16:9' ) ).toBeNull();
	} );

	it( 'accepts hexadecimal colors only', () => {
		expect( validateColor( '#FF4433' ) ).toBe( '#ff4433' );
		expect( validateColor( '#abc' ) ).toBe( '#abc' );
		expect( validateColor( 'red' ) ).toBeNull();
		expect( validateColor( '#ff44' ) ).toBe( '#ff44' );
		expect( validateColor( '#ff443' ) ).toBeNull();
		expect( validateColor( 'url(x)' ) ).toBeNull();
	} );

	it( 'converts stored colors for the native color input', () => {
		expect( toColorInputValue( '#abc', '#000000' ) ).toBe( '#aabbcc' );
		expect( toColorInputValue( '#abcd', '#000000' ) ).toBe( '#aabbcc' );
		expect( toColorInputValue( '#11223344', '#000000' ) ).toBe( '#112233' );
		expect( toColorInputValue( 'nope', '#ff4433' ) ).toBe( '#ff4433' );
	} );

	it( 'accepts IntersectionObserver margins of one to four values', () => {
		expect( validateRootMargin( '300px' ) ).toBe( '300px' );
		expect( validateRootMargin( ' 10px   20% ' ) ).toBe( '10px 20%' );
		expect( validateRootMargin( '-50px 0px 0px 0px' ) ).toBe(
			'-50px 0px 0px 0px'
		);
		expect( validateRootMargin( '300' ) ).toBeNull();
		expect( validateRootMargin( '1px 2px 3px 4px 5px' ) ).toBeNull();
		expect( validateRootMargin( '10em' ) ).toBeNull();
	} );

	it( 'turns percentage widths into a share of the available width', () => {
		expect( getWidthRatio( '50%' ) ).toBe( '0.5' );
		expect( getWidthRatio( ' 33.5% ' ) ).toBe( '0.335' );
		expect( getWidthRatio( '100%' ) ).toBe( '1' );
		expect( getWidthRatio( '520px' ) ).toBeNull();
		expect( getWidthRatio( '50vw' ) ).toBeNull();
		expect( getWidthRatio( '' ) ).toBeNull();
	} );
} );
