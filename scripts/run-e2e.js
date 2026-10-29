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
let temporaryMockPageId = '';
let temporaryLivePageId = '';
let temporaryClassicPageId = '';
let cleanedUp = false;

const cleanup = () => {
	if ( cleanedUp ) {
		return;
	}

	cleanedUp = true;
	[
		temporaryPageId,
		temporaryMockPageId,
		temporaryLivePageId,
		temporaryClassicPageId,
	]
		.filter( Boolean )
		.forEach( ( pageId ) => {
			try {
				wp( [ 'post', 'delete', pageId, '--force' ] );
				process.stdout.write(
					'Removed a temporary WordPress E2E page.\n'
				);
			} catch ( error ) {
				process.stderr.write(
					`E2E page cleanup failed: ${ error.message }\n`
				);
			}
		} );
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

	// Content for the deterministic suite that runs against a mocked SDK.
	const eager = {
		lazy: false,
		rootMargin: '300px',
		clickToActivate: false,
		preloader: { enabled: false },
	};
	// Offsets from the default map center, so the markers are spread out and
	// the first one sits close to the top edge of the map.
	const marker = ( id, title, [ north, east ], extra = {} ) => ( {
		id,
		title,
		coordinates: {
			latitude: 55.751244 + north,
			longitude: 37.618423 + east,
		},
		...extra,
	} );
	const mockContent = [
		{
			loading: eager,
			cluster: { enabled: false },
			markers: [
				marker( 'office', 'Office', [ 0.03, -0.05 ], {
					hint: 'Office hint',
					description: 'Open every day',
					address: 'Moscow',
				} ),
				marker( 'second', 'Second', [ 0, 0 ] ),
				marker( 'third', 'Third', [ -0.02, 0.05 ] ),
			],
		},
		{ loading: { ...eager, clickToActivate: true } },
	]
		.map(
			( attributes ) =>
				`<!-- wp:gutenberg-yandex-block/map ${ JSON.stringify(
					attributes
				) } /-->`
		)
		.join( '\n\n' );
	temporaryMockPageId = wp( [
		'post',
		'create',
		'--post_type=page',
		'--post_status=publish',
		`--post_title=GuYaMap E2E mock ${ Date.now() }`,
		`--post_content=${ mockContent }`,
		'--porcelain',
	] );

	// One default block for the suite that drives every inspector control.
	temporaryLivePageId = wp( [
		'post',
		'create',
		'--post_type=page',
		'--post_status=publish',
		`--post_title=GuYaMap E2E live ${ Date.now() }`,
		`--post_content=<!-- wp:gutenberg-yandex-block/map ${ JSON.stringify( {
			loading: eager,
		} ) } /-->`,
		'--porcelain',
	] );

	// Classic themes are rendered through the theme preview of WordPress, so
	// the active theme of the site is never switched. Without an installed
	// classic theme that suite skips itself.
	const classicTheme =
		process.env.GUYAMAP_E2E_CLASSIC_THEME ??
		wp( [
			'eval',
			'foreach ( wp_get_themes() as $theme ) { if ( ! $theme->is_block_theme() && ! $theme->errors() ) { echo $theme->get_stylesheet(); break; } }',
		] );
	temporaryClassicPageId = wp( [
		'post',
		'create',
		'--post_type=page',
		'--post_status=publish',
		`--post_title=GuYaMap E2E classic ${ Date.now() }`,
		`--post_content=${ [
			'<!-- wp:paragraph --><p>Before the maps.</p><!-- /wp:paragraph -->',
			...[
				{
					cluster: { enabled: false },
					markers: [
						marker( 'office', 'Office', [ 0, 0 ], {
							description: 'Open every day',
						} ),
					],
				},
				{ align: 'wide' },
				{ align: 'full', aspectRatio: '21 / 9' },
				{ height: '300px' },
			].map(
				( attributes ) =>
					`<!-- wp:gutenberg-yandex-block/map ${ JSON.stringify( {
						loading: eager,
						...attributes,
					} ) } /-->`
			),
		].join( '\n\n' ) }`,
		'--porcelain',
	] );

	const result = spawnSync(
		playwrightBin,
		[ 'test', ...process.argv.slice( 2 ) ],
		{
			cwd: projectRoot,
			env: {
				...process.env,
				GUYAMAP_E2E_BASE_URL: siteUrl,
				GUYAMAP_E2E_POST_ID: temporaryPageId,
				GUYAMAP_E2E_USERNAME: username,
				GUYAMAP_E2E_PASSWORD: password,
				GUYAMAP_E2E_LAYOUT_POST_ID: temporaryPageId,
				GUYAMAP_E2E_MOCK_POST_ID: temporaryMockPageId,
				GUYAMAP_E2E_LIVE_POST_ID: temporaryLivePageId,
				GUYAMAP_E2E_CLASSIC_POST_ID: temporaryClassicPageId,
				GUYAMAP_E2E_CLASSIC_THEME: classicTheme,
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
