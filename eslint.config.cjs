const defaultConfig = require( '@wordpress/scripts/config/eslint.config.cjs' );

module.exports = [
	// Generated Playwright output contains megabytes of minified JavaScript.
	{ ignores: [ 'playwright-report/**', 'test-results/**' ] },
	...defaultConfig,
];
