/*
 * Generates src/icon-manifest.json from the vendored marker artwork in
 * assets/icons/. The manifest is the editor's icon catalog; file names are
 * upstream identifiers and are never renamed.
 *
 * Usage:
 *   node scripts/generate-icon-manifest.js          Rewrite the manifest.
 *   node scripts/generate-icon-manifest.js --check  Fail when it is stale.
 */
const fs = require( 'fs' );
const path = require( 'path' );

const projectRoot = path.resolve( __dirname, '..' );
const iconDirectory = path.join( projectRoot, 'assets', 'icons' );
const manifestPath = path.join( projectRoot, 'src', 'icon-manifest.json' );
const ICON_SUFFIX = '_24.svg';
const ICON_NAME_PATTERN = /^[a-z0-9_]{1,64}$/;

// Upstream release the artwork was vendored from; see vendor-icons.js.
const provenance = require( './icon-provenance.json' );
const UPSTREAM = {
	package: provenance.package,
	version: provenance.version,
};

const icons = fs
	.readdirSync( iconDirectory )
	.filter( ( file ) => file.endsWith( ICON_SUFFIX ) )
	.map( ( file ) => file.slice( 0, -ICON_SUFFIX.length ) )
	.sort();

const invalid = icons.filter( ( name ) => ! ICON_NAME_PATTERN.test( name ) );
if ( invalid.length ) {
	throw new Error(
		`Icon names must match ${ ICON_NAME_PATTERN }: ${ invalid.join(
			', '
		) }`
	);
}
if ( ! icons.includes( 'fallback' ) ) {
	throw new Error( 'The fallback icon is missing from assets/icons/.' );
}

const manifest = `${ JSON.stringify(
	{ source: UPSTREAM, size: 24, suffix: ICON_SUFFIX, icons },
	null,
	'\t'
) }\n`;

if ( process.argv.includes( '--check' ) ) {
	const current = fs.existsSync( manifestPath )
		? fs.readFileSync( manifestPath, 'utf8' )
		: '';
	if ( current !== manifest ) {
		process.stderr.write(
			'src/icon-manifest.json is out of date. Run "npm run icons:manifest".\n'
		);
		process.exit( 1 );
	}
	process.stdout.write(
		`Icon manifest is current (${ icons.length } icons).\n`
	);
} else {
	fs.writeFileSync( manifestPath, manifest );
	process.stdout.write(
		`Wrote ${ icons.length } icons to src/icon-manifest.json.\n`
	);
}
