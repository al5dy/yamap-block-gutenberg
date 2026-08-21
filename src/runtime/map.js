import { loadYandexApi } from './api-loader';
import { normalizeConfig, toLngLat } from './normalize';

const INSTANCES = new WeakMap();
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const ICON_NAME_PATTERN = /^[a-z0-9_]{1,64}$/;

const degreesToRadians = ( degrees ) => ( degrees * Math.PI ) / 180;

const runtimeString = ( value, fallback = '', maximumLength = 2048 ) =>
	typeof value === 'string' ? value.slice( 0, maximumLength ) : fallback;

const withRuntimeConfig = ( rawConfig ) => {
	const input = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
	const config = normalizeConfig( input );
	const runtimeI18n =
		input.i18n && typeof input.i18n === 'object' ? input.i18n : {};

	return {
		...config,
		baseUrl: runtimeString( input.baseUrl ),
		iconBaseUrl: runtimeString( input.iconBaseUrl ),
		instanceId: runtimeString( input.instanceId, '', 128 ),
		i18n: {
			...config.i18n,
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
			marker.description ||
			marker.address ||
			safeUrl(
				marker.link.url,
				context.ownerWindow,
				context.config.baseUrl
			)
	);

const attachMarkerPopup = ( wrapper, button, marker, internalId, context ) => {
	const popup = createPopupContent( marker, context );
	const popupId = `${ internalId }-popup`;
	const markerClass = wrapper.classList.contains( 'guyamap-image-marker' )
		? 'guyamap-image-marker__popup'
		: 'guyamap-default-marker__popup';

	popup.classList.add( markerClass );
	popup.id = popupId;
	popup.hidden = true;
	button.setAttribute( 'aria-controls', popupId );
	button.setAttribute( 'aria-expanded', 'false' );
	button.addEventListener( 'click', () => {
		popup.hidden = ! popup.hidden;
		button.setAttribute( 'aria-expanded', String( ! popup.hidden ) );
	} );
	wrapper.addEventListener( 'keydown', ( event ) => {
		if ( event.key !== 'Escape' || popup.hidden ) {
			return;
		}

		popup.hidden = true;
		button.setAttribute( 'aria-expanded', 'false' );
		button.focus();
	} );
	wrapper.appendChild( popup );
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

const getMarkerIconUrl = ( marker, context ) => {
	const { config, ownerWindow } = context;
	const iconBaseUrl = safeUrl(
		config.iconBaseUrl,
		ownerWindow,
		config.baseUrl
	);
	if ( ! iconBaseUrl ) {
		return '';
	}

	const iconName = ICON_NAME_PATTERN.test( marker.icon.name )
		? marker.icon.name
		: 'fallback';

	try {
		const base = iconBaseUrl.endsWith( '/' )
			? iconBaseUrl
			: `${ iconBaseUrl }/`;
		return new ownerWindow.URL( `${ iconName }_24.svg`, base ).href;
	} catch {
		return '';
	}
};

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
			icon.addEventListener( 'error', () => icon.remove(), {
				once: true,
			} );
			visual.appendChild( icon );
		}
	}

	trigger.appendChild( visual );
	wrapper.appendChild( trigger );
	if ( hasPopup ) {
		attachMarkerPopup( wrapper, trigger, marker, internalId, context );
	}

	return wrapper;
};

const createImageMarkerElement = ( marker, internalId, context, imageUrl ) => {
	const { ownerDocument } = context;
	const wrapper = ownerDocument.createElement( 'div' );
	wrapper.className = 'guyamap-image-marker';
	wrapper.style.setProperty(
		'--guyamap-marker-offset-x',
		`${ marker.icon.offset[ 0 ] }px`
	);
	wrapper.style.setProperty(
		'--guyamap-marker-offset-y',
		`${ marker.icon.offset[ 1 ] }px`
	);
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
	trigger.style.inlineSize = `${ marker.icon.size[ 0 ] }px`;
	trigger.style.blockSize = `${ marker.icon.size[ 1 ] }px`;
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
	if ( hasPopup ) {
		attachMarkerPopup( wrapper, trigger, marker, internalId, context );
	}

	return wrapper;
};

const getBounds = ( features ) => {
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
		draggable: marker.draggable && options.interactive !== false,
		mapFollowsOnDrag: marker.mapFollowsOnDrag,
		hideOutsideViewport: marker.hideOutsideViewport,
		zIndex: marker.zIndex,
		onDragEnd: ( coordinates ) => {
			options.onMarkerDragEnd?.( marker.id, {
				longitude: coordinates[ 0 ],
				latitude: coordinates[ 1 ],
			} );
		},
		blockEvents: true,
		blockBehaviors: false,
	};
	const imageUrl =
		marker.icon.type === 'image'
			? safeUrl( marker.icon.url, ownerWindow, config.baseUrl )
			: '';
	const element = imageUrl
		? createImageMarkerElement( marker, internalId, context, imageUrl )
		: createDefaultMarkerElement( marker, internalId, context );

	return new core.YMapMarker( commonProps, element );
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

const announce = ( controller, message ) => {
	controller.announcement?.remove();
	const status = createScreenReaderStatus( controller, message );
	controller.container.appendChild( status );
	controller.announcement = status;
	const timeoutId = controller.ownerWindow.setTimeout( () => {
		status.remove();
		controller.timeouts.delete( timeoutId );
		if ( controller.announcement === status ) {
			controller.announcement = null;
		}
	}, 5000 );
	controller.timeouts.add( timeoutId );
};

const addFullscreenControl = ( controller, config ) => {
	const { container, ownerDocument } = controller;
	if ( ! config.controls.fullscreen || ! container.requestFullscreen ) {
		return;
	}

	const button = ownerDocument.createElement( 'button' );
	button.type = 'button';
	button.className = 'guyamap-map__fullscreen';
	button.setAttribute( 'aria-label', config.i18n.fullscreen );
	button.setAttribute( 'aria-pressed', 'false' );
	button.title = config.i18n.fullscreen;
	button.textContent = '⛶';
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
	controller.cleanups.push( () => {
		button.removeEventListener( 'click', toggleFullscreen );
		ownerDocument.removeEventListener( 'fullscreenchange', syncState );
	} );
	container.appendChild( button );
	controller.fullscreenButton = button;
};

const getCurrentZoom = ( controller, config ) => {
	const zoom = Number( controller.map?.zoom );
	return Number.isFinite( zoom ) ? zoom : config.zoom;
};

const setZoom = ( controller, config, delta ) => {
	const zoom = Math.min(
		config.zoomRange.max,
		Math.max(
			config.zoomRange.min,
			getCurrentZoom( controller, config ) + delta
		)
	);
	controller.map.setLocation( {
		zoom,
		duration: prefersReducedMotion( controller.ownerWindow ) ? 0 : 200,
		easing: 'ease-out',
	} );
};

const addNativeControls = ( controller, config ) => {
	if ( ! config.controls.zoom && ! config.controls.geolocation ) {
		return;
	}

	const controls = controller.ownerDocument.createElement( 'div' );
	controls.className = 'guyamap-map__controls';
	controls.dataset.position = config.controls.position;

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
					controller.map.setLocation( {
						center: [
							position.coords.longitude,
							position.coords.latitude,
						],
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
				() => {
					if ( controller.destroyed ) {
						return;
					}

					geolocate.disabled = false;
					geolocate.removeAttribute( 'aria-busy' );
					announce( controller, config.i18n.geolocationError );
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

	controller.container.appendChild( controls );
	controller.nativeControls = controls;
};

const addMarkers = async ( controller, core, config, options ) => {
	if ( ! config.markers.length ) {
		return;
	}

	controller.map.addChild( new core.YMapDefaultFeaturesLayer() );
	const context = {
		config,
		ownerDocument: controller.ownerDocument,
		ownerWindow: controller.ownerWindow,
	};
	const features = markersToFeatures( controller, config.markers );
	const canLoadBundledClusterer =
		! options.editor && controller.ownerWindow === globalThis.window;

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
						bounds: getBounds( clusterFeatures ),
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

const getInitialLocation = ( controller, config ) => {
	if ( ! config.mapOptions.fitToMarkers || ! config.markers.length ) {
		return {
			center: toLngLat( config.center ),
			zoom: config.zoom,
		};
	}

	const features = markersToFeatures( controller, config.markers );
	if ( features.length === 1 ) {
		return {
			center: features[ 0 ].geometry.coordinates,
			zoom: config.zoom,
		};
	}

	return { bounds: getBounds( features ) };
};

const initialize = async ( controller, config, options ) => {
	controller.container.dataset.state = 'loading';
	controller.container.setAttribute( 'aria-busy', 'true' );
	controller.container.replaceChildren(
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

	const core = {
		YMap: api.YMap,
		YMapDefaultFeaturesLayer: api.YMapDefaultFeaturesLayer,
		YMapDefaultSchemeLayer: api.YMapDefaultSchemeLayer,
		YMapListener: api.YMapListener,
		YMapMarker: api.YMapMarker,
	};
	const mapProps = {
		location: getInitialLocation( controller, config ),
		camera: {
			tilt: degreesToRadians( config.camera.tilt ),
			azimuth: degreesToRadians( config.camera.azimuth ),
		},
		mode: config.mapMode,
		theme: resolveTheme( config.theme, controller.ownerWindow ),
		behaviors: options.interactive === false ? [] : config.behaviors,
		zoomRange: config.zoomRange,
		zoomRounding: config.mapOptions.zoomRounding,
		zoomStrategy: config.mapOptions.zoomStrategy,
		margin: config.mapOptions.margin,
		copyrightsPosition: config.mapOptions.copyrightsPosition,
		showScaleInCopyrights: config.mapOptions.showScaleInCopyrights,
		restrictMapArea: config.mapOptions.restrictMapArea,
	};
	controller.container.replaceChildren();
	controller.map = new core.YMap( controller.container, mapProps );
	controller.map.addChild(
		new core.YMapDefaultSchemeLayer( {
			customization: config.customization,
		} )
	);

	if ( options.onMapClick && core.YMapListener ) {
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
	if ( controller.destroyed ) {
		controller.map?.destroy();
		return controller;
	}

	addNativeControls( controller, config );
	if ( ! options.editor ) {
		addFullscreenControl( controller, config );
	}
	controller.container.dataset.state = 'ready';
	controller.container.removeAttribute( 'aria-busy' );
	controller.container.dispatchEvent(
		new controller.ownerWindow.CustomEvent( 'guyamap:ready', {
			bubbles: true,
			detail: { map: controller.map, controller, config },
		} )
	);
	return controller;
};

const showActivationGate = ( controller, config, start ) => {
	controller.container.dataset.state = 'awaiting-activation';
	const gate = controller.ownerDocument.createElement( 'div' );
	gate.className = 'guyamap-map__activation';
	const button = createTextElement(
		controller.ownerDocument,
		'button',
		'guyamap-map__activation-button',
		config.i18n.activate
	);
	button.type = 'button';
	button.addEventListener( 'click', start, { once: true } );
	gate.appendChild( button );
	controller.container.appendChild( gate );
	controller.activationGate = gate;
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
	controller.map = null;
	controller.container.dataset.state = 'error';
	controller.container.removeAttribute( 'aria-busy' );
	const message = createTextElement(
		controller.ownerDocument,
		'p',
		'guyamap-map__error',
		config.i18n.error
	);
	message.setAttribute( 'role', 'alert' );
	controller.container.replaceChildren( message );
	controller.container.dispatchEvent(
		new controller.ownerWindow.CustomEvent( 'guyamap:error', {
			bubbles: true,
			detail: { error, config },
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
	const deferred = createDeferred( ownerWindow );
	const controller = {
		container,
		ownerDocument,
		ownerWindow,
		domIdPrefix: getDomIdPrefix( config, ownerWindow ),
		map: null,
		ready: deferred.promise,
		resolveReady: deferred.resolve,
		destroyed: false,
		started: false,
		cleanups: [],
		timeouts: new ownerWindow.Set(),
	};
	INSTANCES.set( container, controller );

	const start = () => {
		if ( controller.started || controller.destroyed ) {
			return controller.ready;
		}

		controller.started = true;
		controller.activationGate?.remove();
		controller.activationGate = null;
		controller.initialization = initialize( controller, config, options )
			.catch( ( error ) => renderError( controller, config, error ) )
			.then( ( result ) => {
				controller.resolveReady( result );
				return result;
			} );
		return controller.ready;
	};

	if ( config.loading.clickToActivate && ! options.editor ) {
		showActivationGate( controller, config, start );
	} else {
		start();
	}

	return controller;
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
	try {
		controller.map?.destroy();
	} catch {
		// Cleanup must stay idempotent even after a partial SDK failure.
	}
	controller.map = null;
	controller.container.removeAttribute( 'aria-busy' );
	controller.container.dataset.state = 'destroyed';
	controller.container.dispatchEvent(
		new controller.ownerWindow.CustomEvent( 'guyamap:destroy', {
			bubbles: true,
			detail: { controller },
		} )
	);
	controller.resolveReady( controller );
	INSTANCES.delete( controller.container );
}
