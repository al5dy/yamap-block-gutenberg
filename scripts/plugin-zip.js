process.env.TZ = 'UTC';

const fs = require( 'fs' );
const path = require( 'path' );
const { execFileSync } = require( 'child_process' );
const AdmZip = require( 'adm-zip' );
const { getReleaseFiles, PLUGIN_SLUG } = require( './release-files' );
const { validateVersions } = require( './check-versions' );

const projectRoot = path.resolve( __dirname, '..' );
const version = validateVersions( projectRoot );
const { files } = getReleaseFiles( projectRoot );
const epochSource =
	process.env.SOURCE_DATE_EPOCH ||
	execFileSync( 'git', [ 'log', '-1', '--format=%ct' ], {
		cwd: projectRoot,
		encoding: 'utf8',
	} ).trim();
const epoch = Number( epochSource );
if ( ! Number.isSafeInteger( epoch ) || epoch < 0 ) {
	throw new Error( `Invalid SOURCE_DATE_EPOCH: ${ epochSource }` );
}
const timestamp = new Date(
	Math.max( 315532800, Math.floor( epoch / 2 ) * 2 ) * 1000
);
const distDirectory = path.resolve(
	projectRoot,
	process.env.GUYAMAP_DIST_DIR || 'dist'
);
const outputPath = path.join(
	distDirectory,
	`${ PLUGIN_SLUG }-${ version }.zip`
);
fs.mkdirSync( distDirectory, { recursive: true } );

if ( ! process.env.GUYAMAP_DIST_DIR ) {
	fs.readdirSync( distDirectory )
		.filter( ( file ) =>
			/^yamap-block-gutenberg-.*\.zip(?:\.sha256)?$/.test( file )
		)
		.forEach( ( file ) =>
			fs.unlinkSync( path.join( distDirectory, file ) )
		);
}

const zip = new AdmZip();
const directories = new Set( [ PLUGIN_SLUG ] );
files.forEach( ( relativePath ) => {
	let directory = path.posix.dirname( relativePath );
	while ( directory !== '.' ) {
		directories.add( directory );
		directory = path.posix.dirname( directory );
	}
} );

const addEntry = ( entryName, content, permissions ) => {
	const entry = zip.addFile( entryName, content, '', permissions );
	entry.header.time = timestamp;
};
[ ...directories ]
	.sort()
	.forEach( ( directory ) =>
		addEntry(
			`${ PLUGIN_SLUG }/${
				directory === PLUGIN_SLUG ? '' : `${ directory }/`
			}`,
			Buffer.alloc( 0 ),
			0o755
		)
	);
files.forEach( ( relativePath ) => {
	addEntry(
		`${ PLUGIN_SLUG }/${ relativePath }`,
		fs.readFileSync(
			path.join( projectRoot, ...relativePath.split( '/' ) )
		),
		0o644
	);
} );

zip.writeZip( outputPath );
process.stdout.write(
	`Created ${ outputPath } with ${ files.length } files (SOURCE_DATE_EPOCH=${ epoch }).\n`
);
