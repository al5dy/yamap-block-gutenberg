/*
 * Deterministic browser suite. The Yandex SDK request is intercepted, so the
 * tests run without an API key that is valid for the site under test.
 */
const fs = require( 'fs' );
const path = require( 'path' );
const { expect, test } = require( '@playwright/test' );

const { login } = require( './support/login' );

const username = process.env.GUYAMAP_E2E_USERNAME;
const password = process.env.GUYAMAP_E2E_PASSWORD;
const postId = process.env.GUYAMAP_E2E_MOCK_POST_ID;
const SDK = 'https://api-maps.yandex.ru/v3/**';
const fakeSdk = fs.readFileSync(
	path.join( __dirname, 'support', 'fake-ymaps3.js' ),
	'utf8'
);

const serveFakeSdk = ( target ) =>
	target.route( SDK, ( route ) =>
		route.fulfill( {
			contentType: 'application/javascript; charset=utf-8',
			body: fakeSdk,
		} )
	);

// What Yandex returns for a key that is invalid or not allowed for the site.
const rejectKey = ( target, counter ) =>
	target.route( SDK, ( route ) => {
		if ( counter ) {
			counter.count += 1;
		}
		return route.fulfill( {
			status: 403,
			contentType: 'application/json; charset=utf-8',
			body: '{"statusCode":403,"error":"Forbidden","message":"Invalid api key"}',
		} );
	} );

const openFrontend = async ( page ) => {
	await page.goto( `/?page_id=${ postId }`, {
		waitUntil: 'domcontentloaded',
	} );
	return page.locator( '[data-guyamap-map]' );
};

const openEditor = async ( page ) => {
	await page.goto( `/wp-admin/post.php?post=${ postId }&action=edit`, {
		waitUntil: 'domcontentloaded',
	} );
	await expect(
		page.locator( 'iframe[name="editor-canvas"]' )
	).toBeVisible();
	await page.waitForFunction(
		() => window.wp?.data?.select( 'core/block-editor' )?.getBlocks().length
	);
	await page.evaluate( () => {
		window.wp.data
			.dispatch( 'core/preferences' )
			.set( 'core/edit-post', 'welcomeGuide', false );
	} );
	return page.frameLocator( 'iframe[name="editor-canvas"]' );
};

const selectFirstMap = ( page ) =>
	page.evaluate( () => {
		const { getBlocks } = window.wp.data.select( 'core/block-editor' );
		const block = getBlocks().find(
			( candidate ) => candidate.name === 'gutenberg-yandex-block/map'
		);
		window.wp.data
			.dispatch( 'core/block-editor' )
			.selectBlock( block.clientId );
		window.wp.data
			.dispatch( 'core/edit-post' )
			.openGeneralSidebar( 'edit-post/block' );
		return block.clientId;
	} );

const getAttributes = ( page, clientId ) =>
	page.evaluate(
		( id ) =>
			window.wp.data.select( 'core/block-editor' ).getBlock( id )
				.attributes,
		clientId
	);

test.beforeAll( () => {
	if ( ! username || ! password || ! postId ) {
		throw new Error(
			'GUYAMAP_E2E_USERNAME, GUYAMAP_E2E_PASSWORD and GUYAMAP_E2E_MOCK_POST_ID are required. Run "npm run test:e2e".'
		);
	}
} );

test.describe( 'a key rejected by Yandex', () => {
	test( 'keeps the visitor message neutral and does not repeat the refused request', async ( {
		page,
	} ) => {
		const requests = { count: 0 };
		await rejectKey( page, requests );
		const blocks = await openFrontend( page );

		await expect( blocks.first() ).toHaveAttribute(
			'data-guyamap-error',
			'api_key_rejected'
		);
		// The second map starts later and reuses the remembered refusal.
		await blocks.nth( 1 ).scrollIntoViewIfNeeded();
		await blocks
			.nth( 1 )
			.getByRole( 'button', { name: 'Activate map' } )
			.click();
		await expect( blocks.nth( 1 ) ).toHaveAttribute(
			'data-guyamap-error',
			'api_key_rejected'
		);

		const panel = blocks.first().locator( '.guyamap-map__error' );
		await expect( panel ).toContainText( 'The map could not be loaded.' );
		await expect(
			panel.locator( '.guyamap-map__error-details' )
		).toHaveCount( 0 );
		expect( await page.content() ).not.toContain( 'errorDetails' );
		// One script request and one reachability probe for the whole page.
		expect( requests.count ).toBe( 2 );
	} );

	test( 'tells an administrator what to fix, on the page and in the editor', async ( {
		page,
	} ) => {
		await login( page, username, password );
		await rejectKey( page );
		const blocks = await openFrontend( page );
		const host = new URL( page.url() ).hostname;
		const details = blocks.first().locator( '.guyamap-map__error-details' );

		await expect( details ).toContainText( host );
		await expect( details ).toContainText( 'HTTP Referer' );
		await expect(
			details.locator( '.guyamap-map__error-settings' )
		).toHaveAttribute( 'href', /options-general\.php\?page=guyamap/ );
		expect(
			await blocks.first().evaluate( ( block ) => {
				const hostRect = block.getBoundingClientRect();
				const panelRect = block
					.querySelector( 'guyamap-map-view' )
					.shadowRoot.querySelector( '.guyamap-map__error' )
					.getBoundingClientRect();
				return (
					panelRect.top >= hostRect.top &&
					panelRect.bottom <= hostRect.bottom
				);
			} )
		).toBe( true );

		const editor = await openEditor( page );
		const notice = editor
			.locator( '.guyamap-editor-preview__error .components-notice' )
			.first();
		await expect( notice ).toBeVisible();
		await expect( notice ).toContainText( host );
		await expect(
			notice.getByRole( 'link', { name: 'Open map settings' } )
		).toBeVisible();
		// The notice used to be clipped below the block's hidden overflow.
		expect(
			await notice.evaluate( ( element ) => {
				const block = element
					.closest( '.guyamap-block-editor' )
					.getBoundingClientRect();
				const rect = element.getBoundingClientRect();
				return rect.top >= block.top && rect.bottom <= block.bottom;
			} )
		).toBe( true );

		// After the key is fixed, "Retry" loads the map without a page reload.
		await page.unroute( SDK );
		await serveFakeSdk( page );
		await notice
			.getByRole( 'button', { name: 'Retry map preview' } )
			.click();
		// One retry recovers every failed preview on the page.
		for ( const index of [ 0, 1 ] ) {
			await expect(
				editor.locator( 'guyamap-map-view' ).nth( index )
			).toHaveAttribute( 'data-state', 'ready' );
		}
		await expect(
			editor.locator( '.guyamap-editor-preview__error' )
		).toHaveCount( 0 );
	} );
} );

test.describe( 'map interactions', () => {
	test.beforeEach( async ( { page } ) => {
		await serveFakeSdk( page );
	} );

	test( 'markers leave no invisible hit area and show one dismissible popup', async ( {
		page,
	} ) => {
		const pageErrors = [];
		page.on( 'pageerror', ( error ) => pageErrors.push( error.message ) );
		const blocks = await openFrontend( page );
		const map = blocks.first();
		await expect( map ).toHaveAttribute( 'data-guyamap-state', 'ready' );

		const geometry = await map.evaluate( ( block ) => {
			const root = block.querySelector( 'guyamap-map-view' ).shadowRoot;
			return [ ...root.querySelectorAll( '.ymaps3--marker' ) ].map(
				( wrapper ) => {
					const box = wrapper.getBoundingClientRect();
					const pin = wrapper
						.querySelector( '.guyamap-default-marker' )
						.getBoundingClientRect();
					return {
						wrapper: [ box.width, box.height ],
						// Pin tip relative to the coordinate pixel.
						tip: [
							Math.round( pin.left + pin.width / 2 - box.left ),
							Math.round( pin.bottom - box.top ),
						],
					};
				}
			);
		} );
		expect( geometry ).toHaveLength( 3 );
		for ( const marker of geometry ) {
			expect( marker.wrapper ).toEqual( [ 0, 0 ] );
			expect( marker.tip ).toEqual( [ 0, 0 ] );
		}

		const first = map.getByRole( 'button', { name: 'Office hint' } );
		const second = map.getByRole( 'button', { name: 'Second' } );
		const openPopups = map.locator( '.guyamap-popup:not([hidden])' );

		await first.hover();
		await expect( map.locator( '.guyamap-marker-hint' ) ).toBeVisible();
		await first.click();
		await expect( openPopups ).toHaveCount( 1 );
		await expect( openPopups ).toContainText( 'Office' );
		await expect( first ).toHaveAttribute( 'aria-expanded', 'true' );
		// The marker is near the top edge: the popup must flip inside the map.
		expect(
			await openPopups.evaluate( ( popup ) => {
				const bounds = popup.getRootNode().host.getBoundingClientRect();
				const rect = popup.getBoundingClientRect();
				const centre = popup
					.getRootNode()
					.elementFromPoint(
						rect.left + rect.width / 2,
						rect.top + rect.height / 2
					);
				return {
					inside:
						rect.top >= bounds.top &&
						rect.bottom <= bounds.bottom &&
						rect.left >= bounds.left &&
						rect.right <= bounds.right,
					onTop: popup.contains( centre ),
				};
			} )
		).toEqual( { inside: true, onTop: true } );

		await second.click();
		await expect( openPopups ).toHaveCount( 1 );
		await expect( openPopups ).toContainText( 'Second' );
		await expect( first ).toHaveAttribute( 'aria-expanded', 'false' );

		await page.keyboard.press( 'Escape' );
		await expect( openPopups ).toHaveCount( 0 );
		await expect( second ).toBeFocused();

		await first.click();
		await expect( openPopups ).toHaveCount( 1 );
		// An empty spot of the map, scrolled into view by the click itself.
		const box = await map.boundingBox();
		await map.click( { position: { x: 30, y: box.height - 60 } } );
		await expect( openPopups ).toHaveCount( 0 );
		expect( pageErrors ).toEqual( [] );
	} );

	test( 'keeps keyboard focus in the map after activation and reports geolocation failures', async ( {
		page,
	} ) => {
		await page.addInitScript( () => {
			navigator.geolocation.getCurrentPosition = ( success, failure ) =>
				setTimeout( () => failure( { code: 1 } ), 20 );
		} );
		const blocks = await openFrontend( page );
		const gated = blocks.nth( 1 );
		await gated.scrollIntoViewIfNeeded();
		await expect( gated ).toHaveAttribute(
			'data-guyamap-state',
			'awaiting-activation'
		);
		expect(
			await page.evaluate( () => window.__guyamapFakeMaps.length )
		).toBe( 1 );

		await gated.getByRole( 'button', { name: 'Activate map' } ).focus();
		await page.keyboard.press( 'Enter' );
		await expect( gated ).toHaveAttribute( 'data-guyamap-state', 'ready' );
		await expect( gated.locator( 'guyamap-map-view' ) ).toBeFocused();

		const map = blocks.first();
		await map.scrollIntoViewIfNeeded();
		await map.getByRole( 'button', { name: 'Show my location' } ).click();
		const notice = map.locator( '.guyamap-map__notice' );
		await expect( notice ).toBeVisible();
		await expect( notice ).toContainText( 'denied' );
	} );
} );

test.describe( 'editor controls', () => {
	test( 'store only values the map can render', async ( { page } ) => {
		const pageErrors = [];
		page.on( 'pageerror', ( error ) => pageErrors.push( error.message ) );
		await login( page, username, password );
		await serveFakeSdk( page );
		const editor = await openEditor( page );
		await expect(
			editor.locator( 'guyamap-map-view' ).first()
		).toHaveAttribute( 'data-state', 'ready' );
		const clientId = await selectFirstMap( page );

		// Clearing a number must not silently store 0 (the equator).
		const latitude = page.getByLabel( 'Center latitude' );
		const before = ( await getAttributes( page, clientId ) ).center
			.latitude;
		await latitude.fill( '' );
		await latitude.blur();
		expect(
			( await getAttributes( page, clientId ) ).center.latitude
		).toBe( before );
		await expect( latitude ).toHaveValue( String( before ) );

		// The Yandex API throws on an empty zoom interval.
		const maximum = page.getByLabel( 'Maximum zoom' );
		const minimum = page.getByLabel( 'Minimum zoom' );
		await maximum.fill( '8' );
		await maximum.blur();
		await minimum.fill( '12' );
		await minimum.blur();
		await maximum.fill( '99' );
		await maximum.blur();
		const { zoom, zoomRange } = await getAttributes( page, clientId );
		expect( zoomRange.min ).toBeLessThan( zoomRange.max );
		expect( zoomRange.max ).toBeLessThanOrEqual( 23 );
		expect( zoom ).toBeGreaterThanOrEqual( zoomRange.min );
		expect( zoom ).toBeLessThanOrEqual( zoomRange.max );

		await page
			.getByRole( 'button', { name: 'Container', exact: true } )
			.click();
		const height = page.getByLabel( 'Height', { exact: true } );
		const storedHeight = ( await getAttributes( page, clientId ) ).height;
		await height.fill( 'abc' );
		await expect( height ).toHaveAttribute( 'aria-invalid', 'true' );
		expect( ( await getAttributes( page, clientId ) ).height ).toBe(
			storedHeight
		);
		await height.fill( '320px' );
		expect( ( await getAttributes( page, clientId ) ).height ).toBe(
			'320px'
		);

		await expect(
			editor.locator( 'guyamap-map-view' ).first()
		).toHaveAttribute( 'data-state', 'ready' );
		expect( pageErrors ).toEqual( [] );
	} );

	test( 'offer only the bundled marker icons', async ( {
		page,
	}, testInfo ) => {
		const missingIcons = [];
		page.on( 'response', ( response ) => {
			if (
				response.status() === 404 &&
				response.url().includes( '/assets/icons/' )
			) {
				missingIcons.push( response.url() );
			}
		} );
		await login( page, username, password );
		await serveFakeSdk( page );
		const editor = await openEditor( page );
		await expect(
			editor.locator( 'guyamap-map-view' ).first()
		).toHaveAttribute( 'data-state', 'ready' );
		const clientId = await selectFirstMap( page );
		const iconName = async () =>
			( await getAttributes( page, clientId ) ).markers[ 0 ].icon?.name;

		await page
			.getByRole( 'button', { name: 'Markers', exact: true } )
			.click();
		await page.getByRole( 'button', { name: /^Office/ } ).click();

		const picker = page.getByRole( 'combobox', {
			name: 'Icon',
			exact: true,
		} );
		await picker.fill( 'air' );
		await expect(
			page.getByRole( 'option', { name: 'Airport' } )
		).toBeVisible();
		await page.screenshot( {
			path: testInfo.outputPath( 'icon-picker.png' ),
		} );
		await page.getByRole( 'option', { name: 'Airport' } ).click();
		expect( await iconName() ).toBe( 'airport' );
		await expect(
			page.locator( '.guyamap-icon-picker__preview' )
		).toHaveAttribute( 'src', /\/airport_24\.svg$/ );
		await expect(
			editor.locator( '.guyamap-default-marker__icon' ).first()
		).toHaveAttribute( 'src', /\/airport_24\.svg$/ );

		// Free text that is not an icon cannot be stored.
		await picker.fill( 'not-an-icon' );
		await expect(
			page.locator(
				'.components-form-token-field__suggestions-list [role="option"]'
			)
		).toHaveCount( 0 );
		await picker.press( 'Tab' );
		expect( await iconName() ).toBe( 'airport' );
		expect( missingIcons ).toEqual( [] );
	} );
} );
