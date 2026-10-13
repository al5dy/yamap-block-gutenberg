/*
 * Deterministic stand-in for the Yandex Maps JavaScript API v3.
 *
 * It is served instead of https://api-maps.yandex.ru/v3/ by the mocked E2E
 * suites, so those tests need no API key and no network. It models the parts
 * of the SDK the plugin depends on:
 *
 * - entities keep their props in `_props`, like the real `YMapEntity`;
 * - the map exposes the real read accessors (`zoom`, `center`, `tilt`,
 *   `azimuth`, `theme`, `zoomRange`, `behaviors`, `restrictMapArea`, `bounds`,
 *   `size`, `projection`);
 * - DOM markers are wrapped in an absolutely positioned `ymaps3--marker`
 *   element that is sized by its in-flow content and placed with a transform
 *   at the Web Mercator pixel of their coordinate, also after the map is
 *   resized;
 * - `YMapComplexEntity`, `YMapCollection` and `YMapListener` behave closely
 *   enough for the bundled `@yandex/ymaps3-clusterer` package to run unchanged;
 * - an empty zoom interval throws, as it does in the real SDK;
 * - a `null` customization rule or styler raises an uncaught error, as the
 *   real vector worker does;
 * - a map-area restriction is enforced with south-west and north-east
 *   corners whenever the camera moves, as observed in the real SDK;
 * - lifting a map-area restriction through `update()` instead of
 *   `setRestrictMapArea()` corrupts the next bounds location, as observed in
 *   the real SDK.
 */
( () => {
	const TILE_SIZE = 256;
	const MAX_LATITUDE = 85.05112878;

	const assertZoomRange = ( props ) => {
		const range = props?.zoomRange;
		if ( range && range.min >= range.max ) {
			throw new Error(
				`Invalid zoom range, min >= max (${ range.min } >= ${ range.max })`
			);
		}
	};

	// World coordinates span -1..1 on both axes, as in the real projection.
	const projection = {
		toWorldCoordinates( [ longitude, latitude ] ) {
			const clamped = Math.max(
				-MAX_LATITUDE,
				Math.min( MAX_LATITUDE, latitude )
			);
			return {
				x: longitude / 180,
				y:
					Math.log(
						Math.tan( Math.PI / 4 + ( clamped * Math.PI ) / 360 )
					) / Math.PI,
			};
		},
		fromWorldCoordinates( { x, y } ) {
			return [
				x * 180,
				( Math.atan( Math.exp( y * Math.PI ) ) * 360 ) / Math.PI - 90,
			];
		},
	};

	class Entity {
		constructor( props ) {
			this._props = { ...props };
			this.parent = null;
		}

		get root() {
			let node = this;
			while ( node.parent ) {
				node = node.parent;
			}
			return node.isMap ? node : null;
		}

		update( props ) {
			Object.assign( this._props, props );
			this._onUpdate?.( props );
		}

		attach() {
			this._onAttach?.();
		}

		detach() {
			this._onDetach?.();
		}
	}

	class YMapComplexEntity extends Entity {
		constructor( props ) {
			super( props );
			this.children = [];
		}

		addChild( child ) {
			this.children.push( child );
			child.parent = this;
			if ( this.root ) {
				child.attach();
			}
			return this;
		}

		removeChild( child ) {
			if ( ! this.children.includes( child ) ) {
				return this;
			}
			this.children = this.children.filter(
				( current ) => current !== child
			);
			if ( this.root ) {
				child.detach();
			}
			child.parent = null;
			return this;
		}

		attach() {
			super.attach();
			[ ...this.children ].forEach( ( child ) => child.attach() );
		}

		detach() {
			[ ...this.children ].forEach( ( child ) => child.detach() );
			super.detach();
		}
	}

	class YMapCollection extends YMapComplexEntity {}

	class YMapListener extends Entity {
		_onAttach() {
			this.root.listeners.add( this );
		}

		_onDetach() {
			this.root?.listeners.delete( this );
		}
	}

	class Layer extends Entity {}

	// The real SDK reads rules and stylers in a worker without checking them,
	// so a `null` in either place surfaces as an uncaught error on the page.
	const applyCustomization = ( props ) => {
		const rules = props?.customization;
		if ( ! Array.isArray( rules ) ) {
			return;
		}

		const fail = ( property ) =>
			setTimeout( () => {
				throw new TypeError(
					`Cannot read properties of null (reading '${ property }')`
				);
			} );
		rules.forEach( ( rule ) => {
			if ( rule === null ) {
				fail( 'types' );
			} else if (
				rule.stylers === null ||
				[ rule.stylers ].flat().includes( null )
			) {
				fail( 'zoom' );
			}
		} );
	};

	class YMapDefaultSchemeLayer extends Layer {
		constructor( props ) {
			super( props );
			applyCustomization( props );
		}

		_onUpdate( props ) {
			applyCustomization( props );
		}
	}

	class YMapMarker extends Entity {
		constructor( props, element ) {
			super( props );
			this.element = element;
		}

		get coordinates() {
			return this._props.coordinates;
		}

		_onAttach() {
			const map = this.root;
			this.wrapper =
				map.rootElement.ownerDocument.createElement( 'ymaps3' );
			this.wrapper.className = 'ymaps3--marker';
			this.wrapper.style.position = 'absolute';
			this.wrapper.style.left = '0';
			this.wrapper.style.top = '0';
			this.wrapper.appendChild( this.element );
			map.element.appendChild( this.wrapper );
			map.markers.add( this );
			this.sync();
		}

		_onDetach() {
			this.root?.markers.delete( this );
			this.wrapper?.remove();
			this.wrapper = null;
		}

		_onUpdate() {
			this.sync();
		}

		sync() {
			const map = this.root;
			if ( ! this.wrapper || ! map ) {
				return;
			}
			const [ x, y ] = map.toPixels( this._props.coordinates );
			this.wrapper.style.transform = `translate(${ x.toFixed(
				3
			) }px, ${ y.toFixed( 3 ) }px)`;
			this.wrapper.style.zIndex = String( this._props.zIndex ?? 0 );
		}
	}

	class YMap extends YMapComplexEntity {
		constructor( rootElement, props ) {
			assertZoomRange( props );
			super( props );
			this.isMap = true;
			this.rootElement = rootElement;
			this.listeners = new Set();
			this.markers = new Set();
			this._zoom = props.location?.zoom ?? 10;
			this._center = props.location?.center ?? [ 0, 0 ];
			this.locations = [];
			this.element = rootElement.ownerDocument.createElement( 'ymaps3' );
			this.element.className = 'ymaps3--map';
			this.element.style.cssText =
				'position:absolute;inset:0;overflow:hidden;background:#dfe7ef';
			rootElement.appendChild( this.element );
			// The real map follows the size of its root element.
			const { ResizeObserver } = rootElement.ownerDocument.defaultView;
			this.resizeObserver = new ResizeObserver( () => this.notify() );
			this.resizeObserver.observe( rootElement );
			window.__guyamapFakeMaps.push( this );
			if ( props.location?.bounds ) {
				this.fitBounds( props.location.bounds );
			}
		}

		get root() {
			return this;
		}

		get zoom() {
			return this._zoom;
		}

		get center() {
			return this._center;
		}

		get tilt() {
			return this._props.camera?.tilt ?? 0;
		}

		// The real SDK reports its azimuth within one turn.
		get azimuth() {
			const turn = Math.PI * 2;
			const azimuth = this._props.camera?.azimuth ?? 0;
			return ( ( azimuth % turn ) + turn ) % turn;
		}

		get theme() {
			return this._props.theme ?? 'light';
		}

		get zoomRange() {
			return this._props.zoomRange ?? { min: 0, max: 21 };
		}

		get behaviors() {
			return this._props.behaviors ?? [];
		}

		get restrictMapArea() {
			return this._props.restrictMapArea ?? false;
		}

		get projection() {
			return projection;
		}

		get size() {
			const rect = this.rootElement.getBoundingClientRect();
			return { x: rect.width, y: rect.height };
		}

		get worldPixels() {
			return TILE_SIZE * 2 ** this._zoom;
		}

		get bounds() {
			const { x, y } = projection.toWorldCoordinates( this._center );
			const halfWidth = this.size.x / this.worldPixels;
			const halfHeight = this.size.y / this.worldPixels;
			return [
				projection.fromWorldCoordinates( {
					x: x - halfWidth,
					y: y + halfHeight,
				} ),
				projection.fromWorldCoordinates( {
					x: x + halfWidth,
					y: y - halfHeight,
				} ),
			];
		}

		toPixels( coordinates ) {
			const point = projection.toWorldCoordinates( coordinates );
			const center = projection.toWorldCoordinates( this._center );
			return [
				( ( point.x - center.x ) / 2 ) * this.worldPixels +
					this.size.x / 2,
				( ( center.y - point.y ) / 2 ) * this.worldPixels +
					this.size.y / 2,
			];
		}

		// The real SDK only releases a restriction cleanly through this setter.
		setRestrictMapArea( area ) {
			this._props.restrictMapArea = area;
			this._staleRestriction = false;
		}

		fitBounds( [ [ west, north ], [ east, south ] ] ) {
			const topLeft = projection.toWorldCoordinates( [ west, north ] );
			const bottomRight = projection.toWorldCoordinates( [
				east,
				south,
			] );
			const zoomFor = ( span, pixels ) =>
				span > 0
					? Math.log2( ( pixels * 2 ) / ( span * TILE_SIZE ) )
					: 21;
			const { min, max } = this.zoomRange;
			this._zoom = Math.max(
				min,
				Math.min(
					max,
					zoomFor( bottomRight.x - topLeft.x, this.size.x || 640 ),
					zoomFor( topLeft.y - bottomRight.y, this.size.y || 480 )
				)
			);
			this._center = projection.fromWorldCoordinates( {
				x: ( topLeft.x + bottomRight.x ) / 2,
				y: ( topLeft.y + bottomRight.y ) / 2,
			} );
			// Observed in the real SDK: after `update( { restrictMapArea:
			// false } )` lifted a restriction, a bounds location is centered
			// far away from the requested bounds.
			if ( this._staleRestriction ) {
				this._center = [
					this._center[ 0 ] - 2.6,
					this._center[ 1 ] - 6,
				];
			}
		}

		setLocation( location ) {
			this.locations.push( location );
			const before = [ this._zoom, ...this._center ].join();
			if ( Number.isFinite( location.zoom ) ) {
				this._zoom = location.zoom;
			}
			if ( Array.isArray( location.center ) ) {
				this._center = location.center;
			}
			if ( Array.isArray( location.bounds ) ) {
				this.fitBounds( location.bounds );
			}
			if ( before !== [ this._zoom, ...this._center ].join() ) {
				this.applyRestriction();
			}
			this.notify();
		}

		// Observed in the real SDK: when the camera moves, the view is kept
		// north and east of the first corner and then south and west of the
		// second. Top-left and bottom-right corners, the order the reference
		// documents, therefore pin the view just outside the area.
		applyRestriction() {
			const area = this._props.restrictMapArea;
			if ( ! Array.isArray( area ) ) {
				return;
			}

			const first = projection.toWorldCoordinates( area[ 0 ] );
			const second = projection.toWorldCoordinates( area[ 1 ] );
			const halfWidth = this.size.x / this.worldPixels;
			const halfHeight = this.size.y / this.worldPixels;
			let { x, y } = projection.toWorldCoordinates( this._center );
			x = Math.max( x, first.x + halfWidth );
			x = Math.min( x, second.x - halfWidth );
			y = Math.max( y, first.y + halfHeight );
			y = Math.min( y, second.y - halfHeight );
			this._center = projection.fromWorldCoordinates( { x, y } );
		}

		update( props ) {
			assertZoomRange( props );
			if (
				'restrictMapArea' in props &&
				! props.restrictMapArea &&
				Array.isArray( this._props.restrictMapArea )
			) {
				this._staleRestriction = true;
			}
			Object.assign( this._props, props );
			if ( props.location ) {
				this.setLocation( props.location );
			} else {
				this.notify();
			}
		}

		notify() {
			this.markers.forEach( ( marker ) => marker.sync() );
			this.listeners.forEach( ( listener ) =>
				listener._props.onUpdate?.( {
					location: { center: this._center, zoom: this._zoom },
					mapInAction: false,
				} )
			);
		}

		destroy() {
			this.destroyed = true;
			this.resizeObserver.disconnect();
			[ ...this.children ].forEach( ( child ) =>
				this.removeChild( child )
			);
			this.element.remove();
		}
	}

	window.__guyamapFakeMaps = [];
	window.ymaps3 = {
		ready: Promise.resolve(),
		YMap,
		YMapMarker,
		YMapComplexEntity,
		YMapCollection,
		YMapListener,
		YMapDefaultSchemeLayer,
		YMapDefaultFeaturesLayer: Layer,
	};
} )();
