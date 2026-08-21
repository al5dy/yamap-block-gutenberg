const fs = require( 'fs' );
const path = require( 'path' );
const AdmZip = require( 'adm-zip' );

const projectRoot = process.cwd();
const packagePath = path.join( projectRoot, 'package.json' );
const packageData = JSON.parse( fs.readFileSync( packagePath, 'utf8' ) );
const rootFolder = packageData.name;
const outputPath = path.join( projectRoot, `${ rootFolder }.zip` );
const entries = new Set( [ 'package.json', 'package-lock.json' ] );

const addEntry = ( relativePath ) => {
	const normalized = path.normalize( relativePath ).replace( /[\\/]+$/, '' );
	if (
		! normalized ||
		path.isAbsolute( normalized ) ||
		normalized === '..' ||
		normalized.startsWith( `..${ path.sep }` )
	) {
		throw new Error( `Unsafe release path: ${ relativePath }` );
	}

	const absolutePath = path.resolve( projectRoot, normalized );
	if (
		absolutePath !== projectRoot &&
		! absolutePath.startsWith( `${ projectRoot }${ path.sep }` )
	) {
		throw new Error(
			`Release path escapes the project: ${ relativePath }`
		);
	}

	const stats = fs.lstatSync( absolutePath );
	if ( stats.isSymbolicLink() ) {
		throw new Error(
			`Release paths cannot be symlinks: ${ relativePath }`
		);
	}

	if ( stats.isDirectory() ) {
		fs.readdirSync( absolutePath )
			.sort()
			.forEach( ( child ) => addEntry( path.join( normalized, child ) ) );
		return;
	}

	if ( ! stats.isFile() ) {
		throw new Error( `Unsupported release entry: ${ relativePath }` );
	}

	entries.add( normalized.split( path.sep ).join( '/' ) );
};

if ( ! Array.isArray( packageData.files ) ) {
	throw new Error(
		'package.json must define an explicit release files list.'
	);
}

packageData.files.forEach( addEntry );

const zip = new AdmZip();
[ ...entries ].sort().forEach( ( relativePath ) => {
	const zipDirectory = path.posix.dirname( relativePath );
	zip.addLocalFile(
		path.join( projectRoot, ...relativePath.split( '/' ) ),
		path.posix.join( rootFolder, zipDirectory === '.' ? '' : zipDirectory )
	);
} );

if ( fs.existsSync( outputPath ) ) {
	fs.unlinkSync( outputPath );
}

zip.writeZip( outputPath );
process.stdout.write(
	`Created ${ path.basename( outputPath ) } with ${ entries.size } files.\n`
);
