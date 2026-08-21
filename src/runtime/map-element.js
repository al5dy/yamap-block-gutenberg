const ELEMENT_NAME = 'guyamap-map-view';
const HOST_STATE = new WeakMap();
const YANDEX_STYLES = new WeakMap();

const getOwnerWindow = ( element ) =>
	element?.ownerDocument?.defaultView ?? null;

const isYandexStylesheet = ( node ) => {
	if (
		! node ||
		node.nodeType !== 1 ||
		node.tagName !== 'LINK' ||
		! node.relList?.contains( 'stylesheet' )
	) {
		return false;
	}

	try {
		const url = new node.ownerDocument.defaultView.URL( node.href );
		return (
			( url.hostname === 'yastatic.net' ||
				url.hostname.endsWith( '.yastatic.net' ) ) &&
			url.pathname.includes( '/maps-front-jsapi-3/' )
		);
	} catch {
		return false;
	}
};

const setupShadowRoot = ( host ) => {
	const existingState = HOST_STATE.get( host );
	if ( existingState ) {
		return existingState.surface;
	}

	if ( typeof host.attachShadow !== 'function' ) {
		HOST_STATE.set( host, {
			surface: host,
			stylePromises: new Map(),
			yandexRegistries: new Map(),
		} );
		return host;
	}

	const ownerDocument = host.ownerDocument;
	const shadowRoot = host.shadowRoot ?? host.attachShadow( { mode: 'open' } );
	const frame = ownerDocument.createElement( 'div' );
	const surface = ownerDocument.createElement( 'div' );

	frame.className =
		'wp-block-gutenberg-yandex-block-map guyamap-map guyamap-map__shadow-frame';
	frame.setAttribute( 'part', 'frame' );
	surface.className = 'guyamap-map__canvas';
	surface.setAttribute( 'part', 'canvas' );
	frame.appendChild( surface );
	shadowRoot.replaceChildren( frame );

	HOST_STATE.set( host, {
		frame,
		surface,
		stylePromises: new Map(),
		yandexRegistries: new Map(),
	} );

	return surface;
};

const defineElement = ( ownerWindow ) => {
	const registry = ownerWindow?.customElements;
	if ( ! registry || registry.get( ELEMENT_NAME ) ) {
		return;
	}

	registry.define(
		ELEMENT_NAME,
		class GuYaMapViewElement extends ownerWindow.HTMLElement {
			constructor() {
				super();
				setupShadowRoot( this );
			}
		}
	);
};

const appendStylesheet = ( host, href, kind ) => {
	const shadowRoot = host.shadowRoot;
	const state = HOST_STATE.get( host );
	if ( ! shadowRoot || ! state || ! href ) {
		return Promise.resolve();
	}

	const ownerWindow = getOwnerWindow( host );
	let normalizedUrl;
	try {
		normalizedUrl = new ownerWindow.URL( href, ownerWindow.location.href );
		if ( ! [ 'http:', 'https:' ].includes( normalizedUrl.protocol ) ) {
			return Promise.resolve();
		}
	} catch {
		return Promise.resolve();
	}

	const key = `${ kind }:${ normalizedUrl.href }`;
	if ( state.stylePromises.has( key ) ) {
		return state.stylePromises.get( key );
	}

	const link = host.ownerDocument.createElement( 'link' );
	link.rel = 'stylesheet';
	link.href = normalizedUrl.href;
	link.dataset.guyamapShadowStyle = kind;

	const promise = new ownerWindow.Promise( ( resolve ) => {
		let settled = false;
		const finish = () => {
			if ( settled ) {
				return;
			}
			settled = true;
			ownerWindow.clearTimeout( timeoutId );
			link.removeEventListener( 'load', finish );
			link.removeEventListener( 'error', finish );
			resolve();
		};
		const timeoutId = ownerWindow.setTimeout( finish, 5000 );
		link.addEventListener( 'load', finish, { once: true } );
		link.addEventListener( 'error', finish, { once: true } );
	} );

	state.stylePromises.set( key, promise );
	shadowRoot.appendChild( link );
	return promise;
};

const mirrorYandexStyles = ( host, root = host.ownerDocument ) => {
	const promises = [];
	root.querySelectorAll?.( 'link[rel~="stylesheet"]' ).forEach( ( link ) => {
		if ( isYandexStylesheet( link ) ) {
			promises.push( appendStylesheet( host, link.href, 'yandex' ) );
		}
	} );
	return promises;
};

const registerYandexStyleMirror = (
	host,
	sourceDocument = host.ownerDocument
) => {
	const sourceWindow = sourceDocument?.defaultView;
	if ( ! sourceWindow?.MutationObserver || ! sourceDocument.head ) {
		return;
	}

	let registry = YANDEX_STYLES.get( sourceDocument );
	if ( ! registry ) {
		const hosts = new Set();
		const observer = new sourceWindow.MutationObserver( ( mutations ) => {
			mutations.forEach( ( mutation ) => {
				mutation.addedNodes.forEach( ( node ) => {
					const links = isYandexStylesheet( node )
						? [ node ]
						: [
								...( node.querySelectorAll?.(
									'link[rel~="stylesheet"]'
								) ?? [] ),
						  ].filter( isYandexStylesheet );
					links.forEach( ( link ) => {
						hosts.forEach( ( currentHost ) =>
							appendStylesheet( currentHost, link.href, 'yandex' )
						);
					} );
				} );
			} );
		} );
		observer.observe( sourceDocument.head, {
			childList: true,
			subtree: true,
		} );
		registry = { hosts, observer };
		YANDEX_STYLES.set( sourceDocument, registry );
	}

	registry.hosts.add( host );
	HOST_STATE.get( host )?.yandexRegistries.set( sourceDocument, registry );
	mirrorYandexStyles( host, sourceDocument );
};

/**
 * Upgrades the runtime host to the plugin's style-isolated map Web Component.
 * A plain HTMLElement remains a supported light-DOM fallback for integrations
 * and browsers without Custom Elements or Shadow DOM.
 *
 * @param {HTMLElement} host    Public map host.
 * @param {Object}      options Runtime host options.
 * @return {HTMLElement|null} Private Yandex root surface.
 */
export function prepareMapHost( host, options = {} ) {
	const ownerWindow = getOwnerWindow( host );
	if ( ! host || ! ownerWindow ) {
		return null;
	}

	if ( host.localName === ELEMENT_NAME ) {
		defineElement( ownerWindow );
		ownerWindow.customElements?.upgrade?.( host );
	}

	const surface = setupShadowRoot( host );
	if ( surface !== host ) {
		appendStylesheet( host, options.styleUrl, 'plugin' );
		registerYandexStyleMirror( host );
	}

	host.toggleAttribute(
		'data-guyamap-editor-preview',
		options.editor === true
	);
	if ( options.editor === true ) {
		host.setAttribute( 'inert', '' );
		host.setAttribute( 'aria-disabled', 'true' );
	} else {
		host.removeAttribute( 'inert' );
		host.removeAttribute( 'aria-disabled' );
	}

	return surface;
}

/**
 * Waits for stylesheet links already discovered for a Shadow DOM map.
 * Stylesheet errors/timeouts are non-fatal; the runtime error boundary remains
 * responsible for SDK or renderer failures.
 *
 * @param {HTMLElement} host           Public map host.
 * @param {Document}    sourceDocument Document that owns Yandex SDK styles.
 * @return {Promise<void>} Settles after current stylesheet loads settle.
 */
export async function waitForMapHostStyles(
	host,
	sourceDocument = host?.ownerDocument
) {
	if ( ! host?.shadowRoot ) {
		return;
	}

	registerYandexStyleMirror( host, sourceDocument );
	mirrorYandexStyles( host, sourceDocument );
	await Promise.all( [
		...( HOST_STATE.get( host )?.stylePromises.values() ?? [] ),
	] );
}

/**
 * Releases document-level observers retained for a map host.
 *
 * @param {HTMLElement} host Public map host.
 */
export function releaseMapHost( host ) {
	const state = host ? HOST_STATE.get( host ) : null;
	const registrations = state?.yandexRegistries;
	if ( ! registrations?.size ) {
		return;
	}

	registrations.forEach( ( registry, sourceDocument ) => {
		registry.hosts.delete( host );
		if ( registry.hosts.size === 0 ) {
			registry.observer.disconnect();
			YANDEX_STYLES.delete( sourceDocument );
		}
	} );
	registrations.clear();
}

export { ELEMENT_NAME as MAP_ELEMENT_NAME };
