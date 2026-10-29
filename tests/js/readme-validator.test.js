const {
	ACCEPTED_RESTRICTED_TERMS,
	assertAcceptableReport,
	evaluateFindings,
	isAcceptedRestrictedTermFinding,
	parseValidatorReport,
	readPluginName,
	restrictedTermsIn,
} = require( '../../scripts/readme-validator' );

const PLUGIN_NAME = 'Yandex Maps for Gutenberg';

const FATAL_TRADEMARK_REPORT = `# Readme Validator

### Fatal Errors:

 * Your chosen plugin name – \`${ PLUGIN_NAME }\` – contains the restricted
   term “\`yandex\`” which cannot be used to begin your permalink or display name.
   We disallow the use of certain terms in ways that are abused, or potentially
   infringe on and/or are misleading with regards to trademarks.
   Your chosen plugin
   name – \`${ PLUGIN_NAME }\` – contains the restricted term “\`gutenberg\`“,
   which cannot be used at all in your plugin permalink nor the display name.

### Notes:

 * The following tags are not widely used: \`clustering\`
 * No donate link was found
`;

describe( 'WordPress.org readme validator gate', () => {
	test( 'reads the display name from the plugin header', () => {
		const name = readPluginName(
			require( 'path' ).resolve(
				__dirname,
				'../../yamap-block-gutenberg.php'
			)
		);
		expect( name ).toBe( PLUGIN_NAME );
	} );

	test( 'parses every validator section', () => {
		const parsed = parseValidatorReport( FATAL_TRADEMARK_REPORT );
		expect( parsed.fatalErrors ).toHaveLength( 1 );
		expect( parsed.errors ).toHaveLength( 0 );
		expect( parsed.warnings ).toHaveLength( 0 );
		expect( parsed.notes ).toHaveLength( 2 );
	} );

	test( 'extracts the restricted terms of a finding', () => {
		const parsed = parseValidatorReport( FATAL_TRADEMARK_REPORT );
		expect( restrictedTermsIn( parsed.fatalErrors[ 0 ] ) ).toEqual( [
			'yandex',
			'gutenberg',
		] );
	} );

	test( 'accepts the restricted terms of the mandated display name', () => {
		const parsed = parseValidatorReport( FATAL_TRADEMARK_REPORT );
		expect(
			isAcceptedRestrictedTermFinding(
				parsed.fatalErrors[ 0 ],
				PLUGIN_NAME
			)
		).toBe( true );
		expect( ACCEPTED_RESTRICTED_TERMS.has( 'yandex' ) ).toBe( true );
		expect( ACCEPTED_RESTRICTED_TERMS.has( 'gutenberg' ) ).toBe( true );
	} );

	test( 'rejects a restricted term that is not accepted', () => {
		const finding =
			'Your chosen plugin name – `Acme Maps for WordPress` – contains the restricted term “`wordpress`“, which cannot be used at all in your plugin permalink nor the display name.';
		expect( isAcceptedRestrictedTermFinding( finding, PLUGIN_NAME ) ).toBe(
			false
		);
	} );

	test( 'rejects a finding about a different plugin name', () => {
		const finding =
			'Your chosen plugin name – `Other Plugin` – contains the restricted term “`yandex`“, which cannot be used to begin your permalink or display name.';
		expect( isAcceptedRestrictedTermFinding( finding, PLUGIN_NAME ) ).toBe(
			false
		);
	} );

	test( 'rejects warnings and ordinary errors', () => {
		const report = `# Readme Validator

### Warnings:

 * The \`Short Description\` section is too long and was truncated. A maximum of 150 characters is supported.

### Errors:

 * The \`Stable tag\` header is missing.
`;
		const result = evaluateFindings(
			parseValidatorReport( report ),
			PLUGIN_NAME
		);
		expect( result.accepted ).toHaveLength( 0 );
		expect( result.unexpected ).toHaveLength( 2 );
		expect( () => assertAcceptableReport( report, PLUGIN_NAME ) ).toThrow(
			/unexpected finding/
		);
	} );

	test( 'treats notes as informational only', () => {
		const report = `# Readme Validator

### Notes:

 * No donate link was found
`;
		const result = evaluateFindings(
			parseValidatorReport( report ),
			PLUGIN_NAME
		);
		expect( result.unexpected ).toHaveLength( 0 );
		expect( result.notes ).toHaveLength( 1 );
		expect( () =>
			assertAcceptableReport( report, PLUGIN_NAME )
		).not.toThrow();
	} );

	test( 'accepts the real validator report of the shipped readme.txt', () => {
		const fs = require( 'fs' );
		const path = require( 'path' );
		const reportPath = path.resolve(
			__dirname,
			'../../tests/fixtures/readme-validator-report.txt'
		);
		if ( ! fs.existsSync( reportPath ) ) {
			return;
		}
		const report = fs.readFileSync( reportPath, 'utf8' );
		const result = evaluateFindings(
			parseValidatorReport( report ),
			PLUGIN_NAME
		);
		expect( result.unexpected ).toHaveLength( 0 );
	} );
} );
