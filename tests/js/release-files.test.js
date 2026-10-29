const path = require( 'path' );
const {
	getReleaseFiles,
	REQUIRED_FILES,
} = require( '../../scripts/release-files' );
const { validateVersions } = require( '../../scripts/check-versions' );

const projectRoot = path.resolve( __dirname, '../..' );

describe( 'production release manifest', () => {
	test( 'contains every required runtime file and no development files', () => {
		const { files } = getReleaseFiles( projectRoot );
		REQUIRED_FILES.forEach( ( required ) =>
			expect( files ).toContain( required )
		);
		expect( files ).not.toContain( 'README.md' );
		expect( files ).not.toContain( 'package.json' );
		expect( files ).not.toContain( 'composer.json' );
		expect( files.some( ( file ) => file.startsWith( 'src/' ) ) ).toBe(
			false
		);
		expect( files.some( ( file ) => file.startsWith( 'tests/' ) ) ).toBe(
			false
		);
		expect( files.some( ( file ) => file.startsWith( 'scripts/' ) ) ).toBe(
			false
		);
	} );

	test( 'packages the complete icon catalog and translations', () => {
		const { files } = getReleaseFiles( projectRoot );
		const manifest = require( '../../src/icon-manifest.json' );
		manifest.icons.forEach( ( icon ) =>
			expect( files ).toContain( `assets/icons/${ icon }_24.svg` )
		);
		expect(
			files.some(
				( file ) =>
					file.startsWith(
						'languages/yamap-block-gutenberg-ru_RU-'
					) && file.endsWith( '.json' )
			)
		).toBe( true );
	} );

	test( 'keeps release identity and block metadata synchronized', () => {
		expect( validateVersions( projectRoot, '2.0.1' ) ).toBe( '2.0.1' );
	} );
} );
