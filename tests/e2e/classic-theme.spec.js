/*
 * Classic themes have no theme.json layout and no block templates: the map is
 * printed by the_content() between markup and styles the plugin knows nothing
 * about. The suite renders a page with an installed classic theme through the
 * theme preview of WordPress, so the active theme of the site stays untouched.
 */
const { expect, test } = require( '@playwright/test' );

const { login } = require( './support/login' );
const { REAL_SDK, provideSdk } = require( './support/sdk' );

const username = process.env.GUYAMAP_E2E_USERNAME;
const password = process.env.GUYAMAP_E2E_PASSWORD;
const postId = process.env.GUYAMAP_E2E_CLASSIC_POST_ID;
const theme = process.env.GUYAMAP_E2E_CLASSIC_THEME;
const READY_TIMEOUT = REAL_SDK ? 90000 : 30000;

test.describe.configure( { timeout: REAL_SDK ? 300000 : 180000 } );

test.beforeAll( () => {
	test.skip(
		! theme,
		'No classic theme is installed. Install one, for example with "wp theme install twentytwentyone", to cover classic themes.'
	);
	if ( ! username || ! password || ! postId ) {
		throw new Error(
			'GUYAMAP_E2E_USERNAME, GUYAMAP_E2E_PASSWORD and GUYAMAP_E2E_CLASSIC_POST_ID are required. Run "npm run test:e2e".'
		);
	}
} );

let pageErrors;

test.beforeEach( async ( { page } ) => {
	pageErrors = [];
	page.on( 'pageerror', ( error ) => {
		// See editor-live-preview.spec.js: the real SDK without a GPU.
		if ( REAL_SDK && error.message === 'undefined' && ! error.stack ) {
			return;
		}
		pageErrors.push( error.message );
	} );
	// Only users who may switch themes can preview one.
	await login( page, username, password );
	await provideSdk( page );
} );

test.afterEach( () => {
	expect( pageErrors, 'no uncaught errors' ).toEqual( [] );
} );

const measure = ( page ) =>
	page.evaluate( () => ( {
		themeStyles: [ ...document.styleSheets ]
			.map( ( sheet ) => sheet.href ?? '' )
			.filter( ( href ) => href.includes( '/themes/' ) ),
		layoutClasses: document.querySelectorAll( '.is-layout-constrained' )
			.length,
		clientWidth: document.documentElement.clientWidth,
		scrollWidth: document.documentElement.scrollWidth,
		maps: [ ...document.querySelectorAll( '[data-guyamap-map]' ) ].map(
			( block ) => {
				const box = block.getBoundingClientRect();
				const host = block.querySelector( 'guyamap-map-view' );
				const hostBox = host.getBoundingClientRect();
				const root = host.shadowRoot;

				return {
					state: host.dataset.state,
					left: Math.round( box.left ),
					right: Math.round( box.right ),
					width: Math.round( box.width ),
					height: Math.round( box.height ),
					fillsBlock:
						Math.abs( hostBox.width - box.width ) <= 1 &&
						Math.abs( hostBox.height - box.height ) <= 1,
					controls: root.querySelectorAll( '.guyamap-map__control' )
						.length,
					markers: root.querySelectorAll( '.guyamap-default-marker' )
						.length,
					pluginStyles: Boolean(
						root.querySelector(
							'link[data-guyamap-shadow-style="plugin"]'
						)
					),
				};
			}
		),
	} ) );

test( 'renders every alignment inside a classic theme', async ( { page } ) => {
	await page.setViewportSize( { width: 1280, height: 900 } );
	await page.goto( `/?page_id=${ postId }&wp_theme_preview=${ theme }`, {
		waitUntil: 'domcontentloaded',
	} );
	const hosts = page.locator( 'guyamap-map-view' );
	await expect( hosts ).toHaveCount( 4 );
	for ( let index = 0; index < 4; index += 1 ) {
		await expect( hosts.nth( index ) ).toHaveAttribute(
			'data-state',
			'ready',
			{ timeout: READY_TIMEOUT }
		);
	}

	// The same page is then narrowed to a phone width without a reload.
	for ( const width of [ 1280, 390 ] ) {
		await page.setViewportSize( { width, height: 900 } );
		await expect
			.poll( async () => ( await measure( page ) ).clientWidth )
			.toBe( width );

		const layout = await measure( page );
		const [ normal, wide, full, fixed ] = layout.maps;
		const centered = ( map ) =>
			Math.abs( map.left - ( layout.clientWidth - map.right ) ) <= 1;

		expect(
			layout.themeStyles.some( ( href ) =>
				href.includes( `/themes/${ theme }/` )
			),
			`the page is rendered by the ${ theme } theme`
		).toBe( true );
		expect( layout.layoutClasses, 'no block-theme layout' ).toBe( 0 );
		expect( layout.scrollWidth, 'no horizontal overflow' ).toBe(
			layout.clientWidth
		);
		layout.maps.forEach( ( map ) =>
			expect( map ).toMatchObject( {
				state: 'ready',
				fillsBlock: true,
				controls: 3,
				pluginStyles: true,
			} )
		);

		expect( normal.height ).toBe( 480 );
		expect( fixed.height ).toBe( 300 );
		expect( normal.markers ).toBe( 1 );
		expect( centered( normal ) ).toBe( true );
		expect( centered( wide ) ).toBe( true );
		expect( wide.width ).toBeGreaterThanOrEqual( normal.width );
		expect( full.width ).toBeGreaterThanOrEqual( wide.width );
		// A ratio defines the height at every width.
		expect(
			Math.abs( full.height - ( full.width * 9 ) / 21 )
		).toBeLessThan( 2 );
		if ( width === 1280 ) {
			expect( wide.width ).toBeGreaterThan( normal.width );
			expect( full.width ).toBe( layout.clientWidth );
		}
	}

	// Theme typography and link styles stay out of the map.
	const first = page.locator( 'guyamap-map-view' ).first();
	await first.scrollIntoViewIfNeeded();
	await first.locator( '.guyamap-default-marker__button' ).click();
	const popup = first.locator( '.guyamap-popup' );
	await expect( popup ).toBeVisible();
	await expect( popup ).toContainText( 'Office' );
	await expect( popup ).toContainText( 'Open every day' );
	expect(
		await popup.evaluate(
			( element ) => window.getComputedStyle( element ).fontFamily
		)
	).toMatch( /^system-ui/ );
} );

test( 'previews and updates maps in the post editor of a classic theme', async ( {
	page,
} ) => {
	await page.goto(
		`/wp-admin/post.php?post=${ postId }&action=edit&wp_theme_preview=${ theme }`,
		{ waitUntil: 'domcontentloaded' }
	);
	await page.waitForFunction(
		() => window.wp?.data?.select( 'core/block-editor' )?.getBlocks().length
	);
	const canvas = page.frameLocator( 'iframe[name="editor-canvas"]' );
	const hosts = canvas.locator( 'guyamap-map-view' );
	await expect( hosts ).toHaveCount( 4 );
	for ( let index = 0; index < 4; index += 1 ) {
		await expect( hosts.nth( index ) ).toHaveAttribute(
			'data-state',
			'ready',
			{ timeout: READY_TIMEOUT }
		);
		await expect( hosts.nth( index ) ).toHaveAttribute( 'inert', '' );
	}

	// A change made in the editor reaches the locked preview.
	await page.evaluate( () => {
		const { getBlocks } = window.wp.data.select( 'core/block-editor' );
		const block = getBlocks().find(
			( candidate ) => candidate.name === 'gutenberg-yandex-block/map'
		);
		window.wp.data
			.dispatch( 'core/block-editor' )
			.updateBlockAttributes( block.clientId, {
				controls: {
					zoom: false,
					geolocation: true,
					fullscreen: false,
					position: 'left',
				},
				markers: [],
			} );
	} );
	const first = hosts.first();
	await expect( first.locator( '.guyamap-map__control' ) ).toHaveCount( 1 );
	await expect( first.locator( '.guyamap-map__fullscreen' ) ).toHaveCount(
		0
	);
	await expect( first.locator( '.guyamap-default-marker' ) ).toHaveCount( 0 );
	await expect( first.locator( '.guyamap-map__controls' ) ).toHaveAttribute(
		'data-position',
		'left'
	);
} );
