const fs = require( 'fs' );
const os = require( 'os' );
const path = require( 'path' );
const { createHash } = require( 'crypto' );
const { execFileSync } = require( 'child_process' );
const AdmZip = require( 'adm-zip' );
const {
	getReleaseFiles,
	PLUGIN_SLUG,
	normalize,
} = require( './release-files' );
const { validateVersions } = require( './check-versions' );

const projectRoot = path.resolve( __dirname, '..' );
const version = validateVersions( projectRoot );
const expectedName = `${ PLUGIN_SLUG }-${ version }.zip`;
const zipPath = path.resolve(
	projectRoot,
	process.argv[ 2 ] || path.join( 'dist', expectedName )
);
const fail = ( message ) => {
	throw new Error( `Package check failed: ${ message }` );
};
if ( ! fs.existsSync( zipPath ) || ! fs.statSync( zipPath ).isFile() ) {
	fail( `missing ZIP ${ zipPath }` );
}
if ( path.basename( zipPath ) !== expectedName ) {
	fail( `ZIP must be named ${ expectedName }` );
}

const { files: expectedFiles, entries: expectedTopLevel } =
	getReleaseFiles( projectRoot );
const zip = new AdmZip( zipPath );
const entries = zip.getEntries();
const files = [];
const topLevel = new Set();
const seen = new Set();
entries.forEach( ( entry ) => {
	const name = normalize( entry.entryName );
	if (
		name.startsWith( '/' ) ||
		name.includes( '\\' ) ||
		/(?:^|\/)\.\.(?:\/|$)/.test( name ) ||
		! name.startsWith( `${ PLUGIN_SLUG }/` )
	) {
		fail(
			`unsafe entry or entry outside ${ PLUGIN_SLUG }/: ${ entry.entryName }`
		);
	}
	if ( seen.has( name ) ) {
		fail( `duplicate ZIP entry: ${ name }` );
	}
	seen.add( name );
	if ( Math.floor( entry.attr / 65536 / 4096 ) % 16 === 0xa ) {
		fail( `symbolic link in ZIP: ${ name }` );
	}
	if ( entry.isDirectory ) {
		return;
	}
	const relative = name.slice( PLUGIN_SLUG.length + 1 );
	files.push( relative );
	topLevel.add( relative.split( '/' )[ 0 ] );
} );
files.sort();
const expectedSet = new Set( expectedFiles );
const actualSet = new Set( files );
const missing = expectedFiles.filter( ( file ) => ! actualSet.has( file ) );
const unexpected = files.filter( ( file ) => ! expectedSet.has( file ) );
if ( missing.length || unexpected.length ) {
	fail(
		`release allowlist mismatch; missing=[${ missing.join(
			', '
		) }], unexpected=[${ unexpected.join( ', ' ) }]`
	);
}
const expectedDirectories = [
	...new Set(
		expectedTopLevel.map(
			( entry ) => entry.replace( /\/+$/, '' ).split( '/' )[ 0 ]
		)
	),
];
const actualTopLevel = [ ...topLevel ].sort();
if (
	JSON.stringify( [ ...expectedDirectories ].sort() ) !==
	JSON.stringify( actualTopLevel )
) {
	fail(
		`top-level entries differ: expected ${ expectedDirectories.join(
			', '
		) }, found ${ actualTopLevel.join( ', ' ) }`
	);
}
if ( ! entries.some( ( entry ) => entry.entryName === `${ PLUGIN_SLUG }/` ) ) {
	fail( `the explicit ${ PLUGIN_SLUG }/ root directory is missing` );
}

const work = fs.mkdtempSync( path.join( os.tmpdir(), 'guyamap-package-' ) );
let sha;
try {
	entries.forEach( ( entry ) => {
		if ( entry.isDirectory ) {
			return;
		}
		const relative = normalize( entry.entryName ).slice(
			PLUGIN_SLUG.length + 1
		);
		const source = path.join( projectRoot, ...relative.split( '/' ) );
		const content = entry.getData();
		if ( ! content.equals( fs.readFileSync( source ) ) ) {
			fail( `packaged file differs from the source tree: ${ relative }` );
		}
		const destination = path.join(
			work,
			...normalize( entry.entryName ).split( '/' )
		);
		fs.mkdirSync( path.dirname( destination ), { recursive: true } );
		fs.writeFileSync( destination, content );
	} );
	const phpFiles = files.filter( ( file ) => file.endsWith( '.php' ) );
	phpFiles.forEach( ( relative ) => {
		execFileSync(
			'php',
			[ '-l', path.join( work, PLUGIN_SLUG, ...relative.split( '/' ) ) ],
			{ stdio: 'pipe' }
		);
	} );
	execFileSync(
		process.execPath,
		[ path.join( projectRoot, 'scripts/audit-source.js' ), zipPath ],
		{ cwd: projectRoot, stdio: 'pipe' }
	);
	sha = createHash( 'sha256' )
		.update( fs.readFileSync( zipPath ) )
		.digest( 'hex' );
	fs.writeFileSync( `${ zipPath }.sha256`, `${ sha }  ${ expectedName }\n` );
} finally {
	fs.rmSync( work, { recursive: true, force: true } );
}
process.stdout.write(
	`Package verified: ${ expectedName } (${ files.length } files)\nSHA-256: ${ sha }\n`
);
