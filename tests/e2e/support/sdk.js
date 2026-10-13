const fs = require( 'fs' );
const path = require( 'path' );

/*
 * Suites that use this helper run against the mocked SDK by default. Set
 * GUYAMAP_E2E_LIVE_SDK=real to run the same assertions against the real
 * Yandex SDK, which needs a key that Yandex accepts for the tested host.
 */
const REAL_SDK = process.env.GUYAMAP_E2E_LIVE_SDK === 'real';
const SDK = 'https://api-maps.yandex.ru/v3/**';
const fakeSdk = fs.readFileSync(
	path.join( __dirname, 'fake-ymaps3.js' ),
	'utf8'
);

/**
 * Serves the mocked SDK to a page or browser context unless the real one was
 * requested.
 *
 * @param {import('@playwright/test').Page|import('@playwright/test').BrowserContext} target Page or context.
 */
const provideSdk = async ( target ) => {
	if ( ! REAL_SDK ) {
		await target.route( SDK, ( route ) =>
			route.fulfill( {
				contentType: 'application/javascript; charset=utf-8',
				body: fakeSdk,
			} )
		);
	}
};

module.exports = { REAL_SDK, provideSdk };
