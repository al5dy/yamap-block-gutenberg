import { createElement } from '@wordpress/element';

const legacyAttributes = {
	blockAlignment: {
		type: 'string',
	},
	height: {
		type: 'string',
		default: '400px',
	},
	width: {
		type: 'string',
		default: '100%',
	},
	lat: {
		type: 'number',
		default: 53.918777,
	},
	lon: {
		type: 'number',
		default: 27.562007,
	},
	pm_lat: {
		type: 'number',
		default: 53.918777,
	},
	pm_lon: {
		type: 'number',
		default: 27.562007,
	},
	pm_balloon: {
		type: 'string',
		default: '',
	},
	pm_hint: {
		type: 'string',
		default: '',
	},
	zoom: {
		type: 'number',
		default: 10,
	},
	has_placemark: {
		type: 'boolean',
		default: false,
	},
	className: {
		type: 'string',
	},
};

const toFiniteNumber = ( value, fallback ) => {
	const number = Number( value );

	return Number.isFinite( number ) ? number : fallback;
};

const migrateLegacyAttributes = ( attributes ) => {
	const latitude = toFiniteNumber( attributes.lat, 53.918777 );
	const longitude = toFiniteNumber( attributes.lon, 27.562007 );
	const markers = [];

	if ( attributes.has_placemark ) {
		markers.push( {
			id: 'legacy-marker-1',
			coordinates: {
				latitude: toFiniteNumber( attributes.pm_lat, latitude ),
				longitude: toFiniteNumber( attributes.pm_lon, longitude ),
			},
			title: '',
			description: attributes.pm_balloon ?? '',
			hint: attributes.pm_hint ?? '',
			category: '',
			address: '',
			link: {
				url: '',
				label: '',
				newTab: false,
			},
			hideOutsideViewport: true,
			zIndex: 0,
			icon: {
				type: 'default',
				name: 'fallback',
				markerSize: 'normal',
				color: '#1e98ff',
				url: '',
				size: [ 40, 40 ],
				offset: [ -20, -40 ],
			},
		} );
	}

	return {
		schemaVersion: 2,
		center: { latitude, longitude },
		zoom: toFiniteNumber( attributes.zoom, 10 ),
		width: attributes.width || '100%',
		height: attributes.height || '400px',
		markers,
		className: attributes.className,
	};
};

const legacySave = ( { attributes } ) => {
	const style = {
		width: attributes.width,
		height: attributes.height,
		marginLeft: 'auto',
		marginRight: 'auto',
	};

	return createElement( 'div', {
		style,
		className: [
			'wp-block-gutenberg-yandex-block-map',
			attributes.className,
		]
			.filter( Boolean )
			.join( ' ' ),
		'data-params': JSON.stringify( attributes ),
	} );
};

const legacySaveWithoutGeneratedClass = ( { attributes } ) => {
	const style = {
		width: attributes.width,
		height: attributes.height,
		marginLeft: 'auto',
		marginRight: 'auto',
	};

	return createElement( 'div', {
		style,
		className: attributes.className,
		'data-params': JSON.stringify( attributes ),
	} );
};

const isLegacyBlock = ( attributes ) =>
	attributes.schemaVersion === undefined ||
	attributes.lat !== undefined ||
	attributes.lon !== undefined ||
	attributes.pm_lat !== undefined ||
	attributes.pm_lon !== undefined;

const legacySupports = {
	className: false,
	customClassName: false,
	html: true,
};

const deprecated = [
	{
		apiVersion: 1,
		attributes: legacyAttributes,
		supports: legacySupports,
		isEligible: isLegacyBlock,
		migrate: migrateLegacyAttributes,
		save: legacySave,
	},
	{
		apiVersion: 1,
		attributes: legacyAttributes,
		supports: legacySupports,
		isEligible: isLegacyBlock,
		migrate: migrateLegacyAttributes,
		save: legacySaveWithoutGeneratedClass,
	},
];

export default deprecated;
