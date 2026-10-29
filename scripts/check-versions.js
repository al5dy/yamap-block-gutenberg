const fs = require( 'fs' );
const path = require( 'path' );
const { isDeepStrictEqual } = require( 'util' );
const { PLUGIN_SLUG } = require( './release-files' );

const readJson = ( root, relativePath ) =>
	JSON.parse( fs.readFileSync( path.join( root, relativePath ), 'utf8' ) );

function validateVersions( projectRoot, expectedVersion = '' ) {
	const problems = [];
	const fail = ( message ) => problems.push( message );
	const main = fs.readFileSync(
		path.join( projectRoot, 'yamap-block-gutenberg.php' ),
		'utf8'
	);
	const readme = fs.readFileSync(
		path.join( projectRoot, 'readme.txt' ),
		'utf8'
	);
	const packageData = readJson( projectRoot, 'package.json' );
	const lock = readJson( projectRoot, 'package-lock.json' );
	const sourceBlock = readJson( projectRoot, 'src/block.json' );
	const buildBlock = readJson( projectRoot, 'build/block.json' );
	const headerVersion =
		main.match( /^\s*\*\s*Version:\s*(.+)$/m )?.[ 1 ]?.trim() || '';
	const constantVersion =
		main.match(
			/define\(\s*['"]GUYAMAP_VERSION['"]\s*,\s*['"]([^'"]+)['"]\s*\)/
		)?.[ 1 ] || '';
	const stableTag =
		readme.match( /^Stable tag:\s*(.+)$/m )?.[ 1 ]?.trim() || '';
	const version = headerVersion;
	if ( ! /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/.test( version ) ) {
		fail( `Invalid plugin header version: ${ version || 'missing' }` );
	}
	if ( expectedVersion && version !== expectedVersion ) {
		fail( `Expected version ${ expectedVersion }, found ${ version }` );
	}
	const versions = {
		GUYAMAP_VERSION: constantVersion,
		'package.json': packageData.version,
		'package-lock.json': lock.version,
		'package-lock root package': lock.packages?.[ '' ]?.version,
		'src/block.json': sourceBlock.version,
		'build/block.json': buildBlock.version,
		'readme Stable tag': stableTag,
	};
	Object.entries( versions ).forEach( ( [ label, actual ] ) => {
		if ( actual !== version ) {
			fail(
				`${ label } is ${ actual || 'missing' }, expected ${ version }`
			);
		}
	} );
	if ( ! main.includes( 'Plugin Name:       Yandex Maps for Gutenberg' ) ) {
		fail( 'The public plugin name is not Yandex Maps for Gutenberg.' );
	}
	if ( ! main.includes( 'Author URI:        https://lokotkov.dev' ) ) {
		fail( 'Author URI must be https://lokotkov.dev.' );
	}
	if (
		! main.includes(
			'Plugin URI:        https://github.com/al5dy/yamap-block-gutenberg'
		)
	) {
		fail( 'Plugin URI does not match the verified GitHub repository.' );
	}
	if ( ! main.includes( 'Text Domain:       yamap-block-gutenberg' ) ) {
		fail( 'The text domain changed.' );
	}
	if ( packageData.name !== PLUGIN_SLUG ) {
		fail( 'The npm package/slug changed.' );
	}
	if ( sourceBlock.name !== 'gutenberg-yandex-block/map' ) {
		fail( 'The persisted Gutenberg block name changed.' );
	}
	if ( sourceBlock.title !== 'Yandex Map' ) {
		fail( 'The block title must remain Yandex Map.' );
	}
	if (
		sourceBlock.description !==
		'A fast, accessible Yandex map with markers and clustering.'
	) {
		fail(
			'The block description does not match the public block metadata.'
		);
	}
	if ( ! isDeepStrictEqual( sourceBlock, buildBlock ) ) {
		fail( 'src/block.json and build/block.json differ semantically.' );
	}
	if ( ! readme.includes( `= ${ version } =` ) ) {
		fail( `readme.txt has no changelog/upgrade section for ${ version }.` );
	}
	const readmeBytes = Buffer.byteLength( readme, 'utf8' );
	if ( readmeBytes > 10000 ) {
		fail(
			`readme.txt is ${ readmeBytes } bytes and exceeds the 10,000-byte release limit by ${
				readmeBytes - 10000
			} bytes; shorten the prose before adding more content.`
		);
	}
	const shortDescription = readme.split( /\r?\n\r?\n/ )[ 1 ] || '';
	if ( Buffer.byteLength( shortDescription, 'utf8' ) > 150 ) {
		fail( 'The readme short description exceeds 150 bytes.' );
	}
	const tags = readme.match( /^Tags:\s*(.+)$/m )?.[ 1 ]?.split( ',' ) || [];
	if ( tags.length < 1 || tags.length > 5 ) {
		fail( 'readme.txt must contain between one and five tags.' );
	}
	if ( problems.length ) {
		throw new Error(
			`Version check failed:\n- ${ problems.join( '\n- ' ) }`
		);
	}
	return version;
}

if ( require.main === module ) {
	try {
		const expected = process.argv[ 2 ] || '';
		const version = validateVersions(
			path.resolve( __dirname, '..' ),
			expected
		);
		process.stdout.write(
			`Version and block metadata check passed: ${ version }.\n`
		);
	} catch ( error ) {
		process.stderr.write( `${ error.message }\n` );
		process.exit( 1 );
	}
}

module.exports = { validateVersions };
