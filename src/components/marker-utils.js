const DEFAULT_COORDINATES = {
	latitude: 55.751244,
	longitude: 37.618423,
};

const clamp = ( value, minimum, maximum ) =>
	Math.min( maximum, Math.max( minimum, value ) );

const toFiniteNumber = ( value, fallback ) => {
	const number = Number( value );

	return Number.isFinite( number ) ? number : fallback;
};

export function normalizeCoordinates(
	coordinates,
	fallback = DEFAULT_COORDINATES
) {
	const fallbackLatitude = toFiniteNumber(
		fallback?.latitude,
		DEFAULT_COORDINATES.latitude
	);
	const fallbackLongitude = toFiniteNumber(
		fallback?.longitude,
		DEFAULT_COORDINATES.longitude
	);

	let latitude;
	let longitude;

	if ( Array.isArray( coordinates ) ) {
		// Yandex Maps uses [ longitude, latitude ].
		[ longitude, latitude ] = coordinates;
	} else if ( coordinates && typeof coordinates === 'object' ) {
		latitude = coordinates.latitude ?? coordinates.lat;
		longitude =
			coordinates.longitude ??
			coordinates.longitudeDegrees ??
			coordinates.lng ??
			coordinates.lon;
	}

	return {
		latitude: clamp(
			toFiniteNumber( latitude, fallbackLatitude ),
			-90,
			90
		),
		longitude: clamp(
			toFiniteNumber( longitude, fallbackLongitude ),
			-180,
			180
		),
	};
}

export function createMarkerId() {
	if (
		typeof globalThis.crypto !== 'undefined' &&
		typeof globalThis.crypto.randomUUID === 'function'
	) {
		return globalThis.crypto.randomUUID();
	}

	return `marker-${ Date.now().toString( 36 ) }-${ Math.random()
		.toString( 36 )
		.slice( 2, 10 ) }`;
}

export function createMarker( coordinates, overrides = {} ) {
	const normalizedCoordinates = normalizeCoordinates( coordinates );
	const icon =
		overrides.icon && typeof overrides.icon === 'object'
			? overrides.icon
			: {};

	return {
		id: createMarkerId(),
		title: '',
		description: '',
		hint: '',
		category: '',
		address: '',
		link: {
			url: '',
			label: '',
			newTab: false,
		},
		draggable: false,
		mapFollowsOnDrag: true,
		hideOutsideViewport: true,
		zIndex: 0,
		...overrides,
		coordinates: normalizeCoordinates(
			overrides.coordinates ?? normalizedCoordinates,
			normalizedCoordinates
		),
		icon: {
			type: 'default',
			name: 'fallback',
			markerSize: 'normal',
			color: '#ff4433',
			url: '',
			size: [ 40, 40 ],
			offset: [ -20, -40 ],
			...icon,
		},
	};
}

export function updateMarkerById( markers, markerId, updater ) {
	return markers.map( ( marker ) => {
		if ( marker.id !== markerId ) {
			return marker;
		}

		return typeof updater === 'function'
			? updater( marker )
			: { ...marker, ...updater };
	} );
}
