/**
 * Screen space a marker needs around its coordinate, in CSS pixels.
 *
 * The default pin is anchored at its tip, so it extends upwards from the
 * coordinate; a viewport fitted exactly to coordinates would cut it off.
 */
const MARKER_SAFE_AREA = { top: 72, right: 32, bottom: 20, left: 32 };
const FALLBACK_FRACTIONS = { top: 0.15, right: 0.08, bottom: 0.05, left: 0.08 };
const MAX_FRACTION = 0.3;
const MAX_MERCATOR_LATITUDE = 85.05112878;
const POINT_EPSILON = 1e-9;

const clamp = ( value, minimum, maximum ) =>
	Math.min( maximum, Math.max( minimum, value ) );

const toMercatorY = ( latitude ) =>
	Math.log(
		Math.tan(
			Math.PI / 4 +
				( clamp(
					latitude,
					-MAX_MERCATOR_LATITUDE,
					MAX_MERCATOR_LATITUDE
				) *
					Math.PI ) /
					360
		)
	);

const fromMercatorY = ( y ) =>
	( Math.atan( Math.exp( y ) ) * 360 ) / Math.PI - 90;

/**
 * Returns the Yandex bounds (top-left, bottom-right) covering all features.
 *
 * @param {Object[]} features GeoJSON-like point features.
 * @return {number[][]} Longitude/latitude bounds.
 */
export function getFeatureBounds( features ) {
	let minLongitude = Infinity;
	let minLatitude = Infinity;
	let maxLongitude = -Infinity;
	let maxLatitude = -Infinity;

	features.forEach( ( feature ) => {
		const [ longitude, latitude ] = feature.geometry.coordinates;
		minLongitude = Math.min( minLongitude, longitude );
		maxLongitude = Math.max( maxLongitude, longitude );
		minLatitude = Math.min( minLatitude, latitude );
		maxLatitude = Math.max( maxLatitude, latitude );
	} );

	return [
		[ minLongitude, maxLatitude ],
		[ maxLongitude, minLatitude ],
	];
}

/**
 * Whether bounds collapse to a single point and cannot define a zoom level.
 *
 * @param {number[][]} bounds Longitude/latitude bounds.
 * @return {boolean} True for zero-area bounds.
 */
export function isPointBounds( bounds ) {
	return (
		Math.abs( bounds[ 1 ][ 0 ] - bounds[ 0 ][ 0 ] ) < POINT_EPSILON &&
		Math.abs( bounds[ 0 ][ 1 ] - bounds[ 1 ][ 1 ] ) < POINT_EPSILON
	);
}

/**
 * Expands coordinate bounds so markers placed on them stay fully visible.
 *
 * Latitude is padded in Web Mercator space, matching how the map projects it.
 *
 * @param {number[][]} bounds Longitude/latitude bounds.
 * @param {Object}     size   Viewport size in CSS pixels.
 * @return {number[][]} Padded bounds.
 */
export function fitBoundsToViewport( bounds, size = {} ) {
	const fraction = ( side, length ) =>
		length > 0
			? Math.min( MAX_FRACTION, MARKER_SAFE_AREA[ side ] / length )
			: FALLBACK_FRACTIONS[ side ];
	const top = fraction( 'top', size.height );
	const bottom = fraction( 'bottom', size.height );
	const left = fraction( 'left', size.width );
	const right = fraction( 'right', size.width );
	const [ [ west, north ], [ east, south ] ] = bounds;

	const longitudeSpan = ( east - west ) / ( 1 - left - right );
	const northY = toMercatorY( north );
	const southY = toMercatorY( south );
	const mercatorSpan = ( northY - southY ) / ( 1 - top - bottom );

	return [
		[
			clamp( west - longitudeSpan * left, -180, 180 ),
			fromMercatorY( northY + mercatorSpan * top ),
		],
		[
			clamp( east + longitudeSpan * right, -180, 180 ),
			fromMercatorY( southY - mercatorSpan * bottom ),
		],
	];
}
