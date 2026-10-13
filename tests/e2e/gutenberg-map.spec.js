const { expect, test } = require( '@playwright/test' );

const { login } = require( './support/login' );

const username = process.env.GUYAMAP_E2E_USERNAME;
const password = process.env.GUYAMAP_E2E_PASSWORD;
const postId = process.env.GUYAMAP_E2E_POST_ID || '2';
const layoutPostId = process.env.GUYAMAP_E2E_LAYOUT_POST_ID;

const dismissWelcomeGuide = async ( page ) => {
	const welcome = page.locator( '.components-modal__frame' ).filter( {
		has: page.getByRole( 'heading', {
			name: /Welcome to the editor/i,
		} ),
	} );
	const isOpen = await welcome
		.waitFor( { state: 'visible', timeout: 10000 } )
		.then( () => true )
		.catch( () => false );
	if ( ! isOpen ) {
		return;
	}

	await welcome
		.locator(
			'button[aria-label="Close"], .components-modal__header button'
		)
		.first()
		.click();
	await expect( welcome ).toBeHidden();
};

/*
 * This suite drives the real Yandex SDK, which only loads when Yandex accepts
 * the configured key for the site under test. Skip with an actionable reason
 * instead of failing every test on an environment whose host is not allowed
 * by the key's HTTP Referer restrictions. The mocked suite in
 * runtime-mock.spec.js covers the runtime without that dependency.
 */
test.beforeAll( async ( { playwright, baseURL } ) => {
	const request = await playwright.request.newContext( {
		baseURL,
		ignoreHTTPSErrors: true,
	} );
	try {
		const page = await request.get( `/?page_id=${ postId }` );
		const html = await page.text();
		const apiKey = /"apiKey":"([^"]*)"/.exec( html )?.[ 1 ] ?? '';
		const language = /"language":"([^"]*)"/.exec( html )?.[ 1 ] ?? 'en_US';
		const host = new URL( page.url() ).host;
		test.skip(
			! apiKey,
			`No Yandex API key is rendered on ${ host }; the real-SDK suite cannot run.`
		);

		const sdk = await request.get(
			`https://api-maps.yandex.ru/v3/?apikey=${ encodeURIComponent(
				apiKey
			) }&lang=${ encodeURIComponent( language ) }`,
			{ headers: { referer: `https://${ host }/` } }
		);
		test.skip(
			sdk.status() !== 200,
			`Yandex rejects the configured API key for ${ host } (HTTP ${ sdk.status() }). Add this host to the key's HTTP Referer restrictions to run the real-SDK suite.`
		);
	} finally {
		await request.dispose();
	}
} );

test.beforeEach( async ( { page } ) => {
	if ( ! username || ! password ) {
		throw new Error(
			'GUYAMAP_E2E_USERNAME and GUYAMAP_E2E_PASSWORD are required.'
		);
	}

	await page.addInitScript( () => {
		// The editor canvas can keep its Window while its document is
		// replaced, so record once per Window. WebKit drops the listeners of
		// the first document; adding the same listener again is a no-op.
		if ( ! window.__guyamapE2E ) {
			const store = {
				readyEvents: [],
				errorEvents: [],
				// Maps become ready in any order (a clustered map also loads
				// its clusterer chunk), so look the first map up by its host.
				firstMap() {
					const host = document.querySelector( 'guyamap-map-view' );
					return this.readyEvents.find(
						( record ) => record.controller.container === host
					);
				},
			};
			store.onReady = ( event ) => {
				event.detail.controller.__guyamapE2EInitialMap =
					event.detail.map;
				store.readyEvents.push( {
					controller: event.detail.controller,
					initialMap: event.detail.map,
				} );
			};
			store.onError = ( event ) => {
				store.errorEvents.push(
					event.detail.error?.message || String( event.detail.error )
				);
			};
			window.__guyamapE2E = store;
		}
		window.addEventListener(
			'guyamap:ready',
			window.__guyamapE2E.onReady,
			true
		);
		window.addEventListener(
			'guyamap:error',
			window.__guyamapE2E.onError,
			true
		);
	} );

	await login( page, username, password );
} );

test( 'renders locked maps and updates them live in Gutenberg', async ( {
	page,
}, testInfo ) => {
	const pageErrors = [];
	page.on( 'pageerror', ( error ) => pageErrors.push( error.message ) );

	await page.goto( `/wp-admin/post.php?post=${ postId }&action=edit`, {
		waitUntil: 'domcontentloaded',
	} );

	const editorIframe = page.locator( 'iframe[name="editor-canvas"]' );
	await expect( editorIframe ).toBeVisible();
	await dismissWelcomeGuide( page );
	const editorFrame = page.frameLocator( 'iframe[name="editor-canvas"]' );
	const mapBlocks = editorFrame.locator(
		'.wp-block-gutenberg-yandex-block-map.guyamap-block-editor'
	);
	const mapHosts = editorFrame.locator( 'guyamap-map-view' );

	await expect( mapBlocks ).toHaveCount( 2 );
	await expect( mapHosts ).toHaveCount( 2 );
	for ( let index = 0; index < 2; index += 1 ) {
		await expect( mapHosts.nth( index ) ).toHaveAttribute(
			'data-state',
			'ready',
			{ timeout: 60000 }
		);
	}

	const frame = page
		.frames()
		.find( ( candidate ) => candidate.name() === 'editor-canvas' );
	expect( frame ).toBeTruthy();

	const mapState = await frame.evaluate( () =>
		[ ...document.querySelectorAll( 'guyamap-map-view' ) ].map(
			( host ) => ( {
				ariaDisabled: host.getAttribute( 'aria-disabled' ),
				error: host.shadowRoot?.querySelector( '.guyamap-map__error' )
					?.textContent,
				hasCanvas: Boolean(
					host.shadowRoot?.querySelector( '[part="canvas"]' )
				),
				hasPluginStyles: Boolean(
					host.shadowRoot?.querySelector(
						'link[data-guyamap-shadow-style="plugin"]'
					)
				),
				hasYandexAttribution: Boolean(
					host.shadowRoot?.querySelector( 'a[href*="yandex"]' )
				),
				hasYandexStyles: Boolean(
					host.shadowRoot?.querySelector(
						'link[data-guyamap-shadow-style="yandex"]'
					)
				),
				inert: host.hasAttribute( 'inert' ),
				pointerEvents:
					host.ownerDocument.defaultView.getComputedStyle( host )
						.pointerEvents,
				state: host.dataset.state,
			} )
		)
	);

	for ( const state of mapState ) {
		expect( state ).toMatchObject( {
			ariaDisabled: 'true',
			hasCanvas: true,
			hasPluginStyles: true,
			hasYandexAttribution: true,
			hasYandexStyles: true,
			inert: true,
			pointerEvents: 'none',
			state: 'ready',
		} );
		expect( state.error ).toBeUndefined();
	}

	const initialRuntime = await frame.evaluate( () => ( {
		errorEvents: window.__guyamapE2E.errorEvents,
		mapIdentityPreserved: window.__guyamapE2E.readyEvents.every(
			( record ) =>
				record.controller.map ===
				record.controller.__guyamapE2EInitialMap
		),
		readyCount: window.__guyamapE2E.readyEvents.length,
		renderedZoom: window.__guyamapE2E.firstMap()?.controller.map.zoom,
		zoom: window.__guyamapE2E.firstMap()?.controller.appliedConfig.zoom,
	} ) );
	expect( initialRuntime.errorEvents ).toEqual( [] );
	expect( initialRuntime.readyCount ).toBe( 2 );
	expect( initialRuntime.mapIdentityPreserved ).toBe( true );
	expect(
		Math.abs( initialRuntime.renderedZoom - initialRuntime.zoom )
	).toBeLessThanOrEqual( 0.11 );
	expect( Number.isFinite( initialRuntime.zoom ) ).toBe( true );

	const firstBlockId = await mapBlocks.first().getAttribute( 'data-block' );
	expect( firstBlockId ).toBeTruthy();
	await page.evaluate( ( clientId ) => {
		window.wp.data.dispatch( 'core/block-editor' ).selectBlock( clientId );
	}, firstBlockId );

	const blockTab = page.getByRole( 'tab', { name: /^Block$/i } );
	if ( ! ( await blockTab.isVisible().catch( () => false ) ) ) {
		await page.locator( 'button[aria-label="Settings"]' ).last().click();
	}
	await expect( blockTab ).toBeVisible();
	await blockTab.click();
	await expect( blockTab ).toHaveAttribute( 'aria-selected', 'true' );

	const zoomSlider = page.getByRole( 'slider', {
		name: 'Zoom',
		exact: true,
	} );
	await expect( zoomSlider ).toBeVisible();
	await expect( zoomSlider ).toHaveValue( String( initialRuntime.zoom ) );
	await zoomSlider.focus();
	for ( let step = 0; step < 10; step += 1 ) {
		await zoomSlider.press( 'ArrowUp' );
	}
	const expectedZoom = Math.round( ( initialRuntime.zoom + 1 ) * 10 ) / 10;

	await expect
		.poll(
			() =>
				frame.evaluate( () => {
					const controller =
						window.__guyamapE2E.firstMap().controller;
					return {
						applied: controller.appliedConfig.zoom,
						rendered: Math.round( controller.map.zoom * 10 ) / 10,
					};
				} ),
			{ timeout: 15000 }
		)
		.toEqual( { applied: expectedZoom, rendered: expectedZoom } );
	await page.waitForTimeout( 2000 );

	const cameraBeforePointerInput = await frame.evaluate( () => {
		const map = window.__guyamapE2E.firstMap().controller.map;
		return { center: [ ...map.center ], zoom: map.zoom };
	} );
	await mapHosts.first().scrollIntoViewIfNeeded();
	const mapBox = await mapHosts.first().boundingBox();
	expect( mapBox ).toBeTruthy();
	const pointer = {
		x: mapBox.x + mapBox.width / 2,
		y: mapBox.y + mapBox.height / 2,
	};
	await page.mouse.move( pointer.x, pointer.y );
	await page.mouse.down();
	await page.mouse.move( pointer.x + 120, pointer.y + 80, { steps: 5 } );
	await page.mouse.up();
	await page.mouse.wheel( 0, -600 );
	await page.waitForTimeout( 500 );
	const cameraAfterPointerInput = await frame.evaluate( () => {
		const map = window.__guyamapE2E.firstMap().controller.map;
		return { center: [ ...map.center ], zoom: map.zoom };
	} );
	expect( cameraAfterPointerInput ).toEqual( cameraBeforePointerInput );

	const updatedRuntime = await frame.evaluate( () => ( {
		errorEvents: window.__guyamapE2E.errorEvents,
		mapIdentityPreserved: window.__guyamapE2E.readyEvents.every(
			( record ) =>
				record.controller.map ===
				record.controller.__guyamapE2EInitialMap
		),
		readyCount: window.__guyamapE2E.readyEvents.length,
	} ) );

	const loadingPanel = page.getByRole( 'button', {
		name: 'Loading and interaction',
	} );
	await expect( loadingPanel ).toBeVisible();
	if ( ( await loadingPanel.getAttribute( 'aria-expanded' ) ) !== 'true' ) {
		await loadingPanel.click();
	}
	const preloaderToggle = page.getByRole( 'checkbox', {
		name: 'Show preloader',
	} );
	// The saved page may already use a preloader; start from a known state.
	if ( await preloaderToggle.isChecked() ) {
		await preloaderToggle.uncheck();
	}
	await expect( preloaderToggle ).not.toBeChecked();
	await preloaderToggle.check();
	const preloaderPreview = page.locator( '.guyamap-preloader--preview' );
	await expect( preloaderPreview ).toBeVisible();
	await page.getByLabel( 'Preloader style' ).selectOption( 'dots' );
	await page.getByRole( 'slider', { name: 'Loader size' } ).fill( '60' );
	await expect( preloaderPreview ).toHaveClass( /guyamap-preloader--dots/ );
	const livePreloader = await page.evaluate( ( clientId ) => {
		const attributes = window.wp.data
			.select( 'core/block-editor' )
			.getBlock( clientId ).attributes;
		const preview = document.querySelector( '.guyamap-preloader--preview' );

		return {
			enabled: attributes.loading.preloader.enabled,
			size: attributes.loading.preloader.size,
			type: attributes.loading.preloader.type,
			previewSize: window
				.getComputedStyle( preview )
				.getPropertyValue( '--guyamap-preloader-size' ),
		};
	}, firstBlockId );
	expect( livePreloader ).toEqual( {
		enabled: true,
		size: 60,
		type: 'dots',
		previewSize: '60px',
	} );

	expect( updatedRuntime.errorEvents ).toEqual( [] );
	expect( updatedRuntime.readyCount ).toBe( 2 );
	expect( updatedRuntime.mapIdentityPreserved ).toBe( true );
	expect( pageErrors ).toEqual( [] );
	await expect( mapHosts.first() ).toHaveAttribute( 'data-state', 'ready' );

	await page.screenshot( {
		fullPage: true,
		path: testInfo.outputPath( 'gutenberg-map-ready.png' ),
	} );
} );

test( 'renders isolated maps with the real SDK on the public page', async ( {
	page,
}, testInfo ) => {
	const pageErrors = [];
	page.on( 'pageerror', ( error ) => pageErrors.push( error.message ) );
	await page.goto( `/?page_id=${ postId }`, {
		waitUntil: 'domcontentloaded',
	} );

	const mapHosts = page.locator( 'guyamap-map-view' );
	await expect( mapHosts ).toHaveCount( 2 );
	for ( let index = 0; index < 2; index += 1 ) {
		await mapHosts.nth( index ).scrollIntoViewIfNeeded();
		await expect( mapHosts.nth( index ) ).toHaveAttribute(
			'data-state',
			'ready',
			{ timeout: 60000 }
		);
		await page.waitForTimeout( 5000 );
		await mapHosts.nth( index ).screenshot( {
			path: testInfo.outputPath(
				`frontend-map-${ index + 1 }-ready.png`
			),
		} );
	}

	const mapState = await page.evaluate( () =>
		[ ...document.querySelectorAll( 'guyamap-map-view' ) ].map(
			( host ) => ( {
				ariaDisabled: host.getAttribute( 'aria-disabled' ),
				error: host.shadowRoot?.querySelector( '.guyamap-map__error' )
					?.textContent,
				hasPluginStyles: Boolean(
					host.shadowRoot?.querySelector(
						'link[data-guyamap-shadow-style="plugin"]'
					)
				),
				hasYandexAttribution: Boolean(
					host.shadowRoot?.querySelector( 'a[href*="yandex"]' )
				),
				hasYandexStyles: Boolean(
					host.shadowRoot?.querySelector(
						'link[data-guyamap-shadow-style="yandex"]'
					)
				),
				inert: host.hasAttribute( 'inert' ),
				state: host.dataset.state,
			} )
		)
	);

	for ( const state of mapState ) {
		expect( state ).toMatchObject( {
			ariaDisabled: null,
			hasPluginStyles: true,
			hasYandexAttribution: true,
			hasYandexStyles: true,
			inert: false,
			state: 'ready',
		} );
		expect( state.error ).toBeUndefined();
	}
	expect( pageErrors ).toEqual( [] );
	expect(
		await page.evaluate( () => window.__guyamapE2E.errorEvents )
	).toEqual( [] );
} );

test( 'renders optional preloaders and all width modes without overflow', async ( {
	page,
	browserName,
}, testInfo ) => {
	if ( ! layoutPostId ) {
		throw new Error( 'GUYAMAP_E2E_LAYOUT_POST_ID is required.' );
	}

	let continueSdkRequest;
	await page.route( 'https://api-maps.yandex.ru/v3/**', ( route ) => {
		continueSdkRequest = () => route.continue();
	} );
	await page.setViewportSize( { width: 1280, height: 900 } );
	await page.goto( `/?page_id=${ layoutPostId }`, {
		waitUntil: 'domcontentloaded',
	} );
	await expect
		.poll( () => Boolean( continueSdkRequest ), { timeout: 15000 } )
		.toBe( true );

	const mapBlocks = page.locator( '[data-guyamap-map]' );
	await expect( mapBlocks ).toHaveCount( 3 );
	await expect(
		mapBlocks.nth( 0 ).locator( '.guyamap-map__preloader' )
	).toHaveCount( 0 );
	await expect( page.locator( 'a.guyamap-map__fallback' ) ).toHaveCount( 0 );
	expect( await page.locator( 'body' ).innerText() ).not.toContain(
		'Open this location in Yandex Maps'
	);

	const enabledPreloader = mapBlocks
		.nth( 1 )
		.locator( '.guyamap-map__preloader' );
	await expect( enabledPreloader ).toBeVisible();
	await expect( enabledPreloader ).toHaveClass( /guyamap-preloader--dots/ );
	const loadingPresentation = await enabledPreloader.evaluate(
		( element ) => {
			const style = window.getComputedStyle( element );
			return {
				background: style.backgroundColor,
				color: style.color,
				size: style.getPropertyValue( '--guyamap-preloader-size' ),
				state: element.closest( '[data-guyamap-map]' ).dataset
					.guyamapState,
			};
		}
	);
	expect( loadingPresentation ).toEqual( {
		background: 'rgb(240, 246, 252)',
		color: 'rgb(214, 54, 56)',
		size: '56px',
		state: 'loading',
	} );
	// Playwright cannot take a WebKit screenshot while a script is pending.
	if ( browserName !== 'webkit' ) {
		await enabledPreloader.screenshot( {
			path: testInfo.outputPath( 'frontend-custom-preloader.png' ),
		} );
	}

	await continueSdkRequest();
	const mapHosts = page.locator( 'guyamap-map-view' );
	for ( let index = 0; index < 3; index += 1 ) {
		await expect( mapHosts.nth( index ) ).toHaveAttribute(
			'data-state',
			'ready',
			{ timeout: 60000 }
		);
	}
	await expect( enabledPreloader ).toBeHidden();

	const layout = await page.evaluate( () => {
		const blocks = [
			...document.querySelectorAll( '[data-guyamap-map]' ),
		].map( ( block ) => block.getBoundingClientRect().toJSON() );
		return {
			blocks,
			clientWidth: document.documentElement.clientWidth,
			scrollWidth: document.documentElement.scrollWidth,
		};
	} );
	const [ full, wide, standard ] = layout.blocks;
	expect( Math.abs( full.left ) ).toBeLessThanOrEqual( 1 );
	expect( Math.abs( full.right - layout.clientWidth ) ).toBeLessThanOrEqual(
		1
	);
	expect( layout.scrollWidth ).toBe( layout.clientWidth );
	expect( wide.left ).toBeGreaterThan( 0 );
	expect(
		Math.abs( wide.left - ( layout.clientWidth - wide.right ) )
	).toBeLessThanOrEqual( 1 );
	expect( Math.abs( standard.width - 520 ) ).toBeLessThanOrEqual( 1 );
	expect(
		Math.abs( standard.left - ( layout.clientWidth - standard.right ) )
	).toBeLessThanOrEqual( 1 );

	await page.screenshot( {
		fullPage: true,
		path: testInfo.outputPath( 'frontend-width-modes.png' ),
	} );
} );
