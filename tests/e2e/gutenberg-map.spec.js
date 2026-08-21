const { expect, test } = require( '@playwright/test' );

const username = process.env.GUYAMAP_E2E_USERNAME;
const password = process.env.GUYAMAP_E2E_PASSWORD;
const postId = process.env.GUYAMAP_E2E_POST_ID || '2';

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

test.beforeEach( async ( { page } ) => {
	if ( ! username || ! password ) {
		throw new Error(
			'GUYAMAP_E2E_USERNAME and GUYAMAP_E2E_PASSWORD are required.'
		);
	}

	await page.addInitScript( () => {
		window.__guyamapE2E = {
			readyEvents: [],
			errorEvents: [],
		};
		document.addEventListener(
			'guyamap:ready',
			( event ) => {
				const record = {
					controller: event.detail.controller,
					initialMap: event.detail.map,
				};
				event.detail.controller.__guyamapE2EInitialMap =
					event.detail.map;
				window.__guyamapE2E.readyEvents.push( record );
			},
			true
		);
		document.addEventListener(
			'guyamap:error',
			( event ) => {
				window.__guyamapE2E.errorEvents.push(
					event.detail.error?.message || String( event.detail.error )
				);
			},
			true
		);
	} );

	await page.goto( '/wp-login.php', { waitUntil: 'domcontentloaded' } );
	await page.locator( '#user_login' ).fill( username );
	await page.locator( '#user_pass' ).fill( password );
	await Promise.all( [
		page.waitForURL( /\/wp-admin\// ),
		page.locator( '#wp-submit' ).click(),
	] );
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
		renderedZoom: window.__guyamapE2E.readyEvents[ 0 ]?.controller.map.zoom,
		zoom: window.__guyamapE2E.readyEvents[ 0 ]?.controller.appliedConfig
			.zoom,
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
						window.__guyamapE2E.readyEvents[ 0 ].controller;
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
		const map = window.__guyamapE2E.readyEvents[ 0 ].controller.map;
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
		const map = window.__guyamapE2E.readyEvents[ 0 ].controller.map;
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
