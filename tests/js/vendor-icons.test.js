import fs from 'fs';
import os from 'os';
import path from 'path';

import {
	compare,
	digest,
	isInertSvg,
	readUpstream,
	verify,
} from '../../scripts/vendor-icons';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';

const createUpstream = ( icons, manifest = {} ) => {
	const root = fs.mkdtempSync( path.join( os.tmpdir(), 'guyamap-icons-' ) );
	fs.mkdirSync( path.join( root, 'static', 'icons' ), { recursive: true } );
	fs.writeFileSync(
		path.join( root, 'package.json' ),
		JSON.stringify( {
			name: '@yandex/ymaps3-default-ui-theme',
			version: '9.9.9',
			...manifest,
		} )
	);
	fs.writeFileSync( path.join( root, 'LICENSE' ), 'license' );
	fs.writeFileSync( path.join( root, 'NOTICES' ), 'notices' );
	Object.entries( icons ).forEach( ( [ name, content ] ) =>
		fs.writeFileSync( path.join( root, 'static', 'icons', name ), content )
	);

	return root;
};

describe( 'vendored marker artwork', () => {
	it( 'matches its provenance record and the pinned upstream package', () => {
		expect( verify() ).toEqual( [] );
	} );

	it( 'accepts only passive SVG artwork', () => {
		expect( isInertSvg( SVG ) ).toBe( true );
		expect(
			isInertSvg(
				'<svg xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="a"><path d="M0 0"/></clipPath></defs><g clip-path="url(#a)"/></svg>'
			)
		).toBe( true );
		[
			'<svg><script>alert(1)</script></svg>',
			'<svg onload="alert(1)"></svg>',
			'<svg><a href="javascript:alert(1)"><path/></a></svg>',
			'<svg><image href="https://example.test/x.png"/></svg>',
			'<svg><use href="https://example.test/x.svg#a"/></svg>',
			'<svg><foreignObject><b>x</b></foreignObject></svg>',
			'<svg><path style="fill:url(https://example.test/x)"/></svg>',
			'<!DOCTYPE svg [<!ENTITY x "y">]><svg/>',
			'<html><svg/></html>',
			'not an image',
		].forEach( ( source ) => expect( isInertSvg( source ) ).toBe( false ) );
	} );

	it( 'reports added, changed and removed files', () => {
		const current = new Map( [
			[ 'kept_24.svg', Buffer.from( 'same' ) ],
			[ 'edited_24.svg', Buffer.from( 'before' ) ],
			[ 'dropped_24.svg', Buffer.from( 'gone' ) ],
		] );
		const expected = {
			'kept_24.svg': digest( 'same' ),
			'edited_24.svg': digest( 'after' ),
			'new_24.svg': digest( 'new' ),
		};

		expect( compare( current, expected ) ).toEqual( {
			added: [ 'new_24.svg' ],
			changed: [ 'edited_24.svg' ],
			removed: [ 'dropped_24.svg' ],
		} );
		expect( digest( 'same' ) ).toMatch( /^sha256-[0-9a-f]{64}$/ );
	} );

	it( 'reads the icon set and license files of an upstream release', () => {
		const root = createUpstream( {
			'cafe_24.svg': SVG,
			'fallback_24.svg': SVG,
		} );
		const upstream = readUpstream( root );

		expect( upstream.version ).toBe( '9.9.9' );
		expect( [ ...upstream.files.keys() ] ).toEqual( [
			'cafe_24.svg',
			'fallback_24.svg',
			'LICENSE',
			'NOTICES',
		] );
	} );

	it( 'refuses an upstream release it cannot trust', () => {
		expect( () =>
			readUpstream(
				createUpstream( { 'fallback_24.svg': SVG }, { name: 'other' } )
			)
		).toThrow( /does not contain/ );
		expect( () =>
			readUpstream(
				createUpstream( {
					'fallback_24.svg': SVG,
					'evil_24.svg': '<svg><script>alert(1)</script></svg>',
				} )
			)
		).toThrow( /not passive SVG/ );
		expect( () =>
			readUpstream(
				createUpstream( { 'fallback_24.svg': SVG, 'Readme.md': 'x' } )
			)
		).toThrow( /Unexpected upstream file/ );
		expect( () =>
			readUpstream( createUpstream( { 'cafe_24.svg': SVG } ) )
		).toThrow( /no longer ships fallback_24\.svg/ );
	} );
} );
