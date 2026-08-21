const BEHAVIORS = new Set( [
	'drag',
	'pinchZoom',
	'scrollZoom',
	'dblClick',
	'magnifier',
	'oneFingerZoom',
	'mouseRotate',
	'mouseTilt',
	'pinchRotate',
	'panTilt',
] );

const LANGUAGES = new Set( [
	'ru_RU',
	'ru_UA',
	'uk_UA',
	'tr_TR',
	'en_RU',
	'en_US',
	'he_IL',
	'en_IL',
] );

const MAX_INLINE_MARKERS = 1000;
const MAX_STRUCTURED_DEPTH = 6;
const MAX_STRUCTURED_ITEMS = 256;
const MAX_STRUCTURED_STRING_LENGTH = 2048;

const numberInRange = ( value, fallback, min, max ) => {
	const number = Number( value );
	return Number.isFinite( number )
		? Math.min( max, Math.max( min, number ) )
		: fallback;
};

const stringValue = ( value, fallback = '', maximumLength = 5000 ) =>
	typeof value === 'string' ? value.slice( 0, maximumLength ) : fallback;

const booleanValue = ( value, fallback = false ) =>
	typeof value === 'boolean' ? value : fallback;

const normalizeRootMargin = ( value ) => {
	const margin = stringValue( value, '300px' ).trim();
	const parts = margin.split( /\s+/ );
	const isValid =
		parts.length >= 1 &&
		parts.length <= 4 &&
		parts.every( ( part ) => /^-?(?:\d+|\d*\.\d+)(?:px|%)$/.test( part ) );

	return isValid ? margin : '300px';
};

const normalizeCoordinates = ( value, fallback ) => ( {
	latitude: numberInRange( value?.latitude, fallback.latitude, -90, 90 ),
	longitude: numberInRange( value?.longitude, fallback.longitude, -180, 180 ),
} );

const normalizePair = ( value, fallback, min, max ) => {
	if ( ! Array.isArray( value ) || value.length !== 2 ) {
		return fallback;
	}

	return [
		numberInRange( value[ 0 ], fallback[ 0 ], min, max ),
		numberInRange( value[ 1 ], fallback[ 1 ], min, max ),
	];
};

const normalizeColor = ( value, fallback ) => {
	const color = stringValue( value, '', 9 ).trim();

	return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test( color )
		? color.toLowerCase()
		: fallback;
};

const sanitizeStructuredValue = ( value, depth = 0 ) => {
	if ( depth > MAX_STRUCTURED_DEPTH ) {
		return null;
	}

	if ( Array.isArray( value ) ) {
		return value
			.slice( 0, MAX_STRUCTURED_ITEMS )
			.map( ( item ) => sanitizeStructuredValue( item, depth + 1 ) );
	}

	if ( value && typeof value === 'object' ) {
		const output = {};
		Object.entries( value )
			.slice( 0, MAX_STRUCTURED_ITEMS )
			.forEach( ( [ key, childValue ] ) => {
				if (
					[ '__proto__', 'prototype', 'constructor' ].includes(
						key.toLowerCase()
					) ||
					! /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test( key )
				) {
					return;
				}
				output[ key ] = sanitizeStructuredValue(
					childValue,
					depth + 1
				);
			} );

		return output;
	}

	if ( typeof value === 'string' ) {
		return value.slice( 0, MAX_STRUCTURED_STRING_LENGTH );
	}

	if ( typeof value === 'number' ) {
		return Number.isFinite( value ) ? value : null;
	}

	return typeof value === 'boolean' || value === null ? value : null;
};

const sanitizeNamespaceBag = ( value ) =>
	value && typeof value === 'object' && ! Array.isArray( value )
		? sanitizeStructuredValue( value )
		: {};

const normalizeMarker = ( marker, index, center ) => {
	const source = marker && typeof marker === 'object' ? marker : {};
	const coordinates = normalizeCoordinates(
		source.coordinates || {
			latitude: source.latitude,
			longitude: source.longitude,
		},
		center
	);
	const icon =
		source.icon && typeof source.icon === 'object' ? source.icon : {};
	const type = [ 'default', 'image' ].includes( icon.type )
		? icon.type
		: 'default';
	const markerSize = [ 'normal', 'small', 'micro' ].includes(
		icon.markerSize
	)
		? icon.markerSize
		: 'normal';

	return {
		id: stringValue( source.id, `marker-${ index + 1 }`, 128 ),
		coordinates,
		title: stringValue( source.title, '', 300 ),
		description: stringValue( source.description, '', 5000 ),
		hint: stringValue( source.hint, '', 300 ),
		category: stringValue( source.category, '', 128 ),
		address: stringValue( source.address, '', 500 ),
		icon: {
			type,
			color: normalizeColor( icon.color, '#ff4433' ),
			url: stringValue( icon.url, '', 2048 ),
			name: stringValue( icon.name, 'fallback', 128 ),
			markerSize,
			size: normalizePair( icon.size, [ 40, 40 ], 1, 512 ),
			offset: normalizePair( icon.offset, [ -20, -40 ], -512, 512 ),
		},
		draggable: booleanValue( source.draggable ),
		mapFollowsOnDrag: booleanValue( source.mapFollowsOnDrag, true ),
		hideOutsideViewport: booleanValue( source.hideOutsideViewport, true ),
		zIndex: numberInRange( source.zIndex, index, -100000, 100000 ),
		link: {
			url: stringValue( source.link?.url, '', 2048 ),
			label: stringValue( source.link?.label, '', 300 ),
			newTab: booleanValue( source.link?.newTab ),
		},
	};
};

const normalizeMarkers = ( markers, center ) => {
	const identifiers = new Set();

	return markers.slice( 0, MAX_INLINE_MARKERS ).map( ( marker, index ) => {
		const normalized = normalizeMarker( marker, index, center );
		const baseIdentifier = normalized.id || `marker-${ index + 1 }`;
		let identifier = baseIdentifier;
		let suffix = 2;

		while ( identifiers.has( identifier ) ) {
			const suffixText = `-${ suffix }`;
			identifier = `${ baseIdentifier.slice(
				0,
				128 - suffixText.length
			) }${ suffixText }`;
			suffix += 1;
		}

		identifiers.add( identifier );
		normalized.id = identifier;

		return normalized;
	} );
};

const normalizeBounds = ( value ) => {
	if (
		! Array.isArray( value ) ||
		value.length !== 2 ||
		! Array.isArray( value[ 0 ] ) ||
		! Array.isArray( value[ 1 ] )
	) {
		return false;
	}

	const firstLongitude = numberInRange( value[ 0 ][ 0 ], -180, -180, 180 );
	const firstLatitude = numberInRange( value[ 0 ][ 1 ], 90, -90, 90 );
	const secondLongitude = numberInRange( value[ 1 ][ 0 ], 180, -180, 180 );
	const secondLatitude = numberInRange( value[ 1 ][ 1 ], -90, -90, 90 );

	return [
		[
			Math.min( firstLongitude, secondLongitude ),
			Math.max( firstLatitude, secondLatitude ),
		],
		[
			Math.max( firstLongitude, secondLongitude ),
			Math.min( firstLatitude, secondLatitude ),
		],
	];
};

/**
 * Normalizes both server-provided configuration and live editor attributes.
 *
 * @param {Object} input Raw configuration.
 * @return {Object} Safe runtime configuration.
 */
export function normalizeConfig( input = {} ) {
	const center = normalizeCoordinates( input.center, {
		latitude: 55.751244,
		longitude: 37.618423,
	} );
	const zoomRange = {
		min: numberInRange( input.zoomRange?.min, 1, 0, 23 ),
		max: numberInRange( input.zoomRange?.max, 21, 0, 23 ),
	};
	if ( zoomRange.min > zoomRange.max ) {
		[ zoomRange.min, zoomRange.max ] = [ zoomRange.max, zoomRange.min ];
	}

	const controls = input.controls || {};
	const mapOptions = input.mapOptions || {};
	const cluster = input.cluster || {};
	const loading = input.loading || {};
	const preloader = loading.preloader || {};
	const markers = Array.isArray( input.markers ) ? input.markers : [];
	const theme = [ 'auto', 'light', 'dark' ].includes( input.theme )
		? input.theme
		: 'auto';
	const mapMode = [ 'auto', 'raster', 'vector' ].includes( input.mapMode )
		? input.mapMode
		: 'auto';
	const language = LANGUAGES.has( input.language ) ? input.language : 'en_US';

	return {
		schemaVersion: 2,
		apiKey: stringValue( input.apiKey, '', 256 ),
		language,
		center,
		zoom: numberInRange( input.zoom, 12, zoomRange.min, zoomRange.max ),
		zoomRange,
		camera: {
			tilt: numberInRange( input.camera?.tilt, 0, 0, 50 ),
			azimuth: numberInRange( input.camera?.azimuth, 0, -180, 180 ),
		},
		mapMode,
		theme,
		behaviors: Array.isArray( input.behaviors )
			? [
					...new Set(
						input.behaviors.filter( ( item ) =>
							BEHAVIORS.has( item )
						)
					),
			  ]
			: [ 'drag', 'scrollZoom', 'pinchZoom', 'dblClick' ],
		controls: {
			zoom: booleanValue( controls.zoom, true ),
			geolocation: booleanValue( controls.geolocation, true ),
			fullscreen: booleanValue( controls.fullscreen, true ),
			position: [ 'left', 'right', 'top', 'bottom' ].includes(
				controls.position
			)
				? controls.position
				: 'right',
		},
		mapOptions: {
			copyrightsPosition: [
				'bottom right',
				'bottom left',
				'top right',
				'top left',
			].includes( mapOptions.copyrightsPosition )
				? mapOptions.copyrightsPosition
				: 'bottom right',
			showScaleInCopyrights: booleanValue(
				mapOptions.showScaleInCopyrights,
				true
			),
			zoomRounding: [ 'auto', 'smooth', 'snap' ].includes(
				mapOptions.zoomRounding
			)
				? mapOptions.zoomRounding
				: 'auto',
			zoomStrategy: [ 'zoomToPointer', 'zoomToCenter' ].includes(
				mapOptions.zoomStrategy
			)
				? mapOptions.zoomStrategy
				: 'zoomToPointer',
			restrictMapArea: normalizeBounds( mapOptions.restrictMapArea ),
			margin: Array.isArray( mapOptions.margin )
				? mapOptions.margin
						.slice( 0, 4 )
						.map( ( item ) => numberInRange( item, 0, 0, 2000 ) )
				: [ 0, 0, 0, 0 ],
			fitToMarkers: booleanValue( mapOptions.fitToMarkers ),
		},
		customization: Array.isArray( input.customization )
			? sanitizeStructuredValue( input.customization )
			: [],
		markers: normalizeMarkers( markers, center ),
		cluster: {
			enabled: booleanValue( cluster.enabled, true ),
			gridSize: numberInRange( cluster.gridSize, 64, 16, 256 ),
			maxZoom: numberInRange( cluster.maxZoom, 18, 0, 23 ),
			color: normalizeColor( cluster.color, '#ff4433' ),
		},
		loading: {
			lazy: booleanValue( loading.lazy, true ),
			rootMargin: normalizeRootMargin( loading.rootMargin ),
			clickToActivate: booleanValue( loading.clickToActivate ),
			preloader: {
				enabled: booleanValue( preloader.enabled ),
				type: [ 'spinner', 'dots', 'pulse' ].includes( preloader.type )
					? preloader.type
					: 'spinner',
				color: normalizeColor( preloader.color, '#3858e9' ),
				backgroundColor: normalizeColor(
					preloader.backgroundColor,
					'#eef1f5'
				),
				size: Math.round( numberInRange( preloader.size, 48, 24, 96 ) ),
				transitionDuration: Math.round(
					numberInRange( preloader.transitionDuration, 300, 0, 2000 )
				),
				label: stringValue(
					preloader.label,
					input.i18n?.loading || 'Loading map…',
					160
				),
			},
		},
		ariaLabel: stringValue( input.ariaLabel, 'Interactive map', 300 ),
		fallbackText: stringValue(
			input.fallbackText,
			'Open this location in Yandex Maps',
			500
		),
		templateId: Math.trunc(
			numberInRange( input.templateId, 0, 0, Number.MAX_SAFE_INTEGER )
		),
		overrides: sanitizeNamespaceBag( input.overrides ),
		extensions: sanitizeNamespaceBag( input.extensions ),
		i18n: {
			activate: stringValue( input.i18n?.activate, 'Activate map', 300 ),
			fullscreen: stringValue(
				input.i18n?.fullscreen,
				'Toggle fullscreen map',
				300
			),
			loading: stringValue( input.i18n?.loading, 'Loading map…', 300 ),
			error: stringValue(
				input.i18n?.error,
				'The map could not be loaded.',
				500
			),
		},
	};
}

export function toLngLat( coordinates ) {
	return [ coordinates.longitude, coordinates.latitude ];
}
