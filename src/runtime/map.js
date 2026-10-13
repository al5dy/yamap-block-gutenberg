import { getYandexApiWindow, loadYandexApi } from './api-loader';
import { fitBoundsToViewport, getFeatureBounds, isPointBounds } from './bounds';
import {
	prepareMapHost,
	releaseMapHost,
	waitForMapHostStyles,
} from './map-element';
import { normalizeConfig, toLngLat } from './normalize';

const INSTANCES = new WeakMap();
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const ICON_NAME_PATTERN = /^[a-z0-9_]{1,64}$/;
const FALLBACK_ICON_NAME = 'fallback';
const OPEN_POPUP_Z_INDEX = 100001;
const USER_LOCATION_Z_INDEX = 100002;
const NOTICE_DURATION = 6000;
const GEOLOCATION_PERMISSION_DENIED = 1;

/**
 * Public error codes reported through `data-error-code`, the `guyamap:error`
 * event and the administrator diagnostics. Unknown failures map to `render`.
 */
const ERROR_CODES = [
	'missing_api_key',
	'api_key_rejected',
	'network',
	'csp',
	'timeout',
	'api_unavailable',
	'load_failed',
	'render',
];

const TWO_PI = Math.PI * 2;

const degreesToRadians = ( degrees ) => ( degrees * Math.PI ) / 180;

/**
 * Returns the azimuth to request so an animated camera turns the short way.
 *
 * The SDK animates from its current azimuth, which it keeps within one turn,
 * to the requested number. Asking for -170° while the map is at 170° would
 * therefore spin it by 340° instead of 20°.
 *
 * @param {Object} map     Yandex map.
 * @param {number} azimuth Wanted azimuth in radians.
 * @return {number} Equivalent azimuth nearest to the current one.
 */
const getNearestAzimuth = ( map, azimuth ) => {
	const current = Number( map?.azimuth );
	if ( ! Number.isFinite( current ) ) {
		return azimuth;
	}

	let turn = ( azimuth - current ) % TWO_PI;
	if ( turn > Math.PI ) {
		turn -= TWO_PI;
	} else if ( turn < -Math.PI ) {
		turn += TWO_PI;
	}

	return current + turn;
};

const runtimeString = ( value, fallback = '', maximumLength = 2048 ) =>
	typeof value === 'string' ? value.slice( 0, maximumLength ) : fallback;

const runtimeErrorDetails = ( value ) => {
	const source = value && typeof value === 'object' ? value : {};
	const details = {};
	ERROR_CODES.forEach( ( code ) => {
		const text = runtimeString( source[ code ], '', 600 );
		if ( text ) {
			details[ code ] = text;
		}
	} );

	return details;
};

const withRuntimeConfig = ( rawConfig ) => {
	const input = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
	const config = normalizeConfig( input );
	const runtimeI18n =
		input.i18n && typeof input.i18n === 'object' ? input.i18n : {};

	return {
		...config,
		baseUrl: runtimeString( input.baseUrl ),
		fallbackUrl: runtimeString( input.fallbackUrl ),
		iconBaseUrl: runtimeString( input.iconBaseUrl ),
		styleUrl: runtimeString( input.styleUrl ),
		settingsUrl: runtimeString( input.settingsUrl ),
		diagnostics: input.diagnostics === true,
		instanceId: runtimeString( input.instanceId, '', 128 ),
		i18n: {
			...config.i18n,
			errorDetails: runtimeErrorDetails( runtimeI18n.errorDetails ),
			adminOnly: runtimeString(
				runtimeI18n.adminOnly,
				'Only administrators see these details.',
				300
			),
			openSettings: runtimeString(
				runtimeI18n.openSettings,
				'Open map settings',
				300
			),
			geolocationDenied: runtimeString(
				runtimeI18n.geolocationDenied,
				'Location access was denied.',
				500
			),
			userLocation: runtimeString(
				runtimeI18n.userLocation,
				'Your location',
				300
			),
			marker: runtimeString( runtimeI18n.marker, 'Map marker', 300 ),
			clusterMarkers: runtimeString(
				runtimeI18n.clusterMarkers,
				'Cluster of %d map markers',
				300
			),
			zoomIn: runtimeString( runtimeI18n.zoomIn, 'Zoom in', 300 ),
			zoomOut: runtimeString( runtimeI18n.zoomOut, 'Zoom out', 300 ),
			geolocate: runtimeString(
				runtimeI18n.geolocate,
				'Show my location',
				300
			),
			geolocationError: runtimeString(
				runtimeI18n.geolocationError,
				'Your location could not be determined.',
				500
			),
		},
	};
};

const safeUrl = ( value, ownerWindow, baseUrl = '' ) => {
	if ( ! value ) {
		return '';
	}

	try {
		const base = baseUrl || ownerWindow.location?.href;
		const url = new ownerWindow.URL( value, base );
		return [ 'http:', 'https:' ].includes( url.protocol ) ? url.href : '';
	} catch {
		return '';
	}
};

const resolveTheme = ( theme, ownerWindow ) => {
	if ( theme !== 'auto' ) {
		return theme;
	}

	return ownerWindow.matchMedia?.( '(prefers-color-scheme: dark)' ).matches
		? 'dark'
		: 'light';
};

const prefersReducedMotion = ( ownerWindow ) =>
	ownerWindow.matchMedia?.( '(prefers-reduced-motion: reduce)' ).matches ===
	true;

const createTextElement = ( ownerDocument, tagName, className, text ) => {
	const element = ownerDocument.createElement( tagName );
	element.className = className;
	element.textContent = text;
	return element;
};

const createPopupContent = ( marker, context ) => {
	const { config, ownerDocument, ownerWindow } = context;
	const popup = ownerDocument.createElement( 'article' );
	popup.className = 'guyamap-popup';

	if ( marker.category ) {
		popup.appendChild(
			createTextElement(
				ownerDocument,
				'p',
				'guyamap-popup__category',
				marker.category
			)
		);
	}

	if ( marker.title ) {
		popup.appendChild(
			createTextElement(
				ownerDocument,
				'h3',
				'guyamap-popup__title',
				marker.title
			)
		);
	}

	if ( marker.description ) {
		popup.appendChild(
			createTextElement(
				ownerDocument,
				'p',
				'guyamap-popup__description',
				marker.description
			)
		);
	}

	if ( marker.address ) {
		popup.appendChild(
			createTextElement(
				ownerDocument,
				'p',
				'guyamap-popup__address',
				marker.address
			)
		);
	}

	const linkUrl = safeUrl( marker.link.url, ownerWindow, config.baseUrl );
	if ( linkUrl ) {
		const link = createTextElement(
			ownerDocument,
			'a',
			'guyamap-popup__link',
			marker.link.label || marker.title || linkUrl
		);
		link.href = linkUrl;
		if ( marker.link.newTab ) {
			link.target = '_blank';
			link.rel = 'noopener noreferrer';
		}
		popup.appendChild( link );
	}

	return popup;
};

const hasMarkerPopupContent = ( marker, context ) =>
	Boolean(
		marker.title ||
			marker.category ||
			marker.description ||
			marker.address ||
			safeUrl(
				marker.link.url,
				context.ownerWindow,
				context.config.baseUrl
			)
	);

const setEntityZIndex = ( entity, zIndex ) => {
	try {
		entity?.update?.( { zIndex } );
	} catch {
		// A clusterer may already have detached the marker entity.
	}
};

const closePopup = ( controller, restoreFocus = false ) => {
	const record = controller?.openPopup;
	if ( ! record ) {
		return;
	}

	controller.openPopup = null;
	record.popup.hidden = true;
	record.button.setAttribute( 'aria-expanded', 'false' );
	record.wrapper.classList.remove( 'guyamap-marker--open' );
	setEntityZIndex( record.entity, record.zIndex );
	if ( restoreFocus ) {
		record.button.focus();
	}
};

/**
 * Keeps an opened popup inside the visible map area: it flips below the
 * marker when there is no room above and shifts sideways near the edges.
 *
 * @param {Object} controller Map controller.
 * @param {Object} record     Popup record.
 */
const positionPopup = ( controller, record ) => {
	const { popup, wrapper } = record;
	popup.classList.remove( 'guyamap-popup--below' );
	popup.style.marginLeft = '';
	popup.style.marginRight = '';

	const bounds = controller.surface.getBoundingClientRect();
	if ( ! bounds.width || ! bounds.height ) {
		return;
	}

	const gap = 8;
	popup.style.setProperty(
		'--guyamap-popup-max-height',
		`${ Math.max( 80, Math.round( bounds.height - gap * 2 ) ) }px`
	);
	const anchor = wrapper.getBoundingClientRect();
	let rect = popup.getBoundingClientRect();
	const roomAbove = anchor.top - bounds.top;
	const roomBelow = bounds.bottom - anchor.bottom;
	if ( rect.top < bounds.top + gap && roomBelow > roomAbove ) {
		popup.classList.add( 'guyamap-popup--below' );
		rect = popup.getBoundingClientRect();
	}

	let shift = 0;
	if ( rect.left < bounds.left + gap ) {
		shift = bounds.left + gap - rect.left;
	} else if ( rect.right > bounds.right - gap ) {
		shift = bounds.right - gap - rect.right;
	}
	if ( shift ) {
		// Only the margin on the anchored side applies, so setting both moves
		// the popup by the same physical distance in LTR and RTL layouts.
		popup.style.marginLeft = `${ Math.round( shift ) }px`;
		popup.style.marginRight = `${ Math.round( -shift ) }px`;
	}
};

const openPopup = ( controller, record ) => {
	closePopup( controller );
	record.popup.hidden = false;
	record.button.setAttribute( 'aria-expanded', 'true' );
	record.wrapper.classList.add( 'guyamap-marker--open' );
	// Lift the marker so its popup is never covered by neighbouring markers.
	setEntityZIndex( record.entity, OPEN_POPUP_Z_INDEX );
	if ( controller ) {
		controller.openPopup = record;
		positionPopup( controller, record );
	}
};

/**
 * Adds a single-open, dismissible popup to a marker.
 *
 * @param {HTMLElement} wrapper    Marker root.
 * @param {HTMLElement} button     Marker trigger.
 * @param {Object}      marker     Normalized marker.
 * @param {string}      internalId Marker DOM identifier.
 * @param {Object}      context    Render context.
 * @return {Object} Popup record; the caller attaches the marker entity.
 */
const attachMarkerPopup = ( wrapper, button, marker, internalId, context ) => {
	const { controller } = context;
	const popup = createPopupContent( marker, context );
	const popupId = `${ internalId }-popup`;
	const markerClass = wrapper.classList.contains( 'guyamap-image-marker' )
		? 'guyamap-image-marker__popup'
		: 'guyamap-default-marker__popup';
	const record = {
		wrapper,
		button,
		popup,
		entity: null,
		zIndex: marker.zIndex,
	};

	popup.classList.add( markerClass );
	popup.id = popupId;
	popup.hidden = true;
	button.setAttribute( 'aria-controls', popupId );
	button.setAttribute( 'aria-expanded', 'false' );
	button.addEventListener( 'click', () => {
		if ( popup.hidden ) {
			openPopup( controller, record );
		} else if ( controller ) {
			closePopup( controller );
		} else {
			popup.hidden = true;
			button.setAttribute( 'aria-expanded', 'false' );
		}
	} );
	wrapper.addEventListener( 'keydown', ( event ) => {
		if ( event.key !== 'Escape' || popup.hidden ) {
			return;
		}

		event.stopPropagation();
		closePopup( controller, true );
	} );
	wrapper.appendChild( popup );

	return record;
};

/**
 * Closes the open popup when the visitor clicks elsewhere. A drag that merely
 * starts outside the popup pans the map and keeps the popup open.
 *
 * @param {Object} controller Map controller.
 */
const registerPopupDismissal = ( controller ) => {
	const { ownerDocument } = controller;
	let pressedAt = null;

	const isOutside = ( event ) => {
		const record = controller.openPopup;
		if ( ! record ) {
			return false;
		}

		const path =
			typeof event.composedPath === 'function'
				? event.composedPath()
				: [];
		return ! path.includes( record.wrapper );
	};
	const handlePointerDown = ( event ) => {
		pressedAt = isOutside( event )
			? { x: event.clientX, y: event.clientY }
			: null;
	};
	const handlePointerUp = ( event ) => {
		if ( ! pressedAt ) {
			return;
		}

		const distance = Math.hypot(
			event.clientX - pressedAt.x,
			event.clientY - pressedAt.y
		);
		pressedAt = null;
		if ( distance < 6 ) {
			closePopup( controller );
		}
	};

	ownerDocument.addEventListener( 'pointerdown', handlePointerDown, true );
	ownerDocument.addEventListener( 'pointerup', handlePointerUp, true );
	controller.cleanups.push( () => {
		ownerDocument.removeEventListener(
			'pointerdown',
			handlePointerDown,
			true
		);
		ownerDocument.removeEventListener( 'pointerup', handlePointerUp, true );
	} );
};

/**
 * Adds a visible tooltip for the marker hint. The trigger's accessible name
 * already carries the same text, so the tooltip is hidden from assistive
 * technology and shown on both pointer hover and keyboard focus.
 *
 * @param {HTMLElement} wrapper Marker root.
 * @param {Object}      marker  Normalized marker.
 * @param {Object}      context Render context.
 */
const attachMarkerHint = ( wrapper, marker, context ) => {
	if ( ! marker.hint ) {
		return;
	}

	const hint = createTextElement(
		context.ownerDocument,
		'span',
		'guyamap-marker-hint',
		marker.hint
	);
	hint.setAttribute( 'aria-hidden', 'true' );
	wrapper.appendChild( hint );
};

const createPinSvg = ( ownerDocument ) => {
	const svg = ownerDocument.createElementNS( SVG_NAMESPACE, 'svg' );
	svg.classList.add( 'guyamap-default-marker__pin' );
	svg.setAttribute( 'aria-hidden', 'true' );
	svg.setAttribute( 'focusable', 'false' );
	svg.setAttribute( 'viewBox', '0 0 46 61' );

	const body = ownerDocument.createElementNS( SVG_NAMESPACE, 'path' );
	body.setAttribute(
		'd',
		'M23 1C10.85 1 1 10.85 1 23c0 14.8 17.2 32.8 22 37 4.8-4.2 22-22.2 22-37C45 10.85 35.15 1 23 1Z'
	);
	body.setAttribute( 'fill', 'currentColor' );
	svg.appendChild( body );

	const center = ownerDocument.createElementNS( SVG_NAMESPACE, 'circle' );
	center.setAttribute( 'cx', '23' );
	center.setAttribute( 'cy', '23' );
	center.setAttribute( 'r', '14' );
	center.setAttribute( 'fill', '#fff' );
	svg.appendChild( center );

	return svg;
};

const getIconUrl = ( iconName, context ) => {
	const { config, ownerWindow } = context;
	const iconBaseUrl = safeUrl(
		config.iconBaseUrl,
		ownerWindow,
		config.baseUrl
	);
	if ( ! iconBaseUrl ) {
		return '';
	}

	try {
		const base = iconBaseUrl.endsWith( '/' )
			? iconBaseUrl
			: `${ iconBaseUrl }/`;
		return new ownerWindow.URL( `${ iconName }_24.svg`, base ).href;
	} catch {
		return '';
	}
};

const getMarkerIconUrl = ( marker, context ) =>
	getIconUrl(
		ICON_NAME_PATTERN.test( marker.icon.name )
			? marker.icon.name
			: FALLBACK_ICON_NAME,
		context
	);

const createDefaultMarkerElement = ( marker, internalId, context ) => {
	const { ownerDocument } = context;
	const wrapper = ownerDocument.createElement( 'div' );
	wrapper.className = `guyamap-default-marker guyamap-default-marker--${ marker.icon.markerSize }`;
	wrapper.style.setProperty( '--guyamap-marker-color', marker.icon.color );

	const hasPopup = hasMarkerPopupContent( marker, context );
	const trigger = ownerDocument.createElement( hasPopup ? 'button' : 'span' );
	trigger.className = 'guyamap-default-marker__trigger';
	if ( hasPopup ) {
		trigger.type = 'button';
		trigger.classList.add( 'guyamap-default-marker__button' );
	} else {
		trigger.setAttribute( 'role', 'img' );
	}
	trigger.setAttribute(
		'aria-label',
		marker.hint || marker.title || context.config.i18n.marker
	);

	const visual = ownerDocument.createElement( 'span' );
	visual.className = 'guyamap-default-marker__visual';
	visual.setAttribute( 'aria-hidden', 'true' );
	if ( marker.icon.markerSize === 'normal' ) {
		visual.appendChild( createPinSvg( ownerDocument ) );
	}

	if ( marker.icon.markerSize !== 'micro' ) {
		const iconUrl = getMarkerIconUrl( marker, context );
		if ( iconUrl ) {
			const icon = ownerDocument.createElement( 'img' );
			icon.className = 'guyamap-default-marker__icon';
			icon.src = iconUrl;
			icon.alt = '';
			icon.width = marker.icon.markerSize === 'normal' ? 24 : 14;
			icon.height = marker.icon.markerSize === 'normal' ? 24 : 14;
			// A preset missing from the bundle falls back to the default glyph.
			icon.addEventListener( 'error', () => {
				const fallbackUrl = getIconUrl( FALLBACK_ICON_NAME, context );
				if ( fallbackUrl && icon.src !== fallbackUrl ) {
					icon.src = fallbackUrl;
					return;
				}
				icon.remove();
			} );
			visual.appendChild( icon );
		}
	}

	trigger.appendChild( visual );
	wrapper.appendChild( trigger );
	attachMarkerHint( wrapper, marker, context );

	return {
		element: wrapper,
		popup: hasPopup
			? attachMarkerPopup( wrapper, trigger, marker, internalId, context )
			: null,
	};
};

const createImageMarkerElement = ( marker, internalId, context, imageUrl ) => {
	const { ownerDocument } = context;
	const wrapper = ownerDocument.createElement( 'div' );
	wrapper.className = 'guyamap-image-marker';
	// Physical offsets from the coordinate; identical in LTR and RTL pages.
	wrapper.style.left = `${ marker.icon.offset[ 0 ] }px`;
	wrapper.style.top = `${ marker.icon.offset[ 1 ] }px`;
	wrapper.style.width = `${ marker.icon.size[ 0 ] }px`;
	wrapper.style.height = `${ marker.icon.size[ 1 ] }px`;
	wrapper.style.setProperty( '--guyamap-marker-color', marker.icon.color );

	const hasPopup = hasMarkerPopupContent( marker, context );
	const trigger = ownerDocument.createElement( hasPopup ? 'button' : 'span' );
	trigger.className = 'guyamap-image-marker__trigger';
	if ( hasPopup ) {
		trigger.type = 'button';
		trigger.classList.add( 'guyamap-image-marker__button' );
	} else {
		trigger.setAttribute( 'role', 'img' );
	}
	trigger.setAttribute(
		'aria-label',
		marker.hint || marker.title || context.config.i18n.marker
	);

	const image = ownerDocument.createElement( 'img' );
	image.className = 'guyamap-image-marker__image';
	image.src = imageUrl;
	image.alt = '';
	image.width = marker.icon.size[ 0 ];
	image.height = marker.icon.size[ 1 ];
	image.addEventListener(
		'error',
		() => {
			wrapper.classList.add( 'guyamap-image-marker--error' );
			image.remove();
		},
		{ once: true }
	);
	trigger.appendChild( image );
	wrapper.appendChild( trigger );
	attachMarkerHint( wrapper, marker, context );

	return {
		element: wrapper,
		popup: hasPopup
			? attachMarkerPopup( wrapper, trigger, marker, internalId, context )
			: null,
	};
};

const markersToFeatures = ( controller, markers ) =>
	markers.map( ( marker, index ) => ( {
		type: 'Feature',
		id: `${ controller.domIdPrefix }-marker-${ index + 1 }`,
		geometry: {
			type: 'Point',
			coordinates: toLngLat( marker.coordinates ),
		},
		properties: { marker },
	} ) );

const formatCountLabel = ( template, count ) => {
	const countText = String( count );
	return template.includes( '%d' )
		? template.replace( '%d', countText )
		: `${ template } ${ countText }`;
};

const createClusterElement = ( count, color, context ) => {
	const element = createTextElement(
		context.ownerDocument,
		'button',
		'guyamap-cluster',
		String( count )
	);
	element.type = 'button';
	element.style.setProperty( '--guyamap-cluster-color', color );
	element.setAttribute(
		'aria-label',
		formatCountLabel( context.config.i18n.clusterMarkers, count )
	);
	return element;
};

const createMarkerEntity = ( marker, internalId, core, context, options ) => {
	const { config, ownerWindow } = context;
	const commonProps = {
		id: internalId,
		coordinates: toLngLat( marker.coordinates ),
		hideOutsideViewport: marker.hideOutsideViewport,
		zIndex: marker.zIndex,
		blockEvents: true,
		blockBehaviors: options.editor === true,
	};
	const imageUrl =
		marker.icon.type === 'image'
			? safeUrl( marker.icon.url, ownerWindow, config.baseUrl )
			: '';
	const { element, popup } = imageUrl
		? createImageMarkerElement( marker, internalId, context, imageUrl )
		: createDefaultMarkerElement( marker, internalId, context );
	const entity = new core.YMapMarker( commonProps, element );
	if ( popup ) {
		popup.entity = entity;
	}

	return entity;
};

const createScreenReaderStatus = ( controller, message, role = 'status' ) => {
	const status = createTextElement(
		controller.ownerDocument,
		'p',
		'guyamap-map__screen-reader-status',
		message
	);
	status.setAttribute( 'role', role );
	status.setAttribute(
		'aria-live',
		role === 'alert' ? 'assertive' : 'polite'
	);
	return status;
};

/**
 * Shows a short, visible status message that is also announced politely.
 *
 * @param {Object} controller Map controller.
 * @param {string} message    Message text.
 */
const announce = ( controller, message ) => {
	controller.announcement?.remove();
	const notice = createTextElement(
		controller.ownerDocument,
		'p',
		'guyamap-map__notice',
		message
	);
	notice.setAttribute( 'role', 'status' );
	notice.setAttribute( 'aria-live', 'polite' );
	controller.surface.appendChild( notice );
	controller.announcement = notice;
	const timeoutId = controller.ownerWindow.setTimeout( () => {
		notice.remove();
		controller.timeouts.delete( timeoutId );
		if ( controller.announcement === notice ) {
			controller.announcement = null;
		}
	}, NOTICE_DURATION );
	controller.timeouts.add( timeoutId );
};

const addFullscreenControl = ( controller, config, options = {} ) => {
	const { container, ownerDocument, surface } = controller;
	if (
		! config.controls.fullscreen ||
		( ! options.editor && ! container.requestFullscreen )
	) {
		return;
	}

	const button = ownerDocument.createElement( 'button' );
	button.type = 'button';
	button.className = 'guyamap-map__fullscreen';
	button.setAttribute( 'aria-label', config.i18n.fullscreen );
	button.setAttribute( 'aria-pressed', 'false' );
	button.title = config.i18n.fullscreen;
	button.textContent = '⛶';
	if ( options.editor ) {
		button.setAttribute( 'aria-hidden', 'true' );
		button.setAttribute( 'inert', '' );
		surface.appendChild( button );
		controller.fullscreenButton = button;
		return;
	}

	const syncState = () => {
		button.setAttribute(
			'aria-pressed',
			String( ownerDocument.fullscreenElement === container )
		);
	};
	const toggleFullscreen = () => {
		if ( ownerDocument.fullscreenElement === container ) {
			ownerDocument.exitFullscreen?.().catch( () => {} );
		} else {
			container.requestFullscreen().catch( () => {} );
		}
	};

	button.addEventListener( 'click', toggleFullscreen );
	ownerDocument.addEventListener( 'fullscreenchange', syncState );
	controller.fullscreenCleanup = () => {
		button.removeEventListener( 'click', toggleFullscreen );
		ownerDocument.removeEventListener( 'fullscreenchange', syncState );
	};
	surface.appendChild( button );
	controller.fullscreenButton = button;
};

const removeChildSafely = ( map, child ) => {
	if ( ! map || ! child ) {
		return;
	}
	if ( typeof map.removeChild !== 'function' ) {
		throw new Error( 'guyamap_api_remove_child_unavailable' );
	}

	try {
		map.removeChild( child );
	} catch {
		// Optional entities may already have detached during SDK teardown.
	}
};

const getCurrentZoom = ( controller, config ) => {
	const zoom = Number( controller.map?.zoom );
	return Number.isFinite( zoom ) ? zoom : config.zoom;
};

const setZoom = ( controller, config, delta ) => {
	const now = controller.ownerWindow.Date.now();
	// Repeated presses step from the pending target, not a mid-animation zoom.
	const base =
		controller.zoomTarget && controller.zoomTarget.until > now
			? controller.zoomTarget.zoom
			: getCurrentZoom( controller, config );
	const zoom = Math.min(
		config.zoomRange.max,
		Math.max( config.zoomRange.min, base + delta )
	);
	const duration = prefersReducedMotion( controller.ownerWindow ) ? 0 : 200;
	controller.zoomTarget = { zoom, until: now + duration + 50 };
	controller.map.setLocation( { zoom, duration, easing: 'ease-out' } );
};

/**
 * Marks the visitor's position after a successful geolocation request.
 *
 * @param {Object}   controller  Map controller.
 * @param {Object}   config      Runtime configuration.
 * @param {number[]} coordinates Longitude/latitude pair.
 */
const showUserLocation = ( controller, config, coordinates ) => {
	const { core, map, ownerDocument } = controller;
	if ( ! core?.YMapMarker || ! map ) {
		return;
	}

	if ( controller.userLocationMarker ) {
		removeChildSafely( map, controller.userLocationMarker );
	}

	const element = ownerDocument.createElement( 'span' );
	element.className = 'guyamap-user-location';
	element.setAttribute( 'role', 'img' );
	element.setAttribute( 'aria-label', config.i18n.userLocation );
	controller.userLocationMarker = new core.YMapMarker(
		{ coordinates, zIndex: USER_LOCATION_Z_INDEX },
		element
	);
	map.addChild( controller.userLocationMarker );
};

const addNativeControls = ( controller, config, options = {} ) => {
	if ( ! config.controls.zoom && ! config.controls.geolocation ) {
		return;
	}

	const controls = controller.ownerDocument.createElement( 'div' );
	controls.className = 'guyamap-map__controls';
	controls.dataset.position = config.controls.position;
	if ( options.editor ) {
		controls.setAttribute( 'aria-hidden', 'true' );
		controls.setAttribute( 'inert', '' );
	}

	if ( config.controls.zoom ) {
		const zoomIn = createTextElement(
			controller.ownerDocument,
			'button',
			'guyamap-map__control',
			'+'
		);
		zoomIn.type = 'button';
		zoomIn.setAttribute( 'aria-label', config.i18n.zoomIn );
		zoomIn.title = config.i18n.zoomIn;
		zoomIn.addEventListener( 'click', () =>
			setZoom( controller, config, 1 )
		);

		const zoomOut = createTextElement(
			controller.ownerDocument,
			'button',
			'guyamap-map__control',
			'−'
		);
		zoomOut.type = 'button';
		zoomOut.setAttribute( 'aria-label', config.i18n.zoomOut );
		zoomOut.title = config.i18n.zoomOut;
		zoomOut.addEventListener( 'click', () =>
			setZoom( controller, config, -1 )
		);
		controls.append( zoomIn, zoomOut );
	}

	if ( config.controls.geolocation ) {
		const geolocate = createTextElement(
			controller.ownerDocument,
			'button',
			'guyamap-map__control',
			'◎'
		);
		geolocate.type = 'button';
		geolocate.setAttribute( 'aria-label', config.i18n.geolocate );
		geolocate.title = config.i18n.geolocate;
		geolocate.addEventListener( 'click', () => {
			const geolocation = controller.ownerWindow.navigator?.geolocation;
			if ( ! geolocation ) {
				announce( controller, config.i18n.geolocationError );
				return;
			}

			geolocate.disabled = true;
			geolocate.setAttribute( 'aria-busy', 'true' );
			geolocation.getCurrentPosition(
				( position ) => {
					if ( controller.destroyed ) {
						return;
					}

					geolocate.disabled = false;
					geolocate.removeAttribute( 'aria-busy' );
					const coordinates = [
						position.coords.longitude,
						position.coords.latitude,
					];
					showUserLocation( controller, config, coordinates );
					controller.map.setLocation( {
						center: coordinates,
						zoom: Math.min(
							config.zoomRange.max,
							Math.max( getCurrentZoom( controller, config ), 14 )
						),
						duration: prefersReducedMotion( controller.ownerWindow )
							? 0
							: 400,
						easing: 'ease-out',
					} );
				},
				( error ) => {
					if ( controller.destroyed ) {
						return;
					}

					geolocate.disabled = false;
					geolocate.removeAttribute( 'aria-busy' );
					announce(
						controller,
						error?.code === GEOLOCATION_PERMISSION_DENIED
							? config.i18n.geolocationDenied
							: config.i18n.geolocationError
					);
				},
				{
					enableHighAccuracy: false,
					timeout: 10000,
					maximumAge: 300000,
				}
			);
		} );
		controls.appendChild( geolocate );
	}

	controller.surface.appendChild( controls );
	controller.nativeControls = controls;
};

// The fullscreen button comes first in the document: on a short map the
// stylesheet moves the other controls beside it with a sibling selector.
const addControls = ( controller, config, options ) => {
	addFullscreenControl( controller, config, options );
	addNativeControls( controller, config, options );
};

const getViewportSize = ( controller ) => {
	const rect = controller.surface.getBoundingClientRect?.();
	return { width: rect?.width || 0, height: rect?.height || 0 };
};

const addMarkers = async ( controller, core, config, options ) => {
	closePopup( controller );
	if ( ! config.markers.length ) {
		controller.markerLayer = null;
		return;
	}

	const context = {
		config,
		controller,
		ownerDocument: controller.ownerDocument,
		ownerWindow: controller.ownerWindow,
	};
	const features = markersToFeatures( controller, config.markers );
	// The bundled clusterer binds to the `ymaps3` global of this module's
	// realm, so it is usable whenever that realm owns the SDK: on the frontend
	// and in the editor, whose canvas iframe borrows the wp-admin SDK.
	const canLoadBundledClusterer =
		getYandexApiWindow( controller.ownerWindow ) === globalThis.window;

	if (
		config.cluster.enabled &&
		features.length > 1 &&
		canLoadBundledClusterer
	) {
		const { YMapClusterer, clusterByGrid } = await import(
			/* webpackChunkName: "yandex-clusterer" */
			'@yandex/ymaps3-clusterer'
		);
		if ( controller.destroyed ) {
			return;
		}
		const clusterer = new YMapClusterer( {
			method: clusterByGrid( { gridSize: config.cluster.gridSize } ),
			features,
			maxZoom: config.cluster.maxZoom,
			tickTimeout: 200,
			marker: ( feature ) =>
				createMarkerEntity(
					feature.properties.marker,
					feature.id,
					core,
					context,
					options
				),
			cluster: ( coordinates, clusterFeatures ) => {
				const element = createClusterElement(
					clusterFeatures.length,
					config.cluster.color,
					context
				);
				element.addEventListener( 'click', () => {
					controller.map.setLocation( {
						bounds: fitBoundsToViewport(
							getFeatureBounds( clusterFeatures ),
							getViewportSize( controller )
						),
						duration: prefersReducedMotion( controller.ownerWindow )
							? 0
							: 300,
						easing: 'ease-out',
					} );
				} );
				return new core.YMapMarker(
					{ coordinates, blockEvents: true },
					element
				);
			},
		} );
		controller.map.addChild( clusterer );
		controller.markerLayer = clusterer;
		return;
	}

	controller.markerLayer = features.map( ( feature ) => {
		const entity = createMarkerEntity(
			feature.properties.marker,
			feature.id,
			core,
			context,
			options
		);
		controller.map.addChild( entity );
		return entity;
	} );
};

const removeMarkers = ( controller ) => {
	closePopup( controller );
	const markerLayers = Array.isArray( controller.markerLayer )
		? controller.markerLayer
		: [ controller.markerLayer ];
	markerLayers
		.filter( Boolean )
		.forEach( ( marker ) => removeChildSafely( controller.map, marker ) );
	controller.markerLayer = null;
};

const getInitialLocation = ( controller, config ) => {
	if ( ! config.mapOptions.fitToMarkers || ! config.markers.length ) {
		return {
			center: toLngLat( config.center ),
			zoom: config.zoom,
		};
	}

	const features = markersToFeatures( controller, config.markers );
	const bounds = getFeatureBounds( features );
	if ( isPointBounds( bounds ) ) {
		return {
			center: features[ 0 ].geometry.coordinates,
			zoom: config.zoom,
		};
	}

	return {
		bounds: fitBoundsToViewport( bounds, getViewportSize( controller ) ),
	};
};

const setControllerState = ( controller, state ) => {
	controller.container.dataset.state = state;
	if ( controller.surface !== controller.container ) {
		controller.surface.dataset.state = state;
	}
	controller.container.dispatchEvent(
		new controller.ownerWindow.CustomEvent( 'guyamap:statechange', {
			bubbles: true,
			composed: true,
			detail: { controller, state },
		} )
	);
};

const fingerprint = ( value ) => JSON.stringify( value );

/**
 * Converts a stored map area to the corner order the SDK enforces.
 *
 * Areas are stored as top-left and bottom-right corners, the order the
 * reference gives for `LngLatBounds`. For `restrictMapArea` the SDK instead
 * keeps the view north of the first corner and south of the second, so the
 * documented order pins the camera just outside the area on its next move.
 *
 * @param {number[][]|false} area Stored area, or false.
 * @return {number[][]|false} South-west and north-east corners, or false.
 */
const toRestrictedArea = ( area ) =>
	Array.isArray( area )
		? [
				[ area[ 0 ][ 0 ], area[ 1 ][ 1 ] ],
				[ area[ 1 ][ 0 ], area[ 0 ][ 1 ] ],
		  ]
		: false;

const getMapProps = ( controller, config, options, animate = false ) => {
	const duration =
		animate && ! prefersReducedMotion( controller.ownerWindow ) ? 120 : 0;
	const location = getInitialLocation( controller, config );
	const camera = {
		tilt: degreesToRadians( config.camera.tilt ),
		azimuth: degreesToRadians( config.camera.azimuth ),
	};

	if ( duration ) {
		location.duration = duration;
		location.easing = 'ease-out';
		camera.azimuth = getNearestAzimuth( controller.map, camera.azimuth );
		camera.duration = duration;
		camera.easing = 'ease-out';
	}

	return {
		location,
		camera,
		mode: config.mapMode,
		theme: resolveTheme( config.theme, controller.ownerWindow ),
		behaviors:
			options.editor || options.interactive === false
				? []
				: config.behaviors,
		zoomRange: config.zoomRange,
		zoomRounding: config.mapOptions.zoomRounding,
		zoomStrategy: config.mapOptions.zoomStrategy,
		margin: config.mapOptions.margin,
		copyrightsPosition: config.mapOptions.copyrightsPosition,
		showScaleInCopyrights: config.mapOptions.showScaleInCopyrights,
		restrictMapArea: toRestrictedArea( config.mapOptions.restrictMapArea ),
	};
};

/**
 * Applies a changed map-area restriction through the SDK's dedicated setter.
 *
 * `YMap.update( { restrictMapArea: false } )` leaves a previously restricted
 * map in a state where the next bounds location is centered far from the
 * requested bounds. `setRestrictMapArea()` releases the restriction cleanly,
 * so it runs before the general update whenever the restriction changes.
 *
 * @param {Object} controller Map controller.
 * @param {Object} config     Runtime configuration.
 */
const applyRestriction = ( controller, config ) => {
	const restriction = fingerprint( config.mapOptions.restrictMapArea );
	if ( restriction === controller.restrictionFingerprint ) {
		return;
	}

	controller.map.setRestrictMapArea?.(
		toRestrictedArea( config.mapOptions.restrictMapArea )
	);
	controller.restrictionFingerprint = restriction;
};

const getMapFingerprint = ( config, options ) =>
	fingerprint( [
		config.center,
		config.zoom,
		config.zoomRange,
		config.camera,
		config.mapMode,
		config.theme,
		config.behaviors,
		config.mapOptions,
		config.mapOptions.fitToMarkers
			? config.markers.map( ( marker ) => marker.coordinates )
			: [],
		Boolean( options.editor ),
		options.interactive !== false,
	] );

const getMarkerFingerprint = ( config ) =>
	fingerprint( [
		config.markers,
		config.cluster,
		config.baseUrl,
		config.iconBaseUrl,
		config.i18n.marker,
		config.i18n.clusterMarkers,
	] );

const getControlsFingerprint = ( config, options ) =>
	fingerprint( [ config.controls, config.i18n, Boolean( options.editor ) ] );

const applyMapConfig = async ( controller, config, options ) => {
	if ( controller.destroyed || ! controller.map ) {
		return controller;
	}

	const mapFingerprint = getMapFingerprint( config, options );
	if ( mapFingerprint !== controller.mapFingerprint ) {
		if ( typeof controller.map.update !== 'function' ) {
			throw new controller.ownerWindow.Error(
				'guyamap_api_update_unavailable'
			);
		}
		applyRestriction( controller, config );
		controller.map.update(
			getMapProps( controller, config, options, true )
		);
		controller.mapFingerprint = mapFingerprint;
	}

	const schemeFingerprint = fingerprint( config.customization );
	if ( schemeFingerprint !== controller.schemeFingerprint ) {
		if ( typeof controller.schemeLayer?.update !== 'function' ) {
			throw new controller.ownerWindow.Error(
				'guyamap_api_layer_update_unavailable'
			);
		}
		controller.schemeLayer.update( {
			customization: config.customization,
		} );
		controller.schemeFingerprint = schemeFingerprint;
	}

	const markerFingerprint = getMarkerFingerprint( config );
	if ( markerFingerprint !== controller.markerFingerprint ) {
		removeMarkers( controller );
		await addMarkers( controller, controller.core, config, options );
		if ( controller.destroyed ) {
			return controller;
		}
		controller.markerFingerprint = markerFingerprint;
	}

	const controlsFingerprint = getControlsFingerprint( config, options );
	if ( controlsFingerprint !== controller.controlsFingerprint ) {
		controller.nativeControls?.remove();
		controller.nativeControls = null;
		controller.fullscreenCleanup?.();
		controller.fullscreenCleanup = null;
		controller.fullscreenButton?.remove();
		controller.fullscreenButton = null;
		addControls( controller, config, options );
		controller.controlsFingerprint = controlsFingerprint;
	}

	controller.appliedConfig = config;
	return controller;
};

const initialize = async ( controller ) => {
	let config = controller.config;
	let options = controller.options;
	controller.error = null;
	delete controller.container.dataset.errorCode;
	setControllerState( controller, 'loading' );
	controller.container.setAttribute( 'aria-busy', 'true' );
	controller.surface.replaceChildren(
		createScreenReaderStatus( controller, config.i18n.loading )
	);
	const api = await loadYandexApi(
		config.apiKey,
		config.language,
		controller.ownerWindow
	);
	if ( controller.destroyed ) {
		return controller;
	}

	const apiWindow = getYandexApiWindow( controller.ownerWindow );
	await waitForMapHostStyles(
		controller.container,
		apiWindow?.document ?? controller.ownerDocument
	);
	if ( controller.destroyed ) {
		return controller;
	}

	config = controller.config;
	options = controller.options;

	const core = {
		YMap: api.YMap,
		YMapDefaultFeaturesLayer: api.YMapDefaultFeaturesLayer,
		YMapDefaultSchemeLayer: api.YMapDefaultSchemeLayer,
		YMapListener: api.YMapListener,
		YMapMarker: api.YMapMarker,
	};
	if (
		! core.YMap ||
		! core.YMapDefaultSchemeLayer ||
		! core.YMapDefaultFeaturesLayer ||
		! core.YMapMarker
	) {
		throw new controller.ownerWindow.Error( 'guyamap_api_incomplete' );
	}

	controller.core = core;
	controller.surface.replaceChildren();
	controller.map = new core.YMap(
		controller.surface,
		getMapProps( controller, config, options )
	);
	controller.schemeLayer = new core.YMapDefaultSchemeLayer( {
		customization: config.customization,
	} );
	controller.map.addChild( controller.schemeLayer );
	// DOM markers (inline, clustered and the visitor's location) render here.
	controller.featuresLayer = new core.YMapDefaultFeaturesLayer();
	controller.map.addChild( controller.featuresLayer );
	registerPopupDismissal( controller );
	controller.restrictionFingerprint = fingerprint(
		config.mapOptions.restrictMapArea
	);
	controller.mapFingerprint = getMapFingerprint( config, options );
	controller.schemeFingerprint = fingerprint( config.customization );

	if ( ! options.editor && options.onMapClick && core.YMapListener ) {
		const listener = new core.YMapListener( {
			layer: 'any',
			onClick: ( object, event ) => {
				if ( object?.type !== 'marker' && event?.coordinates ) {
					options.onMapClick( {
						longitude: event.coordinates[ 0 ],
						latitude: event.coordinates[ 1 ],
					} );
				}
			},
		} );
		controller.map.addChild( listener );
		controller.listener = listener;
	}

	await addMarkers( controller, core, config, options );
	controller.markerFingerprint = getMarkerFingerprint( config );
	if ( controller.destroyed ) {
		controller.map?.destroy();
		return controller;
	}

	addControls( controller, config, options );
	controller.controlsFingerprint = getControlsFingerprint( config, options );
	controller.appliedConfig = config;
	setControllerState( controller, 'ready' );
	controller.container.removeAttribute( 'aria-busy' );
	controller.container.dispatchEvent(
		new controller.ownerWindow.CustomEvent( 'guyamap:ready', {
			bubbles: true,
			composed: true,
			detail: { map: controller.map, controller, config },
		} )
	);
	return controller;
};

const showActivationGate = ( controller, config, start ) => {
	setControllerState( controller, 'awaiting-activation' );
	const gate = controller.ownerDocument.createElement( 'div' );
	gate.className = 'guyamap-map__activation';
	const button = createTextElement(
		controller.ownerDocument,
		'button',
		'guyamap-map__activation-button',
		config.i18n.activate
	);
	button.type = 'button';
	button.addEventListener(
		'click',
		() => {
			const hadFocus = button.getRootNode?.()?.activeElement === button;
			start();
			// The focused button is removed; keep keyboard focus in the map.
			if ( hadFocus && ! controller.destroyed ) {
				const { container } = controller;
				if ( ! container.hasAttribute( 'tabindex' ) ) {
					container.setAttribute( 'tabindex', '-1' );
				}
				container.focus?.( { preventScroll: true } );
			}
		},
		{ once: true }
	);
	gate.appendChild( button );
	controller.surface.appendChild( gate );
	controller.activationGate = gate;
};

const getErrorCode = ( error ) =>
	typeof error?.code === 'string' && ERROR_CODES.includes( error.code )
		? error.code
		: 'render';

/**
 * Explains the failure to people who can fix it. Visitors keep the short
 * generic message; the cause is only rendered when the server marked the
 * current user as an administrator.
 *
 * @param {Object} controller Map controller.
 * @param {Object} config     Runtime configuration.
 * @param {string} code       Public error code.
 * @return {HTMLElement|null} Diagnostics block.
 */
const createErrorDiagnostics = ( controller, config, code ) => {
	const reason = config.i18n.errorDetails[ code ];
	if ( ! config.diagnostics || ! reason ) {
		return null;
	}

	const { ownerDocument, ownerWindow } = controller;
	const details = ownerDocument.createElement( 'div' );
	details.className = 'guyamap-map__error-details';
	details.appendChild(
		createTextElement(
			ownerDocument,
			'p',
			'guyamap-map__error-reason',
			reason
		)
	);

	const settingsUrl = safeUrl(
		config.settingsUrl,
		ownerWindow,
		config.baseUrl
	);
	if ( settingsUrl ) {
		const link = createTextElement(
			ownerDocument,
			'a',
			'guyamap-map__error-settings',
			config.i18n.openSettings
		);
		link.href = settingsUrl;
		details.appendChild( link );
	}

	details.appendChild(
		createTextElement(
			ownerDocument,
			'p',
			'guyamap-map__error-note',
			config.i18n.adminOnly
		)
	);

	return details;
};

const renderError = ( controller, config, error ) => {
	if ( controller.destroyed ) {
		return controller;
	}

	try {
		controller.map?.destroy();
	} catch {
		// Continue with a recoverable fallback if SDK teardown fails.
	}
	const code = getErrorCode( error );
	controller.map = null;
	controller.openPopup = null;
	controller.error = error;
	controller.errorCode = code;
	controller.container.dataset.errorCode = code;
	setControllerState( controller, 'error' );
	controller.container.removeAttribute( 'aria-busy' );
	const panel = controller.ownerDocument.createElement( 'div' );
	panel.className = 'guyamap-map__error';
	panel.setAttribute( 'role', 'alert' );
	const message = createTextElement(
		controller.ownerDocument,
		'p',
		'guyamap-map__error-message',
		config.i18n.error
	);
	panel.appendChild( message );
	const fallbackUrl = safeUrl(
		config.fallbackUrl,
		controller.ownerWindow,
		config.baseUrl
	);
	if ( fallbackUrl && config.fallbackText ) {
		const link = createTextElement(
			controller.ownerDocument,
			'a',
			'guyamap-map__error-link',
			config.fallbackText
		);
		link.href = fallbackUrl;
		link.target = '_blank';
		link.rel = 'noopener noreferrer external';
		panel.appendChild( link );
	}
	const diagnostics = createErrorDiagnostics( controller, config, code );
	if ( diagnostics ) {
		panel.appendChild( diagnostics );
	}
	controller.surface.replaceChildren( panel );
	controller.container.dispatchEvent(
		new controller.ownerWindow.CustomEvent( 'guyamap:error', {
			bubbles: true,
			composed: true,
			detail: { error, code, config },
		} )
	);
	return controller;
};

const createDeferred = ( ownerWindow ) => {
	let resolve;
	const promise = new ownerWindow.Promise( ( settle ) => {
		resolve = settle;
	} );

	return { promise, resolve };
};

const getDomIdPrefix = ( config, ownerWindow ) => {
	const instanceId = config.instanceId
		.replace( /[^A-Za-z0-9_-]/g, '-' )
		.slice( 0, 96 );
	if ( instanceId ) {
		return instanceId;
	}

	return `guyamap-${ ownerWindow.Date.now() }-${ ownerWindow.Math.random()
		.toString( 36 )
		.slice( 2, 10 ) }`;
};

/**
 * Mount a map into an element. Returns immediately with a controller; its
 * `ready` promise resolves after SDK, markers and controls are ready.
 *
 * @param {HTMLElement} container Map canvas.
 * @param {Object}      rawConfig Block/runtime configuration.
 * @param {Object}      options   Editor callbacks and interaction state.
 * @return {Object|null} Map controller.
 */
export function mountMap( container, rawConfig, options = {} ) {
	const ownerDocument = container?.ownerDocument;
	const ownerWindow = ownerDocument?.defaultView;
	if ( ! container || ! ownerDocument || ! ownerWindow ) {
		return null;
	}

	destroyMap( container );
	const config = withRuntimeConfig( rawConfig );
	const runtimeOptions = {
		...options,
		editor: options.editor === true,
		interactive:
			options.editor === true ? false : options.interactive !== false,
	};
	const surface = prepareMapHost( container, {
		editor: runtimeOptions.editor,
		styleUrl: config.styleUrl,
	} );
	if ( ! surface ) {
		return null;
	}

	const deferred = createDeferred( ownerWindow );
	const controller = {
		container,
		surface,
		ownerDocument,
		ownerWindow,
		domIdPrefix: getDomIdPrefix( config, ownerWindow ),
		config,
		options: runtimeOptions,
		map: null,
		ready: deferred.promise,
		resolveReady: deferred.resolve,
		destroyed: false,
		started: false,
		cleanups: [],
		timeouts: new ownerWindow.Set(),
		updateRevision: 0,
		updateChain: ownerWindow.Promise.resolve(),
	};
	INSTANCES.set( container, controller );

	const start = () => {
		if ( controller.started || controller.destroyed ) {
			return controller.ready;
		}

		controller.started = true;
		controller.activationGate?.remove();
		controller.activationGate = null;
		controller.initialization = initialize( controller )
			.catch( ( error ) =>
				renderError( controller, controller.config, error )
			)
			.then( ( result ) => {
				controller.resolveReady( result );
				return result;
			} );
		return controller.ready;
	};

	if ( config.loading.clickToActivate && ! runtimeOptions.editor ) {
		showActivationGate( controller, config, start );
	} else {
		start();
	}

	return controller;
}

/**
 * Applies a complete normalized configuration to an existing controller.
 * Calls are serialized and coalesced, so rapid Inspector slider changes can
 * never let an older asynchronous marker update overwrite a newer value.
 *
 * @param {Object|HTMLElement} instanceOrContainer Controller or public host.
 * @param {Object}             rawConfig           Complete runtime config.
 * @param {Object}             options             Runtime/editor options.
 * @return {Promise<Object|null>} Updated controller.
 */
export function updateMap( instanceOrContainer, rawConfig, options = {} ) {
	const controller = instanceOrContainer?.container
		? instanceOrContainer
		: INSTANCES.get( instanceOrContainer );
	if ( ! controller || controller.destroyed ) {
		return Promise.resolve( null );
	}

	const config = withRuntimeConfig( rawConfig );
	controller.config = config;
	controller.options = {
		...controller.options,
		...options,
		editor:
			options.editor === undefined
				? controller.options.editor
				: options.editor === true,
	};
	if ( controller.options.editor ) {
		controller.options.interactive = false;
	} else if ( options.interactive !== undefined ) {
		controller.options.interactive = options.interactive !== false;
	}

	prepareMapHost( controller.container, {
		editor: controller.options.editor,
		styleUrl: config.styleUrl,
	} );

	const revision = controller.updateRevision + 1;
	controller.updateRevision = revision;
	controller.updateChain = controller.updateChain
		.catch( () => controller )
		.then( async () => {
			await controller.ready;
			if (
				controller.destroyed ||
				revision !== controller.updateRevision ||
				! controller.map
			) {
				return controller;
			}

			return applyMapConfig(
				controller,
				controller.config,
				controller.options
			);
		} );

	return controller.updateChain;
}

/**
 * Destroy a controller or the map mounted in a container.
 *
 * @param {Object|HTMLElement} instanceOrContainer Controller or canvas.
 */
export function destroyMap( instanceOrContainer ) {
	const controller = instanceOrContainer?.container
		? instanceOrContainer
		: INSTANCES.get( instanceOrContainer );

	if ( ! controller || controller.destroyed ) {
		return;
	}

	controller.destroyed = true;
	controller.fullscreenCleanup?.();
	controller.fullscreenCleanup = null;
	controller.cleanups.forEach( ( cleanup ) => cleanup() );
	controller.cleanups = [];
	controller.timeouts.forEach( ( timeoutId ) =>
		controller.ownerWindow.clearTimeout( timeoutId )
	);
	controller.timeouts.clear();
	controller.fullscreenButton?.remove();
	controller.nativeControls?.remove();
	controller.activationGate?.remove();
	controller.announcement?.remove();
	controller.openPopup = null;
	controller.userLocationMarker = null;
	delete controller.container.dataset.errorCode;
	try {
		controller.map?.destroy();
	} catch {
		// Cleanup must stay idempotent even after a partial SDK failure.
	}
	controller.map = null;
	controller.container.removeAttribute( 'aria-busy' );
	setControllerState( controller, 'destroyed' );
	releaseMapHost( controller.container );
	controller.container.dispatchEvent(
		new controller.ownerWindow.CustomEvent( 'guyamap:destroy', {
			bubbles: true,
			composed: true,
			detail: { controller },
		} )
	);
	controller.resolveReady( controller );
	INSTANCES.delete( controller.container );
}
