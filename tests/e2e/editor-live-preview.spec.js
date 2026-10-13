/*
 * Drives every control of the block inspector through the real editor UI and
 * asserts that the change reaches the map in the block preview immediately,
 * without the map being recreated.
 *
 * The suite runs against the mocked SDK by default. Set
 * GUYAMAP_E2E_LIVE_SDK=real to run the same assertions against the real
 * Yandex SDK (requires a key that Yandex accepts for the tested host).
 */
const { expect, test } = require( '@playwright/test' );

const { login } = require( './support/login' );
const { REAL_SDK, provideSdk } = require( './support/sdk' );

const username = process.env.GUYAMAP_E2E_USERNAME;
const password = process.env.GUYAMAP_E2E_PASSWORD;
const postId = process.env.GUYAMAP_E2E_LIVE_POST_ID;
const SDK_ERROR_REPORTS = '/services/logging/error-booster';
const SDK_REPORT_DELAY = 12000;
const TWO_PI = Math.PI * 2;
const DEFAULT_CENTER = { latitude: 55.751244, longitude: 37.618423 };
// Loading settings of the fixture page created by scripts/run-e2e.js.
const EAGER_LOADING = {
	lazy: false,
	rootMargin: '300px',
	clickToActivate: false,
	preloader: { enabled: false },
};

// Opening the editor of the tested site alone can take most of a minute.
test.describe.configure( { timeout: REAL_SDK ? 300000 : 180000 } );

// Records controllers per Window. The editor canvas keeps its Window while
// its document is replaced; WebKit drops the listeners of the first document,
// so they are added on every run. Adding the same listener twice is a no-op.
const recordControllers = ( page ) =>
	page.addInitScript( () => {
		if ( ! window.__guyamapLive ) {
			const live = { ready: [], errors: [] };
			live.onReady = ( event ) =>
				live.ready.push( {
					controller: event.detail.controller,
					map: event.detail.map,
				} );
			live.onError = ( event ) => live.errors.push( event.detail.code );
			window.__guyamapLive = live;
		}
		window.addEventListener(
			'guyamap:ready',
			window.__guyamapLive.onReady,
			true
		);
		window.addEventListener(
			'guyamap:error',
			window.__guyamapLive.onError,
			true
		);
	} );

/**
 * Reads the state of a map in the document: what the SDK map object reports,
 * what the runtime rendered around it and how large the block is.
 *
 * @param {import('@playwright/test').Frame} frame Frame that contains the map.
 * @param {number}                           index Position of the map.
 * @return {Promise<Object>} Map snapshot.
 */
const probe = ( frame, index = 0 ) =>
	frame.evaluate( ( position ) => {
		const host =
			document.querySelectorAll( 'guyamap-map-view' )[ position ];
		if ( ! host ) {
			return { state: 'missing', mounts: 0 };
		}
		const live = window.__guyamapLive;
		const records = live.ready.filter(
			( record ) => record.controller.container === host
		);
		const record = records[ records.length - 1 ];
		if ( ! record?.controller.map ) {
			return { state: host?.dataset.state, mounts: records.length };
		}

		const { controller } = record;
		const { map } = controller;
		const root = host.shadowRoot;
		const props = map._props;
		const round = ( value, digits = 4 ) =>
			Math.round( value * 10 ** digits ) / 10 ** digits;
		const rect = ( element ) => {
			const box = element.getBoundingClientRect();
			return [ Math.round( box.width ), Math.round( box.height ) ];
		};
		const hostBox = host.getBoundingClientRect();
		const controls = root.querySelector( '.guyamap-map__controls' );
		const controlsBox = controls?.getBoundingClientRect();
		const copyrights = root.querySelector( '.ymaps3--map-copyrights' );
		const entities = Array.isArray( controller.markerLayer )
			? controller.markerLayer
			: [];
		const block =
			host.closest( '.guyamap-block-editor' ) ??
			host.closest( '[data-guyamap-map]' );

		return {
			state: host.dataset.state,
			mounts: records.length,
			sameMap: map === record.map,
			errors: live.errors,
			inert: host.hasAttribute( 'inert' ),
			ariaLabel: host.getAttribute( 'aria-label' ),
			blockSize: rect( block ),
			blockClass: block.className,
			blockStyle: block.getAttribute( 'style' ) ?? '',
			hostSize: rect( host ),
			mapSize: [ Math.round( map.size.x ), Math.round( map.size.y ) ],
			center: [ round( map.center[ 0 ] ), round( map.center[ 1 ] ) ],
			zoom: round( map.zoom, 2 ),
			tilt: round( map.tilt, 3 ),
			azimuth: round( map.azimuth, 3 ),
			theme: map.theme,
			// Visible area as west, north, east and south.
			view: [ ...map.bounds[ 0 ], ...map.bounds[ 1 ] ].map( ( value ) =>
				round( value, 3 )
			),
			zoomRange: { ...map.zoomRange },
			behaviors: [ ...map.behaviors ],
			restrict: Array.isArray( map.restrictMapArea )
				? map.restrictMapArea.map( ( point ) =>
						point.map( ( value ) => round( value, 6 ) )
				  )
				: map.restrictMapArea,
			mode: props.mode,
			zoomRounding: props.zoomRounding,
			zoomStrategy: props.zoomStrategy,
			margin: props.margin,
			copyrightsPosition: props.copyrightsPosition,
			showScale: props.showScaleInCopyrights,
			copyrightsClass: copyrights?.className ?? null,
			customization: controller.schemeLayer._props.customization,
			controls: [
				...root.querySelectorAll( '.guyamap-map__control' ),
			].map( ( button ) => button.getAttribute( 'aria-label' ) ),
			controlsPosition: controls?.dataset.position ?? null,
			controlsLayout: controls
				? host.ownerDocument.defaultView.getComputedStyle( controls )
						.flexDirection
				: null,
			// Buttons that overlap each other or leave the map.
			misplacedButtons: ( () => {
				const boxes = [
					...root.querySelectorAll(
						'.guyamap-map__fullscreen, .guyamap-map__control'
					),
				].map( ( button ) => button.getBoundingClientRect() );
				return boxes.filter(
					( box ) =>
						box.left < hostBox.left ||
						box.right > hostBox.right ||
						box.top < hostBox.top ||
						box.bottom > hostBox.bottom ||
						boxes.some(
							( other ) =>
								other !== box &&
								box.left < other.right &&
								other.left < box.right &&
								box.top < other.bottom &&
								other.top < box.bottom
						)
				).length;
			} )(),
			controlsOnLeft: controlsBox
				? controlsBox.left + controlsBox.width / 2 <
				  hostBox.left + hostBox.width / 2
				: null,
			fullscreen: Boolean(
				root.querySelector( '.guyamap-map__fullscreen' )
			),
			clusters: [ ...root.querySelectorAll( '.guyamap-cluster' ) ].map(
				( cluster ) => ( {
					count: Number( cluster.textContent ),
					color: cluster.style.getPropertyValue(
						'--guyamap-cluster-color'
					),
				} )
			),
			markers: [
				...root.querySelectorAll(
					'.guyamap-default-marker, .guyamap-image-marker'
				),
			].map( ( element ) => {
				const trigger = element.querySelector(
					'.guyamap-default-marker__trigger, .guyamap-image-marker__trigger'
				);
				const popup = element.querySelector( '.guyamap-popup' );
				const link = popup?.querySelector( 'a' );
				const image = element.querySelector(
					'.guyamap-image-marker__image'
				);
				const box = element.getBoundingClientRect();
				const text = ( selector ) =>
					popup?.querySelector( selector )?.textContent ?? null;

				return {
					image: element.classList.contains( 'guyamap-image-marker' ),
					size:
						[ 'normal', 'small', 'micro' ].find( ( size ) =>
							element.classList.contains(
								`guyamap-default-marker--${ size }`
							)
						) ?? null,
					color: element.style.getPropertyValue(
						'--guyamap-marker-color'
					),
					label: trigger.getAttribute( 'aria-label' ),
					interactive: trigger.tagName === 'BUTTON',
					icon:
						element
							.querySelector( '.guyamap-default-marker__icon' )
							?.getAttribute( 'src' )
							?.split( '/' )
							.pop() ?? null,
					imageSrc: image?.getAttribute( 'src' ) ?? null,
					box: [ Math.round( box.width ), Math.round( box.height ) ],
					offset: [ element.style.left, element.style.top ],
					hint:
						element.querySelector( '.guyamap-marker-hint' )
							?.textContent ?? null,
					category: text( '.guyamap-popup__category' ),
					title: text( '.guyamap-popup__title' ),
					description: text( '.guyamap-popup__description' ),
					address: text( '.guyamap-popup__address' ),
					link: link
						? {
								href: link.getAttribute( 'href' ),
								text: link.textContent,
								target: link.getAttribute( 'target' ),
						  }
						: null,
					// Pixel position of the coordinate inside the map.
					position: [
						Math.round(
							element.parentElement.getBoundingClientRect().left -
								hostBox.left
						),
						Math.round(
							element.parentElement.getBoundingClientRect().top -
								hostBox.top
						),
					],
					stack: element.parentElement.style.zIndex,
				};
			} ),
			entities: entities.map( ( entity ) => ( {
				coordinates: entity._props.coordinates.map( ( value ) =>
					round( value )
				),
				zIndex: entity._props.zIndex,
				draggable: entity._props.draggable === true,
				hideOutside: entity._props.hideOutsideViewport,
			} ) ),
		};
	}, index );

const openEditor = async ( page ) => {
	await recordControllers( page );
	await login( page, username, password );
	await provideSdk( page );
	await page.goto( `/wp-admin/post.php?post=${ postId }&action=edit`, {
		waitUntil: 'domcontentloaded',
	} );
	await page.waitForFunction(
		() => window.wp?.data?.select( 'core/block-editor' )?.getBlocks().length
	);
	// The editor remembers its mode per user; an earlier test may have left
	// the code editor or a device preview behind.
	await page.evaluate( () => {
		window.wp.data
			.dispatch( 'core/preferences' )
			.set( 'core/edit-post', 'welcomeGuide', false );
		window.wp.data.dispatch( 'core/editor' ).switchEditorMode( 'visual' );
		window.wp.data.dispatch( 'core/editor' ).setDeviceType( 'Desktop' );
	} );
	await expect(
		page.locator( 'iframe[name="editor-canvas"]' )
	).toBeVisible();
	const clientId = await page.evaluate( ( loading ) => {
		const block = window.wp.data
			.select( 'core/block-editor' )
			.getBlocks()
			.find(
				( candidate ) => candidate.name === 'gutenberg-yandex-block/map'
			);
		// The last test of a run saves the page. Start every test from the
		// defaults of the block, whatever an earlier run or browser saved.
		const defaults = {};
		Object.entries(
			window.wp.blocks.getBlockType( block.name ).attributes
		).forEach( ( [ name, schema ] ) => {
			defaults[ name ] = schema.default;
		} );
		window.wp.data
			.dispatch( 'core/block-editor' )
			.updateBlockAttributes( block.clientId, { ...defaults, loading } );
		window.wp.data
			.dispatch( 'core/block-editor' )
			.selectBlock( block.clientId );
		window.wp.data
			.dispatch( 'core/edit-post' )
			.openGeneralSidebar( 'edit-post/block' );
		return block.clientId;
	}, EAGER_LOADING );
	const editor = page.frameLocator( 'iframe[name="editor-canvas"]' );
	const host = editor.locator( 'guyamap-map-view' ).first();
	// The real Yandex endpoint is occasionally slow enough to hit the load
	// timeout; the preview's own retry button recovers from that.
	for ( let attempt = 0; REAL_SDK && attempt < 2; attempt += 1 ) {
		await expect( host ).toHaveAttribute( 'data-state', /ready|error/, {
			timeout: 60000,
		} );
		if ( ( await host.getAttribute( 'data-state' ) ) === 'ready' ) {
			break;
		}
		await editor
			.getByRole( 'button', { name: 'Retry map preview' } )
			.first()
			.click();
	}
	await expect( host ).toHaveAttribute( 'data-state', 'ready', {
		timeout: 60000,
	} );
	// The canvas frame is replaced when the editor rebuilds it.
	const frame = () => page.frame( { name: 'editor-canvas' } );

	const live = {
		page,
		editor,
		clientId,
		probe: ( index ) => probe( frame(), index ),
		dispatch: ( store, action, ...parameters ) =>
			page.evaluate(
				( [ name, method, values ] ) =>
					window.wp.data.dispatch( name )[ method ]( ...values ),
				[ store, action, parameters ]
			),
		attributes: () =>
			page.evaluate(
				( id ) =>
					window.wp.data.select( 'core/block-editor' ).getBlock( id )
						.attributes,
				clientId
			),
		setAttributes: ( attributes, id = clientId ) =>
			page.evaluate(
				( [ block, next ] ) =>
					window.wp.data
						.dispatch( 'core/block-editor' )
						.updateBlockAttributes( block, next ),
				[ id, attributes ]
			),
		// Asserts on a live map, polling while the SDK animates, the
		// clusterer re-renders or the editor rebuilds its canvas.
		expectMap: ( pick, expected, message, index = 0 ) =>
			expect
				.poll(
					async () => {
						try {
							return pick( await probe( frame(), index ) );
						} catch {
							return undefined;
						}
					},
					{ message, timeout: REAL_SDK ? 60000 : 20000 }
				)
				.toEqual( expected ),
		openPanel: async ( title ) => {
			const toggle = page.getByRole( 'button', {
				name: title,
				exact: true,
			} );
			await toggle.scrollIntoViewIfNeeded();
			if ( ( await toggle.getAttribute( 'aria-expanded' ) ) !== 'true' ) {
				await toggle.click();
			}
		},
		// Types into a field and leaves it, as an editor would.
		type: async ( label, value ) => {
			const field = page.getByLabel( label, { exact: true } );
			await field.fill( String( value ) );
			await field.blur();
		},
		// The map object must survive every inspector change.
		expectUntouchedMap: async () => {
			const state = await probe( frame() );
			expect( state.state ).toBe( 'ready' );
			expect( state.mounts, 'the preview was not remounted' ).toBe( 1 );
			expect( state.sameMap, 'the YMap instance was kept' ).toBe( true );
			expect( state.errors ).toEqual( [] );
			expect( state.inert, 'the preview stays locked' ).toBe( true );
		},
	};

	return live;
};

/**
 * Switches a checkbox or toggle. The editor applies the change through its
 * data store, so the control may report its new state a moment after the
 * click; `check()` and `uncheck()` do not wait for that.
 *
 * @param {import('@playwright/test').Locator} control Checkbox or toggle.
 * @param {boolean}                            checked Wanted state.
 */
const setToggle = async ( control, checked ) => {
	if ( ( await control.isChecked() ) !== checked ) {
		await control.click();
	}
	await expect( control ).toBeChecked( { checked } );
};

const marker = ( id, north, east, extra = {} ) => ( {
	id,
	title: id,
	coordinates: {
		latitude: DEFAULT_CENTER.latitude + north,
		longitude: DEFAULT_CENTER.longitude + east,
	},
	...extra,
} );

const normalizeAngle = ( radians ) =>
	Math.round( ( ( ( radians % TWO_PI ) + TWO_PI ) % TWO_PI ) * 1000 ) / 1000;

test.beforeAll( () => {
	if ( ! username || ! password || ! postId ) {
		throw new Error(
			'GUYAMAP_E2E_USERNAME, GUYAMAP_E2E_PASSWORD and GUYAMAP_E2E_LIVE_POST_ID are required. Run "npm run test:e2e".'
		);
	}
} );

test.describe( 'inspector controls update the preview live', () => {
	let pageErrors;
	let sdkReports;
	let watchTiles;

	test.beforeEach( ( { page } ) => {
		pageErrors = [];
		sdkReports = [];
		watchTiles = false;
		// The SDK posts every error it catches to Yandex. A report means the
		// plugin handed it something it could not process.
		page.on( 'request', ( request ) => {
			if ( ! request.url().includes( SDK_ERROR_REPORTS ) ) {
				return;
			}

			let errors = [];
			try {
				errors = JSON.parse( request.postData() ?? '{}' ).errors ?? [];
			} catch {}
			errors
				// Whether the vector engine starts depends on the GPU of the
				// machine running the suite.
				.filter(
					( error ) => error.additional?.group !== 'vector-engine'
				)
				.forEach( ( error ) =>
					sdkReports.push(
						`${ error.additional?.group }: ${ error.message }`
					)
				);
		} );
		page.on( 'pageerror', ( error ) => {
			// Without a GPU the real SDK cannot start its vector engine and
			// rejects an internal promise with no reason when vector mode is
			// requested. That is outside the plugin and specific to the
			// machine running the suite.
			if ( REAL_SDK && error.message === 'undefined' && ! error.stack ) {
				return;
			}
			pageErrors.push( error.message );
		} );
	} );

	test.afterEach( async ( { page } ) => {
		if ( REAL_SDK ) {
			// The SDK sends its reports in batches, several seconds late.
			await page.waitForTimeout( SDK_REPORT_DELAY );
		}
		expect( pageErrors, 'no uncaught errors in the editor' ).toEqual( [] );
		expect(
			// A tile that fails to load is usually the network. It only
			// points at the plugin in a test that changes the map style.
			sdkReports.filter(
				( report ) =>
					watchTiles || ! report.startsWith( 'raster-tiles:' )
			),
			'the SDK reported no errors to Yandex'
		).toEqual( [] );
	} );

	test( 'Viewport: center, zoom, zoom range, tilt and azimuth', async ( {
		page,
	} ) => {
		const live = await openEditor( page );
		await live.expectMap(
			( state ) => [ state.center, state.zoom ],
			[ [ 37.6184, 55.7512 ], 12 ]
		);

		await live.type( 'Center latitude', '59.9343' );
		await live.type( 'Center longitude', '30.3351' );
		await live.expectMap( ( state ) => state.center, [ 30.3351, 59.9343 ] );

		await page
			.getByRole( 'slider', { name: 'Zoom', exact: true } )
			.fill( '15' );
		await live.expectMap( ( state ) => state.zoom, 15 );

		await page
			.getByRole( 'spinbutton', { name: 'Zoom', exact: true } )
			.fill( '9.5' );
		await live.expectMap( ( state ) => state.zoom, 9.5 );

		await live.type( 'Maximum zoom', '14' );
		await live.expectMap( ( state ) => state.zoomRange, {
			min: 1,
			max: 14,
		} );

		// Raising the minimum above the current zoom moves the map with it.
		await live.type( 'Minimum zoom', '11' );
		await live.expectMap(
			( state ) => [ state.zoomRange, state.zoom ],
			[ { min: 11, max: 14 }, 11 ]
		);

		await page
			.getByRole( 'slider', { name: 'Camera tilt', exact: true } )
			.fill( '40' );
		await live.expectMap(
			( state ) => state.tilt,
			Math.round( ( ( 40 * Math.PI ) / 180 ) * 1000 ) / 1000
		);

		await page
			.getByRole( 'slider', { name: 'Camera azimuth', exact: true } )
			.fill( '-45' );
		await live.expectMap(
			( state ) => normalizeAngle( state.azimuth ),
			normalizeAngle( ( -45 * Math.PI ) / 180 )
		);

		await live.expectUntouchedMap();
	} );

	test( 'Container: width, height, minimum height and aspect ratio', async ( {
		page,
	} ) => {
		const live = await openEditor( page );
		await live.openPanel( 'Container' );
		const full = ( await live.probe() ).blockSize;
		expect( full[ 1 ] ).toBe( 480 );

		await live.type( 'Height', '300px' );
		await live.expectMap( ( state ) => state.blockSize[ 1 ], 300 );

		// The height cannot go below the minimum height...
		await live.type( 'Height', '100px' );
		await live.expectMap( ( state ) => state.blockSize[ 1 ], 280 );
		// ...until the minimum height is lowered as well.
		await live.type( 'Minimum height', '150px' );
		await live.expectMap( ( state ) => state.blockSize[ 1 ], 150 );

		await live.type( 'Width', '50%' );
		await live.expectMap(
			( state ) => Math.abs( state.blockSize[ 0 ] - full[ 0 ] / 2 ) <= 1,
			true
		);

		await live.type( 'Width', '100%' );
		await live.type( 'Aspect ratio', '2 / 1' );
		await live.expectMap(
			( state ) =>
				Math.abs( state.blockSize[ 1 ] - state.blockSize[ 0 ] / 2 ) <=
				1,
			true
		);

		// The map surface itself follows the block.
		await live.expectMap(
			( state ) =>
				state.hostSize[ 0 ] === state.blockSize[ 0 ] &&
				state.hostSize[ 1 ] === state.blockSize[ 1 ] &&
				state.mapSize[ 0 ] === state.blockSize[ 0 ] &&
				state.mapSize[ 1 ] === state.blockSize[ 1 ],
			true
		);
		await live.expectMap(
			( state ) => [ state.controlsLayout, state.misplacedButtons ],
			[ 'column', 0 ]
		);

		// A short map has no room for a column of buttons beside the
		// fullscreen button; they line up along the top edge instead.
		await live.type( 'Width', '50%' );
		await live.expectMap(
			( state ) => [
				state.blockSize[ 1 ] < 200,
				state.controls.length,
				state.fullscreen,
				state.controlsLayout,
				state.misplacedButtons,
			],
			[ true, 3, true, 'row', 0 ],
			'no button overlaps another or leaves a short map'
		);
		await live.expectUntouchedMap();
	} );

	test( 'Map appearance: rendering mode, theme and customization', async ( {
		page,
	} ) => {
		// The tile server refuses a style it cannot read.
		watchTiles = true;
		const live = await openEditor( page );
		await live.openPanel( 'Map appearance' );
		await live.expectMap(
			( state ) => [ state.mode, state.theme, state.customization ],
			[ 'auto', 'light', [] ]
		);

		for ( const mode of [ 'raster', 'vector', 'auto' ] ) {
			await page.getByLabel( 'Rendering mode' ).selectOption( mode );
			await live.expectMap( ( state ) => state.mode, mode );
		}

		await page.getByLabel( 'Map theme' ).selectOption( 'dark' );
		await live.expectMap( ( state ) => state.theme, 'dark' );
		await page.getByLabel( 'Map theme' ).selectOption( 'light' );
		await live.expectMap( ( state ) => state.theme, 'light' );

		const rules = [
			{
				tags: { all: [ 'water' ] },
				elements: 'geometry',
				stylers: [ { color: '#ff0000' } ],
			},
		];
		const json = page.getByLabel( 'Customization JSON' );
		const problems = page.locator(
			'.guyamap-json-control .components-notice.is-error'
		);
		// A valid style is applied while the field still has focus.
		await json.fill( JSON.stringify( rules ) );
		await live.expectMap( ( state ) => state.customization, rules );
		await expect( problems ).toHaveCount( 0 );

		// Invalid JSON is reported and never reaches the map.
		await json.fill( '[{"tags":' );
		await json.blur();
		await expect( problems ).toBeVisible();
		await live.expectMap( ( state ) => state.customization, rules );

		// Neither does JSON the SDK cannot process. A null rule or styler
		// throws inside its vector worker; an unknown value makes the tile
		// server refuse every raster tile.
		for ( const [ style, message ] of [
			[ '[null]', 'Rule 1 must be an object.' ],
			[
				'[{"tags":"water","stylers":[null]}]',
				'Rule 1: "stylers[0]" has an unsupported value.',
			],
			[
				'[{"tags":"water","stylers":{"color":"blue"}}]',
				'Rule 1: "stylers[0].color" has an unsupported value.',
			],
			[
				'[{"tags":"water","stylers":{"glow":1,"opacity":1}}]',
				'Rule 1: "stylers[0].glow" is not a supported styler property.',
			],
			[
				'[{"types":"circle","stylers":{"opacity":1}}]',
				'Rule 1: "types" has an unsupported value.',
			],
			[ '{"style":[]}', 'The value must be a JSON array.' ],
		] ) {
			await json.fill( style );
			await json.blur();
			await expect( problems ).toContainText( message );
			expect( ( await live.attributes() ).customization ).toEqual(
				rules
			);
		}
		await live.expectMap( ( state ) => state.customization, rules );

		// A single styler object is accepted and reaches the SDK as a list.
		await json.fill( '[{"tags":"water","stylers":{"color":"#00aa00"}}]' );
		await live.expectMap(
			( state ) => state.customization,
			[ { tags: 'water', stylers: [ { color: '#00aa00' } ] } ]
		);

		// Raster tiles carry the style in their address, which has a limit,
		// and every mode falls back to raster tiles on a device that cannot
		// draw the vector map. The real tile server refuses such a style, so
		// only the mocked SDK is given one.
		const warning = page.locator(
			'.guyamap-json-control .components-notice.is-warning'
		);
		await expect( warning ).toHaveCount( 0 );
		if ( ! REAL_SDK ) {
			const longStyle = Array.from(
				{ length: 120 },
				( unused, index ) => ( {
					tags: { any: [ 'water', 'road', 'admin', 'poi' ] },
					elements: [ 'geometry', 'label.text.fill' ],
					stylers: [
						{
							color: `#${ ( 0x100000 + index ).toString( 16 ) }`,
							opacity: 0.9,
							zoom: [ 1, 21 ],
						},
					],
				} )
			);
			await json.fill( JSON.stringify( longStyle ) );
			await json.blur();
			await live.expectMap(
				( state ) => state.customization.length,
				120
			);
			await expect( warning ).toContainText(
				'Devices that cannot draw the vector map'
			);
			await page.getByLabel( 'Rendering mode' ).selectOption( 'raster' );
			await expect( warning ).toContainText( 'the map stays empty' );
			await page.getByLabel( 'Rendering mode' ).selectOption( 'auto' );
		}

		await json.fill( '[]' );
		await json.blur();
		await live.expectMap( ( state ) => state.customization, [] );
		await expect( warning ).toHaveCount( 0 );
		await live.expectUntouchedMap();
	} );

	test( 'Behaviors: stored for the published page, preview stays locked', async ( {
		page,
	} ) => {
		const live = await openEditor( page );
		await live.openPanel( 'Behaviors' );
		const labels = {
			Drag: 'drag',
			'Mouse-wheel zoom': 'scrollZoom',
			'Pinch zoom': 'pinchZoom',
			'Double-click zoom': 'dblClick',
			'Mouse tilt': 'mouseTilt',
			'Mouse rotation': 'mouseRotate',
			Magnifier: 'magnifier',
			'One-finger zoom': 'oneFingerZoom',
			'Pinch rotation': 'pinchRotate',
			'Pan and tilt': 'panTilt',
		};

		for ( const [ label, behavior ] of Object.entries( labels ) ) {
			const checkbox = page.getByRole( 'checkbox', {
				name: label,
				exact: true,
			} );
			const wasEnabled = await checkbox.isChecked();
			await setToggle( checkbox, ! wasEnabled );
			expect(
				( await live.attributes() ).behaviors.includes( behavior )
			).toBe( ! wasEnabled );
			await setToggle( checkbox, wasEnabled );
			expect(
				( await live.attributes() ).behaviors.includes( behavior )
			).toBe( wasEnabled );
		}

		// The editor preview never accepts map gestures.
		await live.expectMap( ( state ) => state.behaviors, [] );
		await live.expectUntouchedMap();
	} );

	test( 'Controls: zoom, geolocation, fullscreen and position', async ( {
		page,
	} ) => {
		const live = await openEditor( page );
		await live.openPanel( 'Controls' );
		const all = [ 'Zoom in', 'Zoom out', 'Show my location' ];
		await live.expectMap(
			( state ) => [
				state.controls,
				state.fullscreen,
				state.controlsPosition,
				state.controlsOnLeft,
			],
			[ all, true, 'right', false ]
		);

		await setToggle( page.getByLabel( 'Zoom control' ), false );
		await live.expectMap(
			( state ) => state.controls,
			[ 'Show my location' ]
		);

		await setToggle( page.getByLabel( 'Geolocation control' ), false );
		await live.expectMap(
			( state ) => [ state.controls, state.controlsPosition ],
			[ [], null ]
		);

		await setToggle( page.getByLabel( 'Fullscreen control' ), false );
		await live.expectMap( ( state ) => state.fullscreen, false );

		await setToggle( page.getByLabel( 'Fullscreen control' ), true );
		await setToggle( page.getByLabel( 'Zoom control' ), true );
		await setToggle( page.getByLabel( 'Geolocation control' ), true );
		await live.expectMap(
			( state ) => [ state.controls, state.fullscreen ],
			[ all, true ]
		);

		await page.getByLabel( 'Controls position' ).selectOption( 'left' );
		await live.expectMap(
			( state ) => [ state.controlsPosition, state.controlsOnLeft ],
			[ 'left', true ]
		);
		await page.getByLabel( 'Controls position' ).selectOption( 'right' );
		await live.expectMap(
			( state ) => [ state.controlsPosition, state.controlsOnLeft ],
			[ 'right', false ]
		);
		await live.expectUntouchedMap();
	} );

	test( 'Advanced map options: copyrights, zoom, restriction, margins and fit', async ( {
		page,
	} ) => {
		const live = await openEditor( page );
		await live.openPanel( 'Advanced map options' );

		for ( const position of [
			'bottom left',
			'top right',
			'top left',
			'bottom right',
		] ) {
			await page
				.getByLabel( 'Copyrights position' )
				.selectOption( position );
			await live.expectMap(
				( state ) => state.copyrightsPosition,
				position
			);
			if ( REAL_SDK ) {
				// The real SDK moves its copyright element accordingly.
				const [ vertical, horizontal ] = position.split( ' ' );
				await live.expectMap(
					( state ) =>
						state.copyrightsClass.includes(
							`copyrights_${ vertical }`
						) &&
						state.copyrightsClass.includes(
							`copyrights_${ horizontal }`
						),
					true
				);
			}
		}

		await live.expectMap( ( state ) => state.showScale, true );
		await setToggle( page.getByLabel( 'Show scale in copyrights' ), false );
		await live.expectMap( ( state ) => state.showScale, false );

		await page.getByLabel( 'Zoom rounding' ).selectOption( 'snap' );
		await live.expectMap( ( state ) => state.zoomRounding, 'snap' );
		await page.getByLabel( 'Zoom rounding' ).selectOption( 'smooth' );
		await live.expectMap( ( state ) => state.zoomRounding, 'smooth' );

		await page.getByLabel( 'Zoom strategy' ).selectOption( 'zoomToCenter' );
		await live.expectMap( ( state ) => state.zoomStrategy, 'zoomToCenter' );

		// Restriction: enabled with bounds around the center, then edited.
		// The SDK takes the south-west and north-east corners.
		await live.expectMap( ( state ) => state.restrict, false );
		await setToggle( page.getByLabel( 'Restrict map area' ), true );
		await live.expectMap(
			( state ) => [ state.restrict, state.center ],
			[
				[
					[ 37.118423, 55.251244 ],
					[ 38.118423, 56.251244 ],
				],
				[ 37.6184, 55.7512 ],
			]
		);
		await live.type( 'West longitude', '36.5' );
		await live.type( 'North latitude', '56.5' );
		await live.type( 'East longitude', '38.5' );
		await live.type( 'South latitude', '55' );
		await live.expectMap(
			( state ) => state.restrict,
			[
				[ 36.5, 55 ],
				[ 38.5, 56.5 ],
			]
		);
		// The area really holds the camera: a center outside it is pulled back
		// until the visible map lies inside.
		const isInside = ( { view: [ west, north, east, south ] } ) =>
			west >= 36.499 &&
			north <= 56.501 &&
			east <= 38.501 &&
			south >= 54.999;
		for ( const [ latitude, longitude ] of [
			[ 70, 37.618423 ],
			[ 40, 37.618423 ],
			[ 55.751244, 10 ],
			[ 55.751244, 60 ],
		] ) {
			await live.setAttributes( { center: { latitude, longitude } } );
			await live.expectMap(
				( state ) => [
					isInside( state ),
					state.center[ 1 ] !== 55.7512 ||
						state.center[ 0 ] !== 37.6184,
				],
				[ true, true ],
				`a center of ${ latitude }, ${ longitude } stays inside the area`
			);
		}
		await live.setAttributes( { center: DEFAULT_CENTER } );
		await live.expectMap( ( state ) => state.center, [ 37.6184, 55.7512 ] );
		await setToggle( page.getByLabel( 'Restrict map area' ), false );
		await live.expectMap( ( state ) => state.restrict, false );

		await live.type( 'Top margin', '30' );
		await live.type( 'Right margin', '20' );
		await live.type( 'Bottom margin', '10' );
		await live.type( 'Left margin', '5' );
		await live.expectMap( ( state ) => state.margin, [ 30, 20, 10, 5 ] );

		// Fit to markers reframes the map and back again.
		await live.setAttributes( {
			cluster: { enabled: false },
			markers: [
				marker( 'north', 4.18, -7.28 ),
				marker( 'south', 0, 0 ),
			],
		} );
		await live.expectMap( ( state ) => state.zoom, 12 );
		await setToggle( page.getByLabel( 'Fit viewport to markers' ), true );
		await live.expectMap(
			( state ) =>
				state.zoom < 8 &&
				state.markers.length === 2 &&
				state.markers.every(
					( { position: [ x, y ] } ) =>
						x > 20 &&
						x < state.hostSize[ 0 ] - 20 &&
						y > 60 &&
						y < state.hostSize[ 1 ]
				),
			true,
			'both markers are framed with room for their pins'
		);
		await setToggle( page.getByLabel( 'Fit viewport to markers' ), false );
		await live.expectMap(
			( state ) => [ state.zoom, state.center ],
			[ 12, [ 37.6184, 55.7512 ] ]
		);
		await live.expectUntouchedMap();
	} );

	test( 'Markers: every field of a marker', async ( { page } ) => {
		const live = await openEditor( page );
		await live.openPanel( 'Clustering' );
		await setToggle( page.getByLabel( 'Enable clustering' ), false );
		await live.openPanel( 'Markers' );
		await live.expectMap( ( state ) => state.markers.length, 0 );
		const first = ( pick ) => ( state ) => pick( state.markers[ 0 ] ?? {} );
		const entity = ( pick ) => ( state ) =>
			pick( state.entities[ 0 ] ?? {} );

		await page.getByRole( 'button', { name: 'Add at map center' } ).click();
		await live.expectMap(
			( state ) => [
				state.markers.length,
				state.entities[ 0 ]?.coordinates,
				state.markers[ 0 ]?.interactive,
				state.markers[ 0 ]?.label,
			],
			[ 1, [ 37.6184, 55.7512 ], false, 'Map marker' ]
		);
		const centerPosition = ( await live.probe() ).markers[ 0 ].position;

		await live.type( 'Title', 'Head office' );
		await live.expectMap(
			first( ( m ) => [ m.title, m.label, m.interactive ] ),
			[ 'Head office', 'Head office', true ]
		);

		await live.type( 'Hint', 'Come in' );
		await live.expectMap(
			first( ( m ) => [ m.hint, m.label ] ),
			[ 'Come in', 'Come in' ]
		);

		await live.type( 'Description', 'Open every day' );
		await live.expectMap(
			first( ( m ) => m.description ),
			'Open every day'
		);

		await live.type( 'Address', '1 Main Street' );
		await live.expectMap(
			first( ( m ) => m.address ),
			'1 Main Street'
		);

		await live.type( 'Category', 'Offices' );
		await live.expectMap(
			first( ( m ) => m.category ),
			'Offices'
		);

		await live.type( 'Link URL', 'https://example.com/office' );
		await live.expectMap(
			first( ( m ) => m.link ),
			{
				href: 'https://example.com/office',
				text: 'Head office',
				target: null,
			}
		);
		await live.type( 'Link label', 'Visit us' );
		await setToggle(
			page
				.locator( '.guyamap-marker-editor' )
				.getByLabel( 'Open link in a new tab' ),
			true
		);
		await live.expectMap(
			first( ( m ) => m.link ),
			{
				href: 'https://example.com/office',
				text: 'Visit us',
				target: '_blank',
			}
		);

		// Moving the marker moves it on the map.
		await live.type( 'Latitude', '55.77' );
		await live.type( 'Longitude', '37.58' );
		await live.expectMap(
			entity( ( e ) => e.coordinates ),
			[ 37.58, 55.77 ]
		);
		await live.expectMap(
			first(
				( m ) =>
					m.position[ 0 ] < centerPosition[ 0 ] &&
					m.position[ 1 ] < centerPosition[ 1 ]
			),
			true,
			'the marker moved north-west on screen'
		);

		// Markers cannot be dragged, in the preview or on the published page.
		await expect(
			page.locator( '.guyamap-marker-editor' ).getByLabel( /drag/i )
		).toHaveCount( 0 );
		await live.expectMap(
			entity( ( e ) => e.draggable ),
			false
		);

		await setToggle( page.getByLabel( 'Hide outside viewport' ), false );
		await live.expectMap(
			entity( ( e ) => e.hideOutside ),
			false
		);

		await live.type( 'Z-index', '7' );
		await live.expectMap(
			( state ) => [
				state.entities[ 0 ]?.zIndex,
				state.markers[ 0 ]?.stack,
			],
			[ 7, '7' ]
		);

		// Default marker artwork.
		const picker = page.getByRole( 'combobox', {
			name: 'Icon',
			exact: true,
		} );
		await picker.fill( 'cafe' );
		await page.getByRole( 'option', { name: 'Cafe', exact: true } ).click();
		await live.expectMap(
			first( ( m ) => m.icon ),
			'cafe_24.svg'
		);

		await page.getByLabel( 'Marker color' ).fill( '#0066ff' );
		await live.expectMap(
			first( ( m ) => m.color ),
			'#0066ff'
		);

		await page.getByLabel( 'Marker size' ).selectOption( 'small' );
		await live.expectMap(
			first( ( m ) => [ m.size, m.icon ] ),
			[ 'small', 'cafe_24.svg' ]
		);
		await page.getByLabel( 'Marker size' ).selectOption( 'micro' );
		await live.expectMap(
			first( ( m ) => [ m.size, m.icon ] ),
			[ 'micro', null ]
		);
		await page.getByLabel( 'Marker size' ).selectOption( 'normal' );
		await live.expectMap(
			first( ( m ) => m.size ),
			'normal'
		);

		// Custom image marker.
		await page.getByLabel( 'Icon type' ).selectOption( 'image' );
		const imageUrl = new URL(
			'/wp-content/plugins/yamap-block-gutenberg/assets/icons/zoo_24.svg',
			page.url()
		).href;
		await live.type( 'Image URL', imageUrl );
		await live.expectMap(
			first( ( m ) => [ m.image, m.imageSrc, m.box, m.offset ] ),
			[ true, imageUrl, [ 40, 40 ], [ '-20px', '-40px' ] ]
		);
		await live.type( 'Icon width', '64' );
		await live.type( 'Icon height', '48' );
		await live.type( 'Horizontal offset', '-32' );
		await live.type( 'Vertical offset', '-48' );
		await live.expectMap(
			first( ( m ) => [ m.box, m.offset ] ),
			[
				[ 64, 48 ],
				[ '-32px', '-48px' ],
			]
		);
		await page.getByLabel( 'Icon type' ).selectOption( 'default' );
		await live.expectMap(
			first( ( m ) => m.image ),
			false
		);

		// Duplicate, search and remove.
		await page.getByRole( 'button', { name: 'Duplicate marker' } ).click();
		await live.expectMap(
			( state ) => state.markers.map( ( m ) => m.title ),
			[ 'Head office', 'Head office (copy)' ]
		);
		const rows = page.locator(
			'.guyamap-marker-editor__list [role="listitem"]'
		);
		await expect( rows ).toHaveCount( 2 );
		await page.getByLabel( 'Search markers' ).fill( 'copy' );
		await expect( rows ).toHaveCount( 1 );
		await page.getByLabel( 'Search markers' ).fill( '' );

		await page.getByRole( 'button', { name: 'Remove marker' } ).click();
		await live.expectMap(
			( state ) => state.markers.map( ( m ) => m.title ),
			[ 'Head office' ]
		);
		await page.getByRole( 'button', { name: /^Head office/ } ).click();
		await page.getByRole( 'button', { name: 'Remove marker' } ).click();
		await live.expectMap( ( state ) => state.markers.length, 0 );
		await live.expectUntouchedMap();
	} );

	test( 'Clustering: toggle, grid size, maximum zoom and color', async ( {
		page,
	} ) => {
		const live = await openEditor( page );
		// Six markers within a few hundred metres of the center.
		const markers = [ 0, 1, 2, 3, 4, 5 ].map( ( index ) =>
			marker( `m${ index }`, index * 0.0015, index * 0.0025 )
		);
		await live.setAttributes( { markers } );
		await live.openPanel( 'Clustering' );
		const shown = ( state ) =>
			state.clusters.reduce(
				( sum, cluster ) => sum + cluster.count,
				0
			) + state.markers.length;

		await live.expectMap(
			( state ) => [ state.clusters.length > 0, shown( state ) ],
			[ true, 6 ],
			'markers are grouped and none is lost'
		);

		await setToggle( page.getByLabel( 'Enable clustering' ), false );
		await live.expectMap(
			( state ) => [ state.clusters.length, state.markers.length ],
			[ 0, 6 ]
		);
		await setToggle( page.getByLabel( 'Enable clustering' ), true );
		await live.expectMap( ( state ) => state.clusters.length > 0, true );

		// A coarse grid merges the markers, a fine grid separates them. Where
		// the grid lines fall depends on the projection of the SDK, so a line
		// may still cut through the group.
		const groups = ( state ) =>
			state.clusters.length + state.markers.length;
		await live.type( 'Cluster grid size', '256' );
		await live.expectMap(
			( state ) => [
				state.clusters.length > 0,
				groups( state ) <= 3,
				shown( state ),
			],
			[ true, true, 6 ]
		);
		const coarse = groups( await live.probe() );
		await live.type( 'Cluster grid size', '16' );
		await live.expectMap(
			( state ) => [ groups( state ) > coarse, shown( state ) ],
			[ true, 6 ]
		);

		await page.getByLabel( 'Cluster color' ).fill( '#00aa55' );
		await live.type( 'Cluster grid size', '256' );
		await live.expectMap(
			( state ) => [
				groups( state ),
				state.clusters.length > 0,
				state.clusters.every(
					( cluster ) => cluster.color === '#00aa55'
				),
				shown( state ),
			],
			[ coarse, true, true, 6 ]
		);

		// Above the maximum clustering zoom every marker stands alone.
		await live.type( 'Maximum clustering zoom', '10' );
		await live.expectMap(
			( state ) => [ state.clusters.length, state.markers.length ],
			[ 0, 6 ]
		);
		await live.type( 'Maximum clustering zoom', '18' );
		await live.expectMap(
			( state ) => [ groups( state ), shown( state ) ],
			[ coarse, 6 ]
		);
		await live.expectUntouchedMap();
	} );

	test( 'Loading, accessibility and block supports', async ( { page } ) => {
		const live = await openEditor( page );
		await live.openPanel( 'Loading and interaction' );
		const preview = page.locator( '.guyamap-preloader--preview' );
		const variable = ( name ) =>
			preview.evaluate(
				( element, property ) =>
					element.style.getPropertyValue( property ),
				name
			);

		await expect( preview ).toHaveCount( 0 );
		await setToggle( page.getByLabel( 'Show preloader' ), true );
		await expect( preview ).toBeVisible();
		await expect( preview ).toHaveClass( /guyamap-preloader--spinner/ );
		for ( const type of [ 'dots', 'pulse' ] ) {
			await page.getByLabel( 'Preloader style' ).selectOption( type );
			await expect( preview ).toHaveClass(
				new RegExp( `guyamap-preloader--${ type }` )
			);
		}
		await page.getByLabel( 'Loader color' ).fill( '#d63638' );
		await page.getByLabel( 'Background color' ).fill( '#f0f6fc' );
		await page.getByRole( 'slider', { name: 'Loader size' } ).fill( '72' );
		await page
			.getByRole( 'slider', { name: 'Transition duration' } )
			.fill( '600' );
		await live.type( 'Accessible loading text', 'Please wait' );
		expect( await variable( '--guyamap-preloader-color' ) ).toBe(
			'#d63638'
		);
		expect( await variable( '--guyamap-preloader-background' ) ).toBe(
			'#f0f6fc'
		);
		expect( await variable( '--guyamap-preloader-size' ) ).toBe( '72px' );
		expect( await variable( '--guyamap-transition-duration' ) ).toBe(
			'600ms'
		);
		await expect( preview ).toContainText( 'Please wait' );
		await setToggle( page.getByLabel( 'Show preloader' ), false );
		await expect( preview ).toHaveCount( 0 );

		// Options that only matter on the published page are still stored.
		await setToggle( page.getByLabel( 'Lazy-load the map' ), true );
		expect( ( await live.attributes() ).loading.lazy ).toBe( true );
		await setToggle( page.getByLabel( 'Lazy-load the map' ), false );
		await live.type( 'Preload distance', '150px' );
		await setToggle( page.getByLabel( 'Require click to activate' ), true );
		expect( ( await live.attributes() ).loading ).toMatchObject( {
			lazy: false,
			rootMargin: '150px',
			clickToActivate: true,
		} );
		// The editor preview is never gated.
		await live.expectMap( ( state ) => state.state, 'ready' );

		await live.openPanel( 'Accessibility and fallback' );
		await live.type( 'Accessible label', 'Office locations' );
		await live.expectMap(
			( state ) => state.ariaLabel,
			'Office locations'
		);
		// An empty label falls back to the default name, as on the frontend.
		await live.type( 'Accessible label', '' );
		await live.expectMap( ( state ) => state.ariaLabel, 'Interactive map' );
		await live.type(
			'Error and no-JavaScript link text',
			'See it on Yandex'
		);
		expect( ( await live.attributes() ).fallbackText ).toBe(
			'See it on Yandex'
		);

		// Block supports provided by WordPress reach the block wrapper.
		const natural = ( await live.probe() ).blockSize[ 0 ];
		await live.setAttributes( { align: 'full' } );
		await live.expectMap(
			( state ) =>
				state.blockClass.includes( 'alignfull' ) &&
				state.blockSize[ 0 ] > natural &&
				state.mapSize[ 0 ] === state.blockSize[ 0 ],
			true,
			'full width widens the block and the map'
		);
		await live.setAttributes( {
			align: undefined,
			className: 'is-custom-map',
			style: { border: { radius: '24px' } },
		} );
		await live.expectMap(
			( state ) => [
				state.blockClass.includes( 'is-custom-map' ),
				state.blockStyle.includes( 'border-radius' ),
			],
			[ true, true ]
		);
		await live.expectUntouchedMap();
	} );

	test( 'Editor operations: scrubbing, undo, duplicate, device preview and code editor', async ( {
		page,
	} ) => {
		const live = await openEditor( page );
		const ready = ( state ) => state.state;

		// Dragging a slider sends a burst of changes; the last one wins.
		const zoom = page.getByRole( 'slider', { name: 'Zoom', exact: true } );
		await zoom.focus();
		for ( let step = 0; step < 30; step += 1 ) {
			await zoom.press( 'ArrowUp' );
		}
		for ( let step = 0; step < 10; step += 1 ) {
			await zoom.press( 'ArrowDown' );
		}
		await live.expectMap( ( state ) => state.zoom, 14 );
		const azimuth = page.getByRole( 'slider', {
			name: 'Camera azimuth',
			exact: true,
		} );
		await azimuth.focus();
		for ( let step = 0; step < 20; step += 1 ) {
			await azimuth.press( 'ArrowDown' );
		}
		for ( let step = 0; step < 30; step += 1 ) {
			await azimuth.press( 'ArrowUp' );
		}
		await live.expectMap(
			( state ) => normalizeAngle( state.azimuth ),
			normalizeAngle( ( 10 * Math.PI ) / 180 )
		);
		await live.expectUntouchedMap();

		// Undo and redo.
		await live.setAttributes( { zoom: 9 } );
		await live.expectMap( ( state ) => state.zoom, 9 );
		await live.dispatch( 'core/editor', 'undo' );
		await live.expectMap( ( state ) => state.zoom, 14 );
		await live.dispatch( 'core/editor', 'redo' );
		await live.expectMap( ( state ) => state.zoom, 9 );

		// A duplicate is a second, independent map.
		await live.dispatch( 'core/block-editor', 'duplicateBlocks', [
			live.clientId,
		] );
		await live.expectMap( ready, 'ready', 'the duplicate renders', 1 );
		const copyId = await page.evaluate(
			() =>
				window.wp.data.select( 'core/block-editor' ).getBlocks()[ 1 ]
					.clientId
		);
		expect( copyId ).not.toBe( live.clientId );
		await live.expectMap(
			( state ) => state.zoom,
			9,
			'copied settings',
			1
		);
		await live.setAttributes(
			{
				theme: 'dark',
				cluster: { enabled: false },
				markers: [ marker( 'copy', 0, 0 ) ],
			},
			copyId
		);
		await live.expectMap(
			( state ) => [ state.theme, state.markers.length ],
			[ 'dark', 1 ],
			'the duplicate changes',
			1
		);
		await live.expectMap(
			( state ) => [ state.theme, state.markers.length, state.zoom ],
			[ 'light', 0, 9 ],
			'the original does not'
		);
		await live.setAttributes( { zoom: 6 } );
		await live.expectMap( ( state ) => state.zoom, 6 );
		await live.expectMap( ( state ) => state.zoom, 9, undefined, 1 );
		await live.dispatch( 'core/block-editor', 'removeBlocks', [ copyId ] );
		await live.expectMap( ready, 'missing', 'the duplicate is gone', 1 );
		await live.expectMap( ready, 'ready' );

		// Device previews resize or rebuild the canvas; the map stays live.
		const desktop = ( await live.probe() ).hostSize[ 0 ];
		await live.dispatch( 'core/editor', 'setDeviceType', 'Mobile' );
		await live.expectMap(
			( state ) =>
				state.state === 'ready' &&
				state.hostSize[ 0 ] < desktop &&
				state.mapSize[ 0 ] === state.hostSize[ 0 ],
			true,
			'the map follows the mobile preview'
		);
		await live.setAttributes( { zoom: 8 } );
		await live.expectMap( ( state ) => state.zoom, 8 );
		await live.dispatch( 'core/editor', 'setDeviceType', 'Desktop' );
		await live.expectMap(
			( state ) => [ state.state, state.hostSize[ 0 ], state.zoom ],
			[ 'ready', desktop, 8 ]
		);

		// The code editor removes the canvas; the map returns with it.
		await live.dispatch( 'core/editor', 'switchEditorMode', 'text' );
		await expect(
			page.locator( 'iframe[name="editor-canvas"]' )
		).toHaveCount( 0 );
		await live.dispatch( 'core/editor', 'switchEditorMode', 'visual' );
		await live.expectMap(
			( state ) => [ state.state, state.zoom ],
			[ 'ready', 8 ],
			'the map is rebuilt after the code editor'
		);
		await live.setAttributes( { zoom: 5 } );
		await live.expectMap(
			( state ) => [ state.zoom, state.inert, state.errors ],
			[ 5, true, [] ]
		);
	} );
} );

test.describe( 'the published page', () => {
	test( 'matches what was configured in the editor', async ( {
		page,
		browser,
	} ) => {
		const live = await openEditor( page );

		await live.openPanel( 'Behaviors' );
		await setToggle(
			page.getByRole( 'checkbox', { name: 'Drag', exact: true } ),
			false
		);
		await setToggle(
			page.getByRole( 'checkbox', {
				name: 'Mouse rotation',
				exact: true,
			} ),
			true
		);

		await live.openPanel( 'Controls' );
		await setToggle( page.getByLabel( 'Geolocation control' ), false );
		await page.getByLabel( 'Controls position' ).selectOption( 'left' );

		await live.openPanel( 'Clustering' );
		await setToggle( page.getByLabel( 'Enable clustering' ), false );
		await live.openPanel( 'Markers' );
		await page.getByRole( 'button', { name: 'Add at map center' } ).click();
		await live.type( 'Title', 'Head office' );
		await live.type( 'Category', 'Offices' );
		// Content saved by an earlier 2.0 build can still ask for a
		// draggable marker; the request is ignored from here on.
		const [ savedMarker ] = ( await live.attributes() ).markers;
		await live.setAttributes( {
			markers: [
				{ ...savedMarker, draggable: true, mapFollowsOnDrag: true },
			],
		} );
		await live.type( 'Z-index', '7' );

		await live.openPanel( 'Loading and interaction' );
		await setToggle( page.getByLabel( 'Require click to activate' ), true );
		await live.type( 'Preload distance', '150px' );
		await setToggle( page.getByLabel( 'Show preloader' ), true );
		await page.getByLabel( 'Preloader style' ).selectOption( 'dots' );

		await live.openPanel( 'Accessibility and fallback' );
		await live.type( 'Accessible label', 'Office locations' );
		await live.type(
			'Error and no-JavaScript link text',
			'See it on Yandex'
		);

		await live.openPanel( 'Viewport' );
		await page
			.getByRole( 'slider', { name: 'Zoom', exact: true } )
			.fill( '14' );
		await live.type( 'Maximum zoom', '16' );

		await page.evaluate( () =>
			window.wp.data.dispatch( 'core/editor' ).savePost()
		);
		await page.waitForFunction(
			() =>
				! window.wp.data.select( 'core/editor' ).isSavingPost() &&
				! window.wp.data.select( 'core/editor' ).isEditedPostDirty()
		);
		const saved = await live.attributes();

		// A visitor without a session opens the published page.
		const context = await browser.newContext( {
			ignoreHTTPSErrors: true,
			baseURL: new URL( page.url() ).origin,
		} );
		const visitor = await context.newPage();
		await recordControllers( visitor );
		await provideSdk( visitor );
		await visitor.goto( `/?page_id=${ postId }`, {
			waitUntil: 'domcontentloaded',
		} );
		const block = visitor.locator( '[data-guyamap-map]' );
		const host = block.locator( 'guyamap-map-view' );

		// Click to activate: nothing is loaded until the visitor agrees.
		await expect( block ).toHaveAttribute(
			'data-guyamap-state',
			'awaiting-activation'
		);
		await expect( block ).toHaveAttribute(
			'data-guyamap-preloader',
			'dots'
		);
		await expect( host ).toHaveAttribute(
			'aria-label',
			'Office locations'
		);
		expect( await visitor.content() ).toContain( 'See it on Yandex' );
		const config = JSON.parse(
			await block.locator( '.guyamap-map__config' ).textContent()
		);
		expect( config.loading ).toMatchObject( {
			lazy: false,
			rootMargin: '150px',
			clickToActivate: true,
		} );
		expect( config.behaviors ).toEqual( saved.behaviors );
		expect( config.markers[ 0 ] ).toMatchObject( {
			title: 'Head office',
			category: 'Offices',
			zIndex: 7,
		} );
		expect( saved.markers[ 0 ].draggable ).toBe( true );
		expect( config.markers[ 0 ] ).not.toHaveProperty( 'draggable' );
		expect( config.markers[ 0 ] ).not.toHaveProperty( 'mapFollowsOnDrag' );

		await block.getByRole( 'button', { name: 'Activate map' } ).click();
		await expect( block ).toHaveAttribute( 'data-guyamap-state', 'ready', {
			timeout: 60000,
		} );
		const state = await probe( visitor.mainFrame() );

		expect( state.inert, 'the published map is interactive' ).toBe( false );
		expect( [ ...state.behaviors ].sort() ).toEqual(
			[ ...saved.behaviors ].sort()
		);
		expect( state.behaviors ).toContain( 'mouseRotate' );
		expect( state.behaviors ).not.toContain( 'drag' );
		expect( state.zoom ).toBe( 14 );
		expect( state.zoomRange ).toEqual( { min: 1, max: 16 } );
		expect( state.controls ).toEqual( [ 'Zoom in', 'Zoom out' ] );
		expect( state.controlsPosition ).toBe( 'left' );
		expect( state.fullscreen ).toBe( true );
		expect( state.markers ).toHaveLength( 1 );
		expect( state.markers[ 0 ] ).toMatchObject( {
			title: 'Head office',
			category: 'Offices',
			label: 'Head office',
			interactive: true,
		} );
		expect( state.entities[ 0 ] ).toMatchObject( {
			draggable: false,
			zIndex: 7,
		} );
		await context.close();
	} );
} );
