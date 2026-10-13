const { defineConfig, devices } = require( '@playwright/test' );

const baseURL = process.env.GUYAMAP_E2E_BASE_URL || 'https://lokotkov.dev';

/*
 * GUYAMAP_E2E_BROWSERS selects the browsers, for example
 * "chromium,firefox,webkit"; WebKit is the engine of Safari. GUYAMAP_E2E_GPU=1
 * lets headless Chromium use the graphics hardware, which the real Yandex SDK
 * needs for its vector engine.
 */
const browsers = {
	chromium: {
		...devices[ 'Desktop Chrome' ],
		launchOptions:
			process.env.GUYAMAP_E2E_GPU === '1'
				? {
						args: [
							'--use-angle=gl',
							'--ignore-gpu-blocklist',
							'--enable-gpu',
						],
				  }
				: {},
	},
	firefox: devices[ 'Desktop Firefox' ],
	webkit: devices[ 'Desktop Safari' ],
};
const projects = ( process.env.GUYAMAP_E2E_BROWSERS || 'chromium' )
	.split( ',' )
	.map( ( name ) => name.trim() )
	.filter( Boolean )
	.map( ( name ) => {
		if ( ! browsers[ name ] ) {
			throw new Error(
				`Unknown browser "${ name }" in GUYAMAP_E2E_BROWSERS. Use ${ Object.keys(
					browsers
				).join( ', ' ) }.`
			);
		}

		return { name, use: browsers[ name ] };
	} );

module.exports = defineConfig( {
	testDir: './tests/e2e',
	fullyParallel: false,
	workers: 1,
	timeout: 90000,
	expect: {
		timeout: 15000,
	},
	forbidOnly: Boolean( process.env.CI ),
	retries: process.env.CI ? 1 : 0,
	outputDir: 'test-results/artifacts',
	preserveOutput: 'always',
	reporter: [
		[ 'line' ],
		[ 'html', { open: 'never', outputFolder: 'playwright-report' } ],
	],
	use: {
		baseURL,
		headless: process.env.GUYAMAP_E2E_HEADED !== '1',
		ignoreHTTPSErrors: true,
		locale: 'en-US',
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
		video: 'retain-on-failure',
	},
	projects,
} );
