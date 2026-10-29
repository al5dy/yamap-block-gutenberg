const fs = require( 'fs' );
const path = require( 'path' );
const { execFileSync } = require( 'child_process' );
const AdmZip = require( 'adm-zip' );

const projectRoot = path.resolve( __dirname, '..' );
const allowedMarkdown = new Set( [
	'README.md',
	'.github/PULL_REQUEST_TEMPLATE.md',
	'.github/SECURITY.md',
] );
const textExtensions = new Set( [
	'.cjs',
	'.css',
	'.html',
	'.js',
	'.json',
	'.php',
	'.po',
	'.pot',
	'.scss',
	'.sh',
	'.svg',
	'.txt',
	'.xml',
	'.yml',
	'.yaml',
] );
const secretPatterns = [
	/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,
	/gh[pousr]_[A-Za-z0-9]{36}/,
	/github_pat_[A-Za-z0-9_]{40,}/,
	/AKIA[0-9A-Z]{16}/,
	/NGROK_AUTHTOKEN\s*=\s*[0-9A-Za-z_]{20,}/,
	/[a-z][a-z0-9+.-]*:\/\/[^/\s:@"']+:[^/\s:@"']+@/,
];
const localPathPattern =
	/(?:\/opt\/lampp(?:-[0-9.]+)?\/|\/home\/[A-Za-z0-9_-]+\/|\/Users\/[A-Za-z0-9_-]+\/|[A-Z]:\\Users\\)/;
const internalProcessPatterns = [
	'AG' + 'ENTS.md',
	'CL' + 'AUDE',
	'OP' + 'ENAI',
	'CH' + 'ATGPT',
	'CO' + 'PILOT',
	'KI' + 'MI CODE',
	'AI-' + 'GENERATED',
].map( ( value ) => new RegExp( value, 'i' ) );
const failures = [];

const fail = ( message ) => failures.push( message );
const normalize = ( value ) =>
	value.replace( /\\/g, '/' ).replace( /^\.\//, '' );
const isIgnoredDirectory = ( relativePath ) =>
	/(^|\/)\.svn(?:\/|$)/.test( relativePath );

function forbiddenReason( relativePath, { source = false } = {} ) {
	const file = normalize( relativePath );
	if (
		! file ||
		file.includes( '\0' ) ||
		/(?:^|\/)\.\.(?:\/|$)/.test( file )
	) {
		return 'unsafe path';
	}
	if (
		/(^|\/)(?:\.git|\.idea|\.vscode|node_modules|vendor|test-results|playwright-report|coverage|\.release-baseline|dist|production|output|\.cache|\.phpunit\.cache)(?:\/|$)/.test(
			file
		)
	) {
		return 'development or generated directory';
	}
	if (
		/(^|\/)(?:\.env(?:\.[A-Za-z0-9_-]+)?|auth\.json|credentials\.json|secrets\.json)$/.test(
			file
		) &&
		path.posix.basename( file ) !== '.env.example'
	) {
		return 'environment or credential file';
	}
	if (
		/\.(?:zip|tar|tgz|gz|bz2|xz|7z|rar|phar|log|sql|dump|sqlite3?|db|bak|backup|orig|rej|tmp|temp|swp|swo|pem|key|p12|pfx)$/i.test(
			file
		) ||
		file.endsWith( '~' )
	) {
		return 'archive, log, dump, backup, temporary file or private key';
	}
	if ( /(?:^|\/)(?:\.DS_Store|Thumbs\.db|desktop\.ini)$/.test( file ) ) {
		return 'operating-system metadata';
	}
	if ( source ) {
		if ( file === 'AG' + 'ENTS.md' || file.startsWith( 'docs/' ) ) {
			return 'local engineering documentation';
		}
		if (
			file.toLowerCase().endsWith( '.md' ) &&
			! allowedMarkdown.has( file ) &&
			! file.startsWith( '.github/ISSUE_TEMPLATE/' )
		) {
			return 'non-public Markdown document';
		}
	} else if (
		/(^|\/)(?:AGENTS\.md|docs|tests|src|scripts|\.github|README\.md|composer\.(?:json|lock)|package(?:-lock)?\.json|playwright\.config\.js|phpcs\.xml\.dist|eslint\.config\.cjs|\.distignore|\.gitignore)(?:\/|$)/.test(
			file
		)
	) {
		return 'non-runtime development file';
	}
	return '';
}

function auditContent( relativePath, content, { source = false } = {} ) {
	const file = normalize( relativePath );
	if ( isIgnoredDirectory( file ) ) {
		return;
	}
	const extension = path.posix.extname( file ).toLowerCase();
	if ( ! textExtensions.has( extension ) && ! file.endsWith( 'LICENSE' ) ) {
		return;
	}
	const text = content.toString( 'utf8' );
	if ( text.includes( '\0' ) ) {
		return;
	}
	secretPatterns.forEach( ( pattern ) => {
		if ( pattern.test( text ) ) {
			fail( `${ file }: possible credential` );
		}
	} );
	if ( localPathPattern.test( text ) ) {
		fail( `${ file }: local filesystem path` );
	}
	if (
		! file.endsWith( 'audit-source.js' ) &&
		internalProcessPatterns.some( ( pattern ) => pattern.test( text ) )
	) {
		fail( `${ file }: internal development-process reference` );
	}
	if ( ! source && /sourceMappingURL/.test( text ) ) {
		fail( `${ file }: source-map reference in production files` );
	}
}

function listDirectory( root ) {
	const records = [];
	const walk = ( directory ) => {
		fs.readdirSync( directory, { withFileTypes: true } )
			.sort( ( a, b ) => a.name.localeCompare( b.name ) )
			.forEach( ( entry ) => {
				const absolute = path.join( directory, entry.name );
				const relative = normalize( path.relative( root, absolute ) );
				if ( isIgnoredDirectory( relative ) ) {
					fail(
						`${ relative }: version-control metadata inside release directory`
					);
					return;
				}
				if ( entry.isSymbolicLink() ) {
					fail( `${ relative }: symbolic link` );
					return;
				}
				if ( entry.isDirectory() ) {
					walk( absolute );
				} else if ( entry.isFile() ) {
					records.push( { relative, absolute } );
				} else {
					fail( `${ relative }: unsupported filesystem entry` );
				}
			} );
	};
	walk( root );
	return records;
}

function auditRecords( records, label, options ) {
	const seen = new Set();
	records.forEach( ( { relative, read } ) => {
		const file = normalize( relative );
		if ( seen.has( file ) ) {
			fail( `${ label }: duplicate entry ${ file }` );
			return;
		}
		seen.add( file );
		const reason = forbiddenReason( file, options );
		if ( reason ) {
			fail( `${ label }: ${ file }: ${ reason }` );
			return;
		}
		auditContent( file, read(), options );
	} );
	return seen.size;
}

function gitFiles() {
	return execFileSync(
		'git',
		[ 'ls-files', '-z', '--cached', '--others', '--exclude-standard' ],
		{ cwd: projectRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
	)
		.split( '\0' )
		.filter( Boolean )
		.sort();
}

const ignoredTracked = execFileSync(
	'git',
	[ 'ls-files', '-ci', '--exclude-standard' ],
	{ cwd: projectRoot, encoding: 'utf8' }
).trim();
if ( ignoredTracked ) {
	fail( `Tracked files match .gitignore rules:\n${ ignoredTracked }` );
}

const sourceRecords = gitFiles().map( ( relative ) => ( {
	relative,
	read: () => fs.readFileSync( path.join( projectRoot, relative ) ),
} ) );
const sourceCount = auditRecords( sourceRecords, 'Git tree', { source: true } );

let targetCount = 0;
process.argv.slice( 2 ).forEach( ( argument ) => {
	const absolute = path.resolve( projectRoot, argument );
	if ( ! fs.existsSync( absolute ) ) {
		fail( `Missing audit target: ${ argument }` );
		return;
	}
	const stats = fs.statSync( absolute );
	if ( stats.isDirectory() ) {
		const records = listDirectory( absolute ).map(
			( { relative, absolute: file } ) => ( {
				relative,
				read: () => fs.readFileSync( file ),
			} )
		);
		targetCount += auditRecords( records, argument, { source: false } );
		return;
	}
	if ( ! stats.isFile() || ! argument.toLowerCase().endsWith( '.zip' ) ) {
		fail( `Unsupported audit target: ${ argument }` );
		return;
	}
	const zip = new AdmZip( absolute );
	const records = zip
		.getEntries()
		.filter( ( entry ) => ! entry.isDirectory )
		.map( ( entry ) => ( {
			relative: entry.entryName,
			read: () => entry.getData(),
		} ) );
	targetCount += auditRecords( records, path.basename( argument ), {
		source: false,
	} );
} );

if ( failures.length ) {
	process.stderr.write(
		`Source audit failed (${
			failures.length
		} problem(s)):\n- ${ failures.join( '\n- ' ) }\n`
	);
	process.exit( 1 );
}
process.stdout.write(
	`Source audit passed: ${ sourceCount } Git files and ${ targetCount } additional release files checked.\n`
);

module.exports = { forbiddenReason };
