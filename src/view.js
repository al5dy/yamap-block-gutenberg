import { destroyMap, mountMap } from './runtime/map';

const SELECTOR = '[data-guyamap-map]';
const initialized = new WeakMap();
const stateListeners = new WeakMap();
const observers = new Map();

const parseConfig = ( block ) => {
	const configNode = block.querySelector( '.guyamap-map__config' );
	if ( ! configNode ) {
		return null;
	}

	try {
		return JSON.parse( configNode.textContent );
	} catch ( error ) {
		block.dataset.guyamapState = 'error';
		block.dispatchEvent(
			new CustomEvent( 'guyamap:error', {
				bubbles: true,
				detail: { error },
			} )
		);
		return null;
	}
};

const mountBlock = ( block, config ) => {
	if ( initialized.has( block ) ) {
		return;
	}

	const canvas = block.querySelector(
		'guyamap-map-view.guyamap-map__canvas, .guyamap-map__canvas'
	);
	if ( ! canvas ) {
		return;
	}

	delete block.dataset.guyamapReady;
	delete block.dataset.guyamapError;
	block.dataset.guyamapState = 'loading';
	const handleStateChange = ( event ) => {
		const state = event.detail?.state;
		if ( typeof state === 'string' && state ) {
			block.dataset.guyamapState = state;
		}
		if ( state === 'error' && canvas.dataset.errorCode ) {
			block.dataset.guyamapError = canvas.dataset.errorCode;
		} else {
			delete block.dataset.guyamapError;
		}
	};
	canvas.addEventListener( 'guyamap:statechange', handleStateChange );
	stateListeners.set( block, { canvas, handleStateChange } );
	canvas.addEventListener(
		'guyamap:ready',
		() => {
			block.dataset.guyamapReady = 'true';
			block.dataset.guyamapState = 'ready';
		},
		{ once: true }
	);

	const controller = mountMap( canvas, config );
	initialized.set( block, controller );
	controller?.ready?.then( () => {
		if ( controller.map ) {
			block.dataset.guyamapReady = 'true';
			block.dataset.guyamapState = 'ready';
		}
	} );
};

const getObserver = ( rootMargin ) => {
	if ( observers.has( rootMargin ) ) {
		return observers.get( rootMargin );
	}

	const targets = new Set();
	const observer = new window.IntersectionObserver(
		( entries ) => {
			entries.forEach( ( entry ) => {
				if ( ! entry.isIntersecting ) {
					return;
				}
				observer.unobserve( entry.target );
				targets.delete( entry.target );
				const config = parseConfig( entry.target );
				if ( config ) {
					mountBlock( entry.target, config );
				}
			} );

			if ( targets.size === 0 ) {
				observer.disconnect();
				observers.delete( rootMargin );
			}
		},
		{ rootMargin }
	);
	const record = { observer, targets };
	observers.set( rootMargin, record );
	return record;
};

const initializeBlock = ( block ) => {
	if ( initialized.has( block ) ) {
		return;
	}

	const config = parseConfig( block );
	if ( ! config ) {
		return;
	}

	if ( config.loading?.lazy && 'IntersectionObserver' in window ) {
		const record = getObserver( config.loading.rootMargin || '300px' );
		record.targets.add( block );
		record.observer.observe( block );
		return;
	}

	mountBlock( block, config );
};

export const refresh = ( root = document ) => {
	if ( root.matches?.( SELECTOR ) ) {
		initializeBlock( root );
	}
	root.querySelectorAll?.( SELECTOR ).forEach( initializeBlock );
};

export const destroy = ( root = document ) => {
	const blocks = root.matches?.( SELECTOR )
		? [ root ]
		: root.querySelectorAll?.( SELECTOR ) || [];
	blocks.forEach( ( block ) => {
		observers.forEach( ( record, rootMargin ) => {
			record.observer.unobserve( block );
			record.targets.delete( block );
			if ( record.targets.size === 0 ) {
				record.observer.disconnect();
				observers.delete( rootMargin );
			}
		} );
		const controller = initialized.get( block );
		if ( controller ) {
			destroyMap( controller );
			initialized.delete( block );
		}
		const stateListener = stateListeners.get( block );
		if ( stateListener ) {
			stateListener.canvas.removeEventListener(
				'guyamap:statechange',
				stateListener.handleStateChange
			);
			stateListeners.delete( block );
		}
		delete block.dataset.guyamapReady;
		delete block.dataset.guyamapError;
		block.dataset.guyamapState = 'destroyed';
	} );
};

window.guyamap = Object.freeze( { refresh, destroy } );

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', () => refresh(), {
		once: true,
	} );
} else {
	refresh();
}

document.addEventListener( 'guyamap:refresh', ( event ) => {
	refresh( event.detail?.root || document );
} );
