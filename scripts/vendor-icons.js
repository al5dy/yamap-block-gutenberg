/*
 * Verifies the vendored marker artwork, or refreshes it from upstream.
 *
 * assets/icons/ holds an unmodified copy of the `static/icons` directory of
 * @yandex/ymaps3-default-ui-theme with its license files. That package is a
 * pinned development dependency; it is never bundled. The provenance record
 * in scripts/icon-provenance.json stores the upstream version, the tarball
 * digest from package-lock.json and a SHA-256 digest of every vendored file.
 *
 * Usage:
 *   node scripts/vendor-icons.js            Verify the vendored artwork.
 *   node scripts/vendor-icons.js --update   Copy the artwork of the installed
 *                                           upstream package, then rewrite the
 *                                           provenance record and the catalog.
 *
 * To move to another upstream release, change the pinned version in
 * package.json, run "npm install" and "npm run icons:update", and review the
 * reported differences. Saved maps refer to icons by file name, so an update
 * that drops an icon is refused unless --allow-removals is given.
 */
const { createHash } = require( 'crypto' );
const { spawnSync } = require( 'child_process' );
const fs = require( 'fs' );
const path = require( 'path' );

const PACKAGE = '@yandex/ymaps3-default-ui-theme';
const ICON_FILE_PATTERN = /^[a-z0-9_]{1,64}_24\.svg$/;
const LICENSE_FILES = [ 'LICENSE', 'NOTICES' ];
const FALLBACK_ICON = 'fallback_24.svg';

/*
 * The artwork is served from the site's own origin. Anything that could run
 * or load code when a file is opened directly is refused.
 */
const ACTIVE_SVG_CONTENT = [
	/<script/i,
	/<foreignObject/i,
	/<(?:iframe|object|embed|use|image|a)[\s>]/i,
	/\son[a-z]+\s*=/i,
	/javascript:/i,
	/(?:href|src)\s*=\s*["']\s*(?!#)/i,
	/url\(\s*["']?\s*(?!#)/i,
	/<!ENTITY/i,
];

const projectRoot = path.resolve( __dirname, '..' );
const paths = {
	icons: path.join( projectRoot, 'assets', 'icons' ),
	provenance: path.join( __dirname, 'icon-provenance.json' ),
	manifestScript: path.join( __dirname, 'generate-icon-manifest.js' ),
	packageJson: path.join( projectRoot, 'package.json' ),
	lockfile: path.join( projectRoot, 'package-lock.json' ),
	notices: path.join( projectRoot, 'third-party-notices.txt' ),
	upstream: path.join( projectRoot, 'node_modules', ...PACKAGE.split( '/' ) ),
};

const readJson = ( file ) => JSON.parse( fs.readFileSync( file, 'utf8' ) );

const digest = ( content ) =>
	`sha256-${ createHash( 'sha256' ).update( content ).digest( 'hex' ) }`;

/**
 * Whether an SVG is passive artwork.
 *
 * @param {string} source SVG source.
 * @return {boolean} False when the file could run or load anything.
 */
const isInertSvg = ( source ) =>
	/^\s*(?:<\?xml[^>]*\?>\s*)?<svg[\s>]/.test( source ) &&
	! ACTIVE_SVG_CONTENT.some( ( pattern ) => pattern.test( source ) );

/**
 * Reads the vendored directory as a map of file name to content.
 *
 * @param {string} directory Vendored icon directory.
 * @return {Map<string, Buffer>} Files in name order.
 */
const readVendored = ( directory ) =>
	new Map(
		fs
			.readdirSync( directory )
			.sort()
			.map( ( file ) => [
				file,
				fs.readFileSync( path.join( directory, file ) ),
			] )
	);

/**
 * Reads the icon set and license files of an installed upstream package.
 *
 * @param {string} directory Root of the installed package.
 * @return {{version: string, files: Map<string, Buffer>}} Upstream release.
 */
const readUpstream = ( directory ) => {
	const manifest = readJson( path.join( directory, 'package.json' ) );
	if ( manifest.name !== PACKAGE ) {
		throw new Error( `${ directory } does not contain ${ PACKAGE }.` );
	}

	const iconDirectory = path.join( directory, 'static', 'icons' );
	const files = new Map();
	fs.readdirSync( iconDirectory )
		.sort()
		.forEach( ( file ) => {
			if ( ! ICON_FILE_PATTERN.test( file ) ) {
				throw new Error(
					`Unexpected upstream file static/icons/${ file }: icon files must match ${ ICON_FILE_PATTERN }.`
				);
			}

			const content = fs.readFileSync( path.join( iconDirectory, file ) );
			if ( ! isInertSvg( content.toString( 'utf8' ) ) ) {
				throw new Error(
					`Upstream icon ${ file } is not passive SVG artwork.`
				);
			}
			files.set( file, content );
		} );
	LICENSE_FILES.forEach( ( file ) =>
		files.set( file, fs.readFileSync( path.join( directory, file ) ) )
	);
	if ( ! files.has( FALLBACK_ICON ) ) {
		throw new Error( `Upstream no longer ships ${ FALLBACK_ICON }.` );
	}

	return { version: manifest.version, files };
};

/**
 * Compares two sets of files.
 *
 * @param {Map<string, Buffer>|Object} current  Files, or recorded digests.
 * @param {Map<string, Buffer>|Object} expected Files, or recorded digests.
 * @return {{added: string[], changed: string[], removed: string[]}} Names
 *         only in `expected`, with different content, and only in `current`.
 */
const compare = ( current, expected ) => {
	const toDigests = ( files ) =>
		files instanceof Map
			? new Map(
					[ ...files ].map( ( [ name, content ] ) => [
						name,
						digest( content ),
					] )
			  )
			: new Map( Object.entries( files ) );
	const before = toDigests( current );
	const after = toDigests( expected );

	return {
		added: [ ...after.keys() ].filter( ( name ) => ! before.has( name ) ),
		changed: [ ...after.keys() ].filter(
			( name ) =>
				before.has( name ) && before.get( name ) !== after.get( name )
		),
		removed: [ ...before.keys() ].filter( ( name ) => ! after.has( name ) ),
	};
};

const hasDifferences = ( { added, changed, removed } ) =>
	added.length + changed.length + removed.length > 0;

const describe = ( { added, changed, removed } ) =>
	[
		[ 'missing', added ],
		[ 'modified', changed ],
		[ 'unexpected', removed ],
	]
		.filter( ( [ , names ] ) => names.length )
		.map( ( [ label, names ] ) => `${ label }: ${ names.join( ', ' ) }` )
		.join( '; ' );

/**
 * Reads how the upstream package is pinned by the project.
 *
 * @return {{version: string, lockedVersion: string, integrity: string}} Pins.
 */
const readPins = () => {
	const version = readJson( paths.packageJson ).devDependencies?.[ PACKAGE ];
	const locked = readJson( paths.lockfile ).packages?.[
		`node_modules/${ PACKAGE }`
	];
	if ( ! /^\d+\.\d+\.\d+$/.test( version ?? '' ) ) {
		throw new Error(
			`${ PACKAGE } must be pinned to an exact version in devDependencies.`
		);
	}
	if ( ! locked?.integrity ) {
		throw new Error(
			`${ PACKAGE } is missing from package-lock.json. Run "npm install".`
		);
	}

	return {
		version,
		lockedVersion: locked.version,
		integrity: locked.integrity,
	};
};

/**
 * Lists everything that is inconsistent about the vendored artwork.
 *
 * @param {Object}  options
 * @param {boolean} options.requireUpstream Fail when upstream is not installed.
 * @return {string[]} Problems; empty when the artwork is verified.
 */
const verify = ( { requireUpstream = false } = {} ) => {
	const problems = [];
	const provenance = readJson( paths.provenance );
	const pins = readPins();

	if ( provenance.package !== PACKAGE ) {
		problems.push( `The provenance record is not for ${ PACKAGE }.` );
	}
	if (
		pins.version !== provenance.version ||
		pins.lockedVersion !== provenance.version
	) {
		problems.push(
			`The artwork was vendored from ${ provenance.version }, but package.json pins ${ pins.version } and package-lock.json locks ${ pins.lockedVersion }. Run "npm run icons:update".`
		);
	}
	if ( pins.integrity !== provenance.integrity ) {
		problems.push(
			'The upstream tarball digest in package-lock.json differs from the provenance record.'
		);
	}

	const vendored = compare( readVendored( paths.icons ), provenance.files );
	if ( hasDifferences( vendored ) ) {
		problems.push(
			`assets/icons/ differs from the provenance record (${ describe(
				vendored
			) }).`
		);
	}

	if (
		! fs
			.readFileSync( paths.notices, 'utf8' )
			.includes( `${ PACKAGE } ${ provenance.version }` )
	) {
		problems.push(
			`third-party-notices.txt does not name ${ PACKAGE } ${ provenance.version }.`
		);
	}

	if ( ! fs.existsSync( paths.upstream ) ) {
		if ( requireUpstream ) {
			problems.push(
				`${ PACKAGE } is not installed, so the artwork cannot be compared with upstream. Run "npm install".`
			);
		}
		return problems;
	}

	try {
		const upstream = readUpstream( paths.upstream );
		if ( upstream.version !== provenance.version ) {
			problems.push(
				`The installed ${ PACKAGE } is ${ upstream.version }, not ${ provenance.version }. Run "npm install".`
			);
		} else {
			const drift = compare( upstream.files, provenance.files );
			if ( hasDifferences( drift ) ) {
				problems.push(
					`The installed upstream package differs from the provenance record (${ describe(
						drift
					) }).`
				);
			}
		}
	} catch ( error ) {
		problems.push( error.message );
	}

	return problems;
};

/**
 * Replaces the vendored artwork with the installed upstream release.
 *
 * @param {Object}  options
 * @param {boolean} options.allowRemovals Accept an upstream release that
 *                                        dropped icons.
 * @return {{version: string, added: string[], changed: string[], removed: string[]}} Applied changes.
 */
const update = ( { allowRemovals = false } = {} ) => {
	const pins = readPins();
	if ( ! fs.existsSync( paths.upstream ) ) {
		throw new Error( `${ PACKAGE } is not installed. Run "npm install".` );
	}

	const upstream = readUpstream( paths.upstream );
	if (
		upstream.version !== pins.version ||
		pins.lockedVersion !== pins.version
	) {
		throw new Error(
			`package.json pins ${ PACKAGE } ${ pins.version }, package-lock.json locks ${ pins.lockedVersion } and ${ upstream.version } is installed. Run "npm install".`
		);
	}

	const changes = compare( readVendored( paths.icons ), upstream.files );
	if ( changes.removed.length && ! allowRemovals ) {
		throw new Error(
			`Upstream ${
				upstream.version
			} no longer ships ${ changes.removed.join(
				', '
			) }. Saved maps may use these icons; pass --allow-removals to drop them (they then render as the fallback icon).`
		);
	}

	changes.removed.forEach( ( file ) =>
		fs.unlinkSync( path.join( paths.icons, file ) )
	);
	[ ...changes.added, ...changes.changed ].forEach( ( file ) =>
		fs.writeFileSync(
			path.join( paths.icons, file ),
			upstream.files.get( file )
		)
	);

	const files = {};
	upstream.files.forEach( ( content, name ) => {
		files[ name ] = digest( content );
	} );
	fs.writeFileSync(
		paths.provenance,
		`${ JSON.stringify(
			{
				package: PACKAGE,
				version: upstream.version,
				integrity: pins.integrity,
				files,
			},
			null,
			'\t'
		) }\n`
	);

	const manifest = spawnSync( process.execPath, [ paths.manifestScript ], {
		stdio: 'inherit',
	} );
	if ( manifest.status !== 0 ) {
		throw new Error( 'The icon catalog could not be regenerated.' );
	}

	return { version: upstream.version, ...changes };
};

if ( require.main === module ) {
	try {
		if ( process.argv.includes( '--update' ) ) {
			const result = update( {
				allowRemovals: process.argv.includes( '--allow-removals' ),
			} );
			[ 'added', 'changed', 'removed' ].forEach( ( kind ) => {
				if ( result[ kind ].length ) {
					process.stdout.write(
						`${ kind } (${ result[ kind ].length }): ${ result[
							kind
						].join( ', ' ) }\n`
					);
				}
			} );
			process.stdout.write(
				`Vendored ${ PACKAGE } ${ result.version }. Update third-party-notices.txt if the version changed.\n`
			);
		}

		const problems = verify( { requireUpstream: true } );
		if ( problems.length ) {
			process.stderr.write( `${ problems.join( '\n' ) }\n` );
			process.exit( 1 );
		}
		process.stdout.write(
			`Marker artwork matches ${ PACKAGE } ${
				readJson( paths.provenance ).version
			} (${
				Object.keys( readJson( paths.provenance ).files ).length
			} files).\n`
		);
	} catch ( error ) {
		process.stderr.write( `${ error.message }\n` );
		process.exit( 1 );
	}
}

module.exports = { compare, digest, isInertSvg, readUpstream, verify };
