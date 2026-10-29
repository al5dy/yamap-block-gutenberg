const fs = require( 'fs' );
const path = require( 'path' );
const { createHash } = require( 'crypto' );
const AdmZip = require( 'adm-zip' );
const { PLUGIN_SLUG } = require( './release-files' );

/**
 * Verifies that a staging directory contains exactly the files of a release
 * ZIP, byte for byte.
 *
 * The GitHub Release ZIP and the WordPress.org Subversion tree must ship the
 * same runtime files. Comparing both against the same verified artifact is
 * what makes that guarantee real.
 *
 * @param {string} zipPath    Absolute path to the release ZIP.
 * @param {string} stagedPath Absolute path to the staging directory.
 */
function verifyStagedTree( zipPath, stagedPath ) {
	const problems = [];
	const fail = ( message ) => problems.push( message );

	if ( ! fs.existsSync( zipPath ) ) {
		throw new Error( `Missing release ZIP: ${ zipPath }` );
	}
	if ( ! fs.existsSync( stagedPath ) ) {
		throw new Error( `Missing staging directory: ${ stagedPath }` );
	}

	const zip = new AdmZip( zipPath );
	const expected = new Map();
	zip.getEntries().forEach( ( entry ) => {
		if ( entry.isDirectory ) {
			return;
		}
		const name = entry.entryName.replace( /\\/g, '/' );
		if ( ! name.startsWith( `${ PLUGIN_SLUG }/` ) ) {
			fail( `ZIP entry outside ${ PLUGIN_SLUG }/: ${ entry.entryName }` );
			return;
		}
		expected.set( name.slice( PLUGIN_SLUG.length + 1 ), entry.getData() );
	} );

	const actual = new Map();
	const walk = ( directory ) => {
		fs.readdirSync( directory, { withFileTypes: true } )
			.sort( ( a, b ) => a.name.localeCompare( b.name ) )
			.forEach( ( entry ) => {
				if ( entry.name === '.svn' ) {
					return;
				}
				const absolute = path.join( directory, entry.name );
				const relative = path
					.relative( stagedPath, absolute )
					.replace( /\\/g, '/' );
				if ( entry.isDirectory() ) {
					walk( absolute );
				} else if ( entry.isFile() ) {
					actual.set( relative, fs.readFileSync( absolute ) );
				} else {
					fail( `Unsupported staging entry: ${ relative }` );
				}
			} );
	};
	walk( stagedPath );

	const missing = [ ...expected.keys() ].filter(
		( relative ) => ! actual.has( relative )
	);
	const unexpected = [ ...actual.keys() ].filter(
		( relative ) => ! expected.has( relative )
	);
	missing.forEach( ( relative ) =>
		fail( `staging is missing ${ relative }` )
	);
	unexpected.forEach( ( relative ) =>
		fail(
			`staging contains ${ relative }, which is not in the release ZIP`
		)
	);

	const digest = ( buffer ) =>
		createHash( 'sha256' ).update( buffer ).digest( 'hex' );
	[ ...expected.keys() ].forEach( ( relative ) => {
		if ( ! actual.has( relative ) ) {
			return;
		}
		const zipHash = digest( expected.get( relative ) );
		const stagedHash = digest( actual.get( relative ) );
		if ( zipHash !== stagedHash ) {
			fail(
				`${ relative } differs between the release ZIP and the staging tree`
			);
		}
	} );

	if ( problems.length ) {
		throw new Error(
			`Staging tree does not match the release ZIP:\n- ${ problems.join(
				'\n- '
			) }`
		);
	}

	return { files: expected.size };
}

module.exports = { verifyStagedTree };

if ( require.main === module ) {
	const [ zipPath, stagedPath ] = process.argv.slice( 2 );
	if ( ! zipPath || ! stagedPath ) {
		process.stderr.write(
			'Usage: node scripts/verify-staged-tree.js <release.zip> <staging-dir>\n'
		);
		process.exit( 2 );
	}
	try {
		const result = verifyStagedTree(
			path.resolve( zipPath ),
			path.resolve( stagedPath )
		);
		process.stdout.write(
			`Staging tree matches the release ZIP (${ result.files } files).\n`
		);
	} catch ( error ) {
		process.stderr.write( `${ error.message }\n` );
		process.exit( 1 );
	}
}
