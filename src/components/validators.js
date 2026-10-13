const DIMENSION_PATTERN =
	/^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|%|em|rem|vh|vw|vmin|vmax|ch))$/i;
const ASPECT_RATIO_PATTERN = /^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?$/;
const COLOR_PATTERN = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const ROOT_MARGIN_PATTERN =
	/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|%)(?:\s+-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|%)){0,3}$/;

/*
 * Each validator mirrors a rule in Config_Normalizer and returns the value in
 * its stored form, or null when the server would discard the input.
 */

export const validateDimension = ( value ) => {
	const text = String( value ?? '' ).trim();

	return text.length <= 64 && DIMENSION_PATTERN.test( text ) ? text : null;
};

/**
 * Returns a percentage width as a unitless share of the available width,
 * for example `0.5` for `50%`. Other units have no ratio.
 *
 * @param {string} value Stored width.
 * @return {string|null} Ratio for CSS, or null when the width is not a percentage.
 */
export const getWidthRatio = ( value ) => {
	const match = /^(\d+(?:\.\d+)?|\.\d+)%$/.exec(
		String( value ?? '' ).trim()
	);

	return match ? String( Number( match[ 1 ] ) / 100 ) : null;
};

export const validateAspectRatio = ( value ) => {
	const text = String( value ?? '' ).trim();
	if ( text === '' ) {
		return '';
	}

	const match = text.length <= 64 ? ASPECT_RATIO_PATTERN.exec( text ) : null;
	if ( ! match ) {
		return null;
	}

	const first = Number( match[ 1 ] );
	const second = match[ 2 ] === undefined ? 1 : Number( match[ 2 ] );
	if ( ! ( first > 0 ) || ! ( second > 0 ) ) {
		return null;
	}

	return match[ 2 ] === undefined
		? match[ 1 ]
		: `${ match[ 1 ] } / ${ match[ 2 ] }`;
};

export const validateColor = ( value ) => {
	const text = String( value ?? '' ).trim();

	return COLOR_PATTERN.test( text ) ? text.toLowerCase() : null;
};

export const validateRootMargin = ( value ) => {
	const text = String( value ?? '' )
		.trim()
		.replace( /\s+/g, ' ' );

	return text.length <= 128 && ROOT_MARGIN_PATTERN.test( text ) ? text : null;
};

/**
 * Converts a stored hex color to the six-digit form `<input type="color">`
 * requires; shorthand is expanded and any alpha channel is dropped.
 *
 * @param {string} value    Stored color.
 * @param {string} fallback Six-digit fallback color.
 * @return {string} Six-digit hex color.
 */
export const toColorInputValue = ( value, fallback ) => {
	const color = validateColor( value );
	if ( ! color ) {
		return fallback;
	}

	const digits = color.slice( 1 );
	if ( digits.length <= 4 ) {
		return `#${ digits
			.slice( 0, 3 )
			.split( '' )
			.map( ( digit ) => digit + digit )
			.join( '' ) }`;
	}

	return `#${ digits.slice( 0, 6 ) }`;
};
