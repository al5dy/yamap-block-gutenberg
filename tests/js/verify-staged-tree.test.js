/*
 * @jest-environment node
 *
 * The verification reads a real ZIP from the filesystem. In the jsdom
 * environment the browser build of adm-zip is resolved and cannot read the
 * archive, so this suite runs in the Node environment.
 */
const fs = require( 'fs' );
const os = require( 'os' );
const path = require( 'path' );
const AdmZip = require( 'adm-zip' );
const { verifyStagedTree } = require( '../../scripts/verify-staged-tree' );

const PLUGIN_SLUG = 'yamap-block-gutenberg';

const buildFixture = () => {
	const root = fs.mkdtempSync( path.join( os.tmpdir(), 'guyamap-staged-' ) );
	const zipPath = path.join( root, 'release.zip' );
	const stagedPath = path.join( root, 'staged' );
	const files = {
		'readme.txt': 'Stable tag: 2.0.1\n',
		'build/block.json': '{"name":"gutenberg-yandex-block/map"}\n',
		'assets/icons/fallback_24.svg': '<svg></svg>\n',
	};

	const zip = new AdmZip();
	Object.entries( files ).forEach( ( [ relative, content ] ) => {
		zip.addFile( `${ PLUGIN_SLUG }/${ relative }`, Buffer.from( content ) );
	} );
	zip.writeZip( zipPath );

	fs.mkdirSync( stagedPath, { recursive: true } );
	Object.entries( files ).forEach( ( [ relative, content ] ) => {
		const destination = path.join( stagedPath, ...relative.split( '/' ) );
		fs.mkdirSync( path.dirname( destination ), { recursive: true } );
		fs.writeFileSync( destination, content );
	} );

	return { root, zipPath, stagedPath };
};

describe( 'staged release tree verification', () => {
	test( 'accepts a staging tree that matches the release ZIP', () => {
		const { root, zipPath, stagedPath } = buildFixture();
		try {
			expect( verifyStagedTree( zipPath, stagedPath ).files ).toBe( 3 );
		} finally {
			fs.rmSync( root, { recursive: true, force: true } );
		}
	} );

	test( 'rejects a staging tree with a modified file', () => {
		const { root, zipPath, stagedPath } = buildFixture();
		try {
			fs.writeFileSync(
				path.join( stagedPath, 'readme.txt' ),
				'Stable tag: 9.9.9\n'
			);
			expect( () => verifyStagedTree( zipPath, stagedPath ) ).toThrow(
				/differs between the release ZIP and the staging tree/
			);
		} finally {
			fs.rmSync( root, { recursive: true, force: true } );
		}
	} );

	test( 'rejects a staging tree with a missing file', () => {
		const { root, zipPath, stagedPath } = buildFixture();
		try {
			fs.unlinkSync( path.join( stagedPath, 'readme.txt' ) );
			expect( () => verifyStagedTree( zipPath, stagedPath ) ).toThrow(
				/staging is missing readme.txt/
			);
		} finally {
			fs.rmSync( root, { recursive: true, force: true } );
		}
	} );

	test( 'rejects a staging tree with an extra file', () => {
		const { root, zipPath, stagedPath } = buildFixture();
		try {
			fs.writeFileSync(
				path.join( stagedPath, 'leftover.txt' ),
				'stray\n'
			);
			expect( () => verifyStagedTree( zipPath, stagedPath ) ).toThrow(
				/not in the release ZIP/
			);
		} finally {
			fs.rmSync( root, { recursive: true, force: true } );
		}
	} );
} );
