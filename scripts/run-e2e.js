const { randomBytes } = require( 'crypto' );
const { spawnSync } = require( 'child_process' );
const fs = require( 'fs' );
const path = require( 'path' );

const projectRoot = path.resolve( __dirname, '..' );
const wpRoot = path.resolve(
	process.env.GUYAMAP_E2E_WP_PATH ||
		path.join( projectRoot, '..', '..', '..' )
);
const wpCli = process.env.WP_CLI_BIN || 'wp';
const playwrightBin = path.join(
	projectRoot,
	'node_modules',
	'.bin',
	process.platform === 'win32' ? 'playwright.cmd' : 'playwright'
);

if ( ! fs.existsSync( path.join( wpRoot, 'wp-config.php' ) ) ) {
	throw new Error( `WordPress was not found at ${ wpRoot }.` );
}

const run = ( command, args, options = {} ) => {
	const result = spawnSync( command, args, {
		cwd: projectRoot,
		encoding: 'utf8',
		...options,
	} );

	if ( result.error ) {
		throw result.error;
	}
	if ( result.status !== 0 ) {
		const message = [ result.stdout, result.stderr ]
			.filter( Boolean )
			.join( '\n' )
			.trim();
		throw new Error(
			message || `${ command } exited with status ${ result.status }.`
		);
	}

	return ( result.stdout || '' ).trim();
};

const wp = ( args, options = {} ) =>
	run( wpCli, [ ...args, `--path=${ wpRoot }` ], options );

const suppliedUsername = process.env.GUYAMAP_E2E_USERNAME || '';
const suppliedPassword = process.env.GUYAMAP_E2E_PASSWORD || '';
let temporaryUserId = '';
let temporaryPageId = '';
let cleanedUp = false;

const cleanup = () => {
	if ( cleanedUp ) {
		return;
	}

	cleanedUp = true;
	if ( temporaryPageId ) {
		try {
			wp( [ 'post', 'delete', temporaryPageId, '--force' ] );
			process.stdout.write(
				'Removed the temporary WordPress E2E page.\n'
			);
		} catch ( error ) {
			process.stderr.write(
				`E2E page cleanup failed: ${ error.message }\n`
			);
		}
	}
	if ( ! temporaryUserId ) {
		return;
	}
	try {
		wp( [ 'user', 'delete', temporaryUserId, '--yes' ] );
		process.stdout.write( 'Removed the temporary WordPress E2E user.\n' );
	} catch ( error ) {
		process.stderr.write( `E2E cleanup failed: ${ error.message }\n` );
	}
};

process.once( 'SIGINT', () => {
	cleanup();
	process.exit( 130 );
} );
process.once( 'SIGTERM', () => {
	cleanup();
	process.exit( 143 );
} );

try {
	const siteUrl =
		process.env.GUYAMAP_E2E_BASE_URL ||
		wp( [ 'option', 'get', 'siteurl' ] );
	let username = suppliedUsername;
	let password = suppliedPassword;

	if ( ! username || ! password ) {
		const suffix = `${ process.pid }_${ Date.now() }`;
		username = `guyamap_e2e_${ suffix }`;
		password = randomBytes( 30 ).toString( 'base64url' );
		temporaryUserId = wp( [
			'user',
			'create',
			username,
			`${ username }@example.invalid`,
			'--role=administrator',
			`--user_pass=${ password }`,
			'--porcelain',
		] );
		process.stdout.write( 'Created a temporary WordPress E2E user.\n' );
	}

	const layoutContent = [
		'<!-- wp:gutenberg-yandex-block/map {"align":"full","loading":{"lazy":false,"rootMargin":"300px","clickToActivate":false,"preloader":{"enabled":false}}} /-->',
		'<!-- wp:gutenberg-yandex-block/map {"align":"wide","loading":{"lazy":false,"rootMargin":"300px","clickToActivate":false,"preloader":{"enabled":true,"type":"dots","color":"#d63638","backgroundColor":"#f0f6fc","size":56,"transitionDuration":450,"label":"Loading test map"}}} /-->',
		'<!-- wp:gutenberg-yandex-block/map {"width":"520px","loading":{"lazy":false,"rootMargin":"300px","clickToActivate":false,"preloader":{"enabled":false}}} /-->',
	].join( '\n\n' );
	temporaryPageId = wp( [
		'post',
		'create',
		'--post_type=page',
		'--post_status=publish',
		`--post_title=GuYaMap E2E ${ Date.now() }`,
		`--post_content=${ layoutContent }`,
		'--porcelain',
	] );
	process.stdout.write( 'Created a temporary WordPress E2E page.\n' );

	const result = spawnSync(
		playwrightBin,
		[ 'test', ...process.argv.slice( 2 ) ],
		{
			cwd: projectRoot,
			env: {
				...process.env,
				GUYAMAP_E2E_BASE_URL: siteUrl,
				GUYAMAP_E2E_USERNAME: username,
				GUYAMAP_E2E_PASSWORD: password,
				GUYAMAP_E2E_LAYOUT_POST_ID: temporaryPageId,
			},
			stdio: 'inherit',
		}
	);

	if ( result.error ) {
		throw result.error;
	}
	process.exitCode = result.status ?? 1;
} finally {
	cleanup();
}
