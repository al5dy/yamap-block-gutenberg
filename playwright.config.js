const { defineConfig, devices } = require( '@playwright/test' );

const baseURL = process.env.GUYAMAP_E2E_BASE_URL || 'https://lokotkov.dev';

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
	projects: [
		{
			name: 'chromium',
			use: { ...devices[ 'Desktop Chrome' ] },
		},
	],
} );
