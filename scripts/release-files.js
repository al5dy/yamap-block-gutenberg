const fs = require( 'fs' );
const path = require( 'path' );
const { execFileSync } = require( 'child_process' );

const PLUGIN_SLUG = 'yamap-block-gutenberg';
const REQUIRED_FILES = [
	'LICENSE',
	'LICENSES/Apache-2.0.txt',
	'assets/icons/LICENSE',
	'assets/icons/NOTICES',
	'assets/icons/fallback_24.svg',
	'build/block.json',
	'build/index.asset.php',
	'build/index.css',
	'build/index.js',
	'build/style-index.css',
	'build/view.asset.php',
	'build/view.js',
	'build/yandex-clusterer.js',
	'includes/Plugin.php',
	'languages/yamap-block-gutenberg.pot',
	'languages/yamap-block-gutenberg-ru_RU.mo',
	'languages/yamap-block-gutenberg-ru_RU.po',
	'readme.txt',
	'third-party-notices.txt',
	'uninstall.php',
	'yamap-block-gutenberg.php',
];

const normalize = ( value ) =>
	value.replace( /\\/g, '/' ).replace( /^\.\//, '' );

function assertSafeRelative( relativePath ) {
	const normalized = normalize( relativePath ).replace( /\/+$/, '' );
	if (
		! normalized ||
		path.posix.isAbsolute( normalized ) ||
		normalized === '..' ||
		normalized.startsWith( '../' ) ||
		normalized.includes( '\0' )
	) {
		throw new Error( `Unsafe release path: ${ relativePath }` );
	}
	return normalized;
}

function readPackage( projectRoot ) {
	const packageData = JSON.parse(
		fs.readFileSync( path.join( projectRoot, 'package.json' ), 'utf8' )
	);
	if ( packageData.name !== PLUGIN_SLUG ) {
		throw new Error( `package.json name must remain ${ PLUGIN_SLUG }.` );
	}
	if ( ! Array.isArray( packageData.files ) || ! packageData.files.length ) {
		throw new Error(
			'package.json must define the explicit release files list.'
		);
	}
	return packageData;
}

function trackedFiles( projectRoot ) {
	return new Set(
		execFileSync( 'git', [ 'ls-files', '-z', '--cached' ], {
			cwd: projectRoot,
			encoding: 'utf8',
			maxBuffer: 32 * 1024 * 1024,
		} )
			.split( '\0' )
			.filter( Boolean )
			.map( normalize )
	);
}

function actualFiles( projectRoot, relativePath ) {
	const absolute = path.resolve( projectRoot, relativePath );
	const root = path.resolve( projectRoot );
	if (
		absolute !== root &&
		! absolute.startsWith( `${ root }${ path.sep }` )
	) {
		throw new Error(
			`Release path escapes the project: ${ relativePath }`
		);
	}
	if ( ! fs.existsSync( absolute ) ) {
		throw new Error( `Missing release entry: ${ relativePath }` );
	}
	const stats = fs.lstatSync( absolute );
	if ( stats.isSymbolicLink() ) {
		throw new Error(
			`Release paths cannot be symlinks: ${ relativePath }`
		);
	}
	if ( stats.isFile() ) {
		return [ relativePath ];
	}
	if ( ! stats.isDirectory() ) {
		throw new Error( `Unsupported release entry: ${ relativePath }` );
	}
	return fs
		.readdirSync( absolute, { withFileTypes: true } )
		.sort( ( a, b ) => a.name.localeCompare( b.name ) )
		.flatMap( ( entry ) =>
			actualFiles(
				projectRoot,
				path.posix.join( relativePath, entry.name )
			)
		);
}

function getReleaseFiles( projectRoot ) {
	const packageData = readPackage( projectRoot );
	const entries = [
		...new Set( packageData.files.map( assertSafeRelative ) ),
	].sort();
	const tracked = trackedFiles( projectRoot );
	const actual = entries.flatMap( ( entry ) =>
		actualFiles( projectRoot, entry )
	);
	const untracked = actual.filter(
		( relativePath ) => ! tracked.has( relativePath )
	);
	if ( untracked.length ) {
		throw new Error(
			`Release paths contain untracked files; add them deliberately or remove them:\n${ untracked.join(
				'\n'
			) }`
		);
	}
	const files = [ ...new Set( actual ) ].sort();
	REQUIRED_FILES.forEach( ( relativePath ) => {
		if ( ! files.includes( relativePath ) ) {
			throw new Error(
				`Missing required runtime file: ${ relativePath }`
			);
		}
	} );
	return { files, entries, packageData };
}

module.exports = {
	PLUGIN_SLUG,
	REQUIRED_FILES,
	assertSafeRelative,
	getReleaseFiles,
	normalize,
	readPackage,
};
