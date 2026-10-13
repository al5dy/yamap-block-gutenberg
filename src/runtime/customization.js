/*
 * Yandex map customization ("styling") rules.
 *
 * The SDK does not validate this structure. A `null` rule or styler throws
 * inside its vector worker, and the raster tile server rejects every tile
 * whose style carries a key or value it does not know. Either failure leaves
 * the map without tiles, so rules are reduced to the documented schema before
 * they reach the SDK:
 * https://yandex.com/maps-api/docs/js-api/dg/concepts/customization.html
 *
 * Config_Normalizer::normalize_customization() applies the same rules on the
 * server. tests/fixtures/customization.json is run against both.
 */

export const MAX_CUSTOMIZATION_RULES = 256;
export const MAX_CUSTOMIZATION_VALUES = 4096;
export const MAX_CUSTOMIZATION_TAGS = 64;
export const MAX_CUSTOMIZATION_STYLERS = 32;

/*
 * A raster map sends the whole style in the URL of every tile. The tile server
 * answered 11,700 characters and refused 13,400 when this was measured, so a
 * style above this length is reported as too large for raster tiles.
 */
export const RASTER_STYLE_SAFE_LENGTH = 11000;

const MAX_ZOOM = 23;
const TAG_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
const COLOR_PATTERN = /^(?:#|0x)?(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const TAG_KEYS = [ 'all', 'any', 'none' ];
const TYPES = [ 'point', 'polyline', 'polygon' ];
const ELEMENTS = [
	'geometry',
	'geometry.fill',
	'geometry.fill.pattern',
	'geometry.outline',
	'label',
	'label.icon',
	'label.text',
	'label.text.fill',
	'label.text.outline',
];
const NUMBER_STYLERS = {
	saturation: [ -1, 1 ],
	lightness: [ -1, 1 ],
	opacity: [ 0, 100 ],
	scale: [ 0, 100 ],
};
// Output order of styler properties; shared with the server normalizer.
const STYLER_KEYS = [
	'visibility',
	'hue',
	'saturation',
	'lightness',
	'color',
	'secondary-color',
	'tertiary-color',
	'opacity',
	'scale',
	'zoom',
];

const isPlainObject = ( value ) =>
	value !== null && typeof value === 'object' && ! Array.isArray( value );

const isFiniteNumber = ( value ) =>
	typeof value === 'number' && Number.isFinite( value );

const isEmpty = ( value ) =>
	Array.isArray( value )
		? value.length === 0
		: isPlainObject( value ) && Object.keys( value ).length === 0;

const clamp = ( value, minimum, maximum ) =>
	Math.min( maximum, Math.max( minimum, value ) );

/**
 * Normalizes a selector that accepts one allowed word or a list of them.
 *
 * @param {*}        value   Raw selector.
 * @param {Function} isValid Whether a single word is acceptable.
 * @param {number}   limit   Maximum list length.
 * @return {string|string[]|null} Normalized selector, or null when unusable.
 */
const normalizeWords = ( value, isValid, limit ) => {
	if ( typeof value === 'string' ) {
		return isValid( value ) ? value : null;
	}
	if (
		! Array.isArray( value ) ||
		value.length === 0 ||
		value.length > limit ||
		! value.every( ( word ) => typeof word === 'string' && isValid( word ) )
	) {
		return null;
	}

	return [ ...new Set( value ) ];
};

const isTag = ( value ) => TAG_PATTERN.test( value );

/**
 * @param {*} value Raw `tags` selector.
 * @return {string|Object|null|undefined} Normalized selector, undefined when
 *                                        no selector was given, null when the
 *                                        selector cannot be applied.
 */
const normalizeTags = ( value ) => {
	if ( value === undefined || isEmpty( value ) ) {
		return undefined;
	}
	if ( typeof value === 'string' ) {
		return isTag( value ) ? value : null;
	}
	if (
		! isPlainObject( value ) ||
		Object.keys( value ).some( ( key ) => ! TAG_KEYS.includes( key ) )
	) {
		return null;
	}

	const tags = {};
	for ( const key of TAG_KEYS ) {
		if ( value[ key ] === undefined ) {
			continue;
		}

		const words = normalizeWords(
			value[ key ],
			isTag,
			MAX_CUSTOMIZATION_TAGS
		);
		if ( words === null ) {
			return null;
		}
		tags[ key ] = words;
	}

	return tags;
};

const normalizeZoom = ( value ) => {
	if ( isFiniteNumber( value ) ) {
		return clamp( value, 0, MAX_ZOOM );
	}
	if (
		! Array.isArray( value ) ||
		value.length !== 2 ||
		! value.every( isFiniteNumber )
	) {
		return null;
	}

	// The SDK expects the lesser zoom first.
	return [ Math.min( ...value ), Math.max( ...value ) ].map( ( zoom ) =>
		clamp( zoom, 0, MAX_ZOOM )
	);
};

/**
 * @param {string} key   Styler property.
 * @param {*}      value Raw value.
 * @return {*} Value accepted by the SDK, or null.
 */
const normalizeStylerValue = ( key, value ) => {
	if ( key === 'visibility' ) {
		return value === 'off' ? value : null;
	}
	if ( key === 'zoom' ) {
		return normalizeZoom( value );
	}
	if ( NUMBER_STYLERS[ key ] ) {
		return isFiniteNumber( value )
			? clamp( value, ...NUMBER_STYLERS[ key ] )
			: null;
	}

	return typeof value === 'string' && COLOR_PATTERN.test( value )
		? value
		: null;
};

/**
 * Normalizes customization rules and reports everything that was discarded.
 *
 * An unusable selector (`tags`, `types`, `elements`) discards its rule, because
 * dropping only the selector would apply the rule to every map object. An
 * unusable styler property is discarded on its own. Numbers outside the
 * supported range are clamped without a report.
 *
 * @param {*}        value  Raw customization.
 * @param {Function} report Receives `{ code, rule, path }` per discarded part.
 * @return {Object[]} Rules that are safe to pass to the SDK.
 */
const normalize = ( value, report ) => {
	if ( ! Array.isArray( value ) ) {
		return [];
	}

	const rules = [];
	let budget = MAX_CUSTOMIZATION_VALUES;

	for ( let index = 0; index < value.length; index += 1 ) {
		if ( rules.length >= MAX_CUSTOMIZATION_RULES ) {
			report( { code: 'too_many_rules', rule: index, path: '' } );
			break;
		}

		const source = value[ index ];
		const reject = ( code, path ) => report( { code, rule: index, path } );
		if ( ! isPlainObject( source ) ) {
			reject( 'rule', '' );
			continue;
		}

		const rule = {};
		let cost = 0;
		const tags = normalizeTags( source.tags );
		if ( tags === null ) {
			reject( 'value', 'tags' );
			continue;
		}
		if ( tags !== undefined ) {
			rule.tags = tags;
			cost +=
				typeof tags === 'string'
					? 1
					: Object.values( tags ).flat().length;
		}

		let selectorsAreValid = true;
		for ( const [ key, allowed ] of [
			[ 'types', TYPES ],
			[ 'elements', ELEMENTS ],
		] ) {
			if ( source[ key ] === undefined ) {
				continue;
			}

			const words = normalizeWords(
				source[ key ],
				( word ) => allowed.includes( word ),
				allowed.length
			);
			if ( words === null ) {
				reject( 'value', key );
				selectorsAreValid = false;
				break;
			}
			rule[ key ] = words;
			cost += [ words ].flat().length;
		}
		if ( ! selectorsAreValid ) {
			continue;
		}

		const rawStylers = isPlainObject( source.stylers )
			? [ source.stylers ]
			: source.stylers;
		if ( rawStylers !== undefined && ! Array.isArray( rawStylers ) ) {
			reject( 'value', 'stylers' );
			continue;
		}

		const stylers = [];
		( rawStylers ?? [] ).forEach( ( rawStyler, stylerIndex ) => {
			const path = `stylers[${ stylerIndex }]`;
			if ( stylers.length >= MAX_CUSTOMIZATION_STYLERS ) {
				if ( stylerIndex === MAX_CUSTOMIZATION_STYLERS ) {
					reject( 'too_many_stylers', path );
				}
				return;
			}
			if ( ! isPlainObject( rawStyler ) ) {
				reject( 'value', path );
				return;
			}

			const styler = {};
			Object.keys( rawStyler ).forEach( ( key ) => {
				if ( ! STYLER_KEYS.includes( key ) ) {
					reject( 'key', `${ path }.${ key }` );
				}
			} );
			STYLER_KEYS.forEach( ( key ) => {
				if ( rawStyler[ key ] === undefined ) {
					return;
				}

				const normalized = normalizeStylerValue(
					key,
					rawStyler[ key ]
				);
				if ( normalized === null ) {
					reject( 'value', `${ path }.${ key }` );
					return;
				}
				styler[ key ] = normalized;
			} );

			if ( Object.keys( styler ).length ) {
				stylers.push( styler );
				cost += Object.keys( styler ).length;
			}
		} );

		if ( ! stylers.length ) {
			reject( 'no_stylers', 'stylers' );
			continue;
		}
		rule.stylers = stylers;

		if ( cost > budget ) {
			report( { code: 'too_large', rule: index, path: '' } );
			break;
		}
		budget -= cost;
		rules.push( rule );
	}

	return rules;
};

/**
 * Returns the customization rules that are safe to pass to the SDK.
 *
 * @param {*} value Raw customization.
 * @return {Object[]} Normalized rules.
 */
export function normalizeCustomization( value ) {
	return normalize( value, () => {} );
}

/**
 * Lists the parts of a customization that would not reach the map.
 *
 * Codes: `rule` (not an object), `value` (unsupported value), `key`
 * (unsupported styler property), `no_stylers`, `too_many_rules`,
 * `too_many_stylers` and `too_large`.
 *
 * @param {*} value Raw customization.
 * @return {Array<{code: string, rule: number, path: string}>} Issues, in order.
 */
export function validateCustomization( value ) {
	const issues = [];
	normalize( value, ( issue ) => issues.push( issue ) );

	return issues;
}

const toList = ( value ) => [ value ].flat();

/**
 * Estimates the length of the `style` parameter a raster map adds to every
 * tile URL for these rules.
 *
 * @param {Object[]} rules Normalized customization rules.
 * @return {number} Estimated length in characters.
 */
export function estimateRasterStyleLength( rules ) {
	return rules
		.map( ( rule ) => {
			const parts = [];
			if ( typeof rule.tags === 'string' ) {
				parts.push( `tags.all:${ rule.tags }` );
			} else if ( rule.tags ) {
				Object.entries( rule.tags ).forEach( ( [ key, tags ] ) =>
					parts.push(
						`tags.${ key }:${ toList( tags ).join( ';' ) }`
					)
				);
			}
			[ 'types', 'elements' ].forEach( ( key ) => {
				if ( rule[ key ] ) {
					parts.push(
						`${ key }:${ toList( rule[ key ] ).join( ';' ) }`
					);
				}
			} );
			rule.stylers.forEach( ( { zoom, ...properties } ) => {
				const range =
					zoom === undefined
						? ''
						: `[${ toList( zoom ).join( '-' ) }]`;
				Object.entries( properties ).forEach( ( [ key, value ] ) =>
					parts.push(
						`stylers${ range }.${ key }:${ String( value ).replace(
							/^(?:#|0x)/i,
							''
						) }`
					)
				);
			} );

			return parts.join( '|' );
		} )
		.join( '~' ).length;
}
