import fs from 'fs';
import path from 'path';

import provenance from '../../scripts/icon-provenance.json';
import manifest from '../../src/icon-manifest.json';
import {
	ICON_OPTIONS,
	getIconUrl,
	isBundledIcon,
} from '../../src/components/icon-catalog';

const iconDirectory = path.resolve( __dirname, '../../assets/icons' );
const artwork = fs
	.readdirSync( iconDirectory )
	.filter( ( file ) => file.endsWith( manifest.suffix ) );

describe( 'bundled marker icon catalog', () => {
	it( 'lists exactly the artwork shipped in assets/icons', () => {
		const listed = manifest.icons.map(
			( name ) => `${ name }${ manifest.suffix }`
		);

		// Every catalog entry has a file, so a chosen icon can never 404.
		expect(
			listed.filter( ( file ) => ! artwork.includes( file ) )
		).toEqual( [] );
		// Every vendored file is offered, so no artwork is orphaned.
		expect(
			artwork.filter( ( file ) => ! listed.includes( file ) )
		).toEqual( [] );
		expect( manifest.icons.length ).toBeGreaterThan( 200 );
	} );

	it( 'keeps canonical upstream identifiers sorted, unique and URL-safe', () => {
		expect( [ ...manifest.icons ].sort() ).toEqual( manifest.icons );
		expect( new Set( manifest.icons ).size ).toBe( manifest.icons.length );
		manifest.icons.forEach( ( name ) =>
			expect( name ).toMatch( /^[a-z0-9_]{1,64}$/ )
		);
	} );

	it( 'always contains the fallback glyph and rejects unknown names', () => {
		expect( isBundledIcon( 'fallback' ) ).toBe( true );
		expect( isBundledIcon( 'airport' ) ).toBe( true );
		expect( isBundledIcon( 'does_not_exist' ) ).toBe( false );
		expect( isBundledIcon( '../fallback' ) ).toBe( false );
		expect( isBundledIcon( undefined ) ).toBe( false );
	} );

	it( 'offers readable labels while storing the upstream identifier', () => {
		expect( ICON_OPTIONS ).toHaveLength( manifest.icons.length );
		expect(
			ICON_OPTIONS.find( ( option ) => option.value === 'auto_parts' )
		).toEqual( { label: 'Auto parts', value: 'auto_parts' } );
		expect( getIconUrl( 'https://example.test/icons', 'cafe' ) ).toBe(
			'https://example.test/icons/cafe_24.svg'
		);
		expect( getIconUrl( 'https://example.test/icons/', 'cafe' ) ).toBe(
			'https://example.test/icons/cafe_24.svg'
		);
		expect( getIconUrl( '', 'cafe' ) ).toBe( '' );
	} );

	it( 'records where the artwork came from', () => {
		expect( manifest.source ).toEqual( {
			package: provenance.package,
			version: provenance.version,
		} );
		expect( manifest.source.package ).toBe(
			'@yandex/ymaps3-default-ui-theme'
		);
		expect( fs.existsSync( path.join( iconDirectory, 'LICENSE' ) ) ).toBe(
			true
		);
	} );
} );
