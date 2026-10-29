const fs = require( 'fs' );
const path = require( 'path' );

const SECTION_KEYS = {
	'Fatal Errors': 'fatalErrors',
	Errors: 'errors',
	Warnings: 'warnings',
	Notes: 'notes',
};

/**
 * Restricted terms that WordPress.org lists and that the mandated display
 * name of this plugin unavoidably contains.
 *
 * The plugin is published on WordPress.org and its slug, main file, text
 * domain and Gutenberg block name are fixed identifiers that must not
 * change. The display name was deliberately renamed to "Yandex Maps for
 * Gutenberg", and WordPress.org's readme validator rejects any display name
 * that contains a restricted term.
 *
 * The terms below are therefore accepted on purpose, and only for findings
 * that concern this plugin's own display name. Any other finding, any other
 * restricted term, and any new error or warning fails the release gate.
 */
const ACCEPTED_RESTRICTED_TERMS = new Set( [ 'yandex', 'gutenberg' ] );

const RESTRICTED_TERM_PATTERN = /restricted\s+term\s*[“"']?\s*`([^`]+)`/gi;
const BACKTICKED_PATTERN = /`([^`]+)`/g;

/**
 * Splits the raw WordPress.org readme validator report into its sections.
 *
 * @param {string} report Raw markdown returned by the validator.
 *
 * @return {{fatalErrors: string[], errors: string[], warnings: string[], notes: string[]}} Findings per section.
 */
function parseValidatorReport( report ) {
	const sections = {
		fatalErrors: [],
		errors: [],
		warnings: [],
		notes: [],
	};
	let current = null;
	let buffer = null;

	const flush = () => {
		if ( current && buffer ) {
			const text = buffer.join( ' ' ).replace( /\s+/g, ' ' ).trim();
			if ( text ) {
				sections[ current ].push( text );
			}
		}
		buffer = null;
	};

	String( report || '' )
		.split( /\r?\n/ )
		.forEach( ( line ) => {
			const heading = line.match( /^###\s+(.+?):\s*$/ );
			if ( heading ) {
				flush();
				current = SECTION_KEYS[ heading[ 1 ].trim() ] || null;
				return;
			}
			if ( ! current ) {
				return;
			}
			const bullet = line.match( /^\s*\*\s+(.*)$/ );
			if ( bullet ) {
				flush();
				buffer = [ bullet[ 1 ] ];
				return;
			}
			const trimmed = line.trim();
			if ( buffer && trimmed && ! trimmed.startsWith( '…' ) ) {
				buffer.push( trimmed );
			}
		} );
	flush();

	return sections;
}

/**
 * Extracts the restricted terms a single finding refers to.
 *
 * @param {string} finding One validator finding.
 *
 * @return {string[]} Lower-cased restricted terms.
 */
function restrictedTermsIn( finding ) {
	const terms = new Set();
	let match = RESTRICTED_TERM_PATTERN.exec( finding );
	while ( match ) {
		terms.add( match[ 1 ].trim().toLowerCase() );
		match = RESTRICTED_TERM_PATTERN.exec( finding );
	}
	RESTRICTED_TERM_PATTERN.lastIndex = 0;
	return [ ...terms ];
}

/**
 * Extracts every backticked identifier of a finding.
 *
 * @param {string} finding One validator finding.
 *
 * @return {string[]} Backticked identifiers.
 */
function backtickedIdentifiers( finding ) {
	const identifiers = [];
	let match = BACKTICKED_PATTERN.exec( finding );
	while ( match ) {
		identifiers.push( match[ 1 ].trim() );
		match = BACKTICKED_PATTERN.exec( finding );
	}
	BACKTICKED_PATTERN.lastIndex = 0;
	return identifiers;
}

/**
 * Decides whether a finding is an accepted consequence of the mandated
 * plugin display name.
 *
 * A finding is accepted only when it is a restricted-term finding whose
 * terms are all accepted terms and that refers to this plugin's own display
 * name. Anything else is unexpected and must fail the release.
 *
 * @param {string} finding    One validator finding.
 * @param {string} pluginName Display name declared in the plugin header.
 *
 * @return {boolean} True when the finding is a known, accepted one.
 */
function isAcceptedRestrictedTermFinding( finding, pluginName ) {
	const terms = restrictedTermsIn( finding );
	if ( ! terms.length ) {
		return false;
	}
	if ( ! terms.every( ( term ) => ACCEPTED_RESTRICTED_TERMS.has( term ) ) ) {
		return false;
	}
	const identifiers = backtickedIdentifiers( finding );
	return identifiers.includes( pluginName );
}

/**
 * Evaluates a parsed validator report against the accepted findings.
 *
 * @param {Object} report     Parsed validator report.
 * @param {string} pluginName Display name declared in the plugin header.
 *
 * @return {{accepted: string[], unexpected: string[], notes: string[]}} Classification of every finding.
 */
function evaluateFindings( report, pluginName ) {
	const accepted = [];
	const unexpected = [];
	const notes = report.notes || [];

	[ ...report.fatalErrors, ...report.errors, ...report.warnings ].forEach(
		( finding ) => {
			if ( isAcceptedRestrictedTermFinding( finding, pluginName ) ) {
				accepted.push( finding );
			} else {
				unexpected.push( finding );
			}
		}
	);

	return { accepted, unexpected, notes };
}

/**
 * Reads the plugin display name from the plugin header.
 *
 * @param {string} pluginFile Absolute path to the main plugin file.
 *
 * @return {string} Plugin display name.
 */
function readPluginName( pluginFile ) {
	const header = fs.readFileSync( pluginFile, 'utf8' );
	const match = header.match( /^\s*\*\s*Plugin Name:\s*(.+)$/m );
	if ( ! match ) {
		throw new Error(
			`Could not read the plugin name from ${ pluginFile }.`
		);
	}
	return match[ 1 ].trim();
}

/**
 * Checks a validator report and throws when it contains unexpected findings.
 *
 * @param {string} report     Raw validator report.
 * @param {string} pluginName Display name declared in the plugin header.
 *
 * @return {{accepted: string[], unexpected: string[], notes: string[]}} Classification of every finding.
 */
function assertAcceptableReport( report, pluginName ) {
	const parsed = parseValidatorReport( report );
	const result = evaluateFindings( parsed, pluginName );
	if ( result.unexpected.length ) {
		throw new Error(
			`The official WordPress.org readme validator reported ${
				result.unexpected.length
			} unexpected finding(s):\n- ${ result.unexpected.join( '\n- ' ) }`
		);
	}
	return result;
}

/**
 * Runs the offline part of the readme gate against a saved validator report.
 *
 * @param {string} reportPath Absolute path to a saved validator report.
 * @param {string} pluginFile Absolute path to the main plugin file.
 *
 * @return {{accepted: string[], unexpected: string[], notes: string[]}} Classification of every finding.
 */
function checkSavedReport( reportPath, pluginFile ) {
	const report = fs.readFileSync( reportPath, 'utf8' );
	return assertAcceptableReport( report, readPluginName( pluginFile ) );
}

module.exports = {
	ACCEPTED_RESTRICTED_TERMS,
	backtickedIdentifiers,
	assertAcceptableReport,
	checkSavedReport,
	evaluateFindings,
	isAcceptedRestrictedTermFinding,
	parseValidatorReport,
	readPluginName,
	restrictedTermsIn,
};

if ( require.main === module ) {
	const projectRoot = path.resolve( __dirname, '..' );
	const reportPath = process.argv[ 2 ];
	if ( ! reportPath ) {
		process.stderr.write(
			'Usage: node scripts/readme-validator.js <validator-report.md>\n'
		);
		process.exit( 2 );
	}
	try {
		const result = checkSavedReport(
			reportPath,
			path.join( projectRoot, 'yamap-block-gutenberg.php' )
		);
		result.accepted.forEach( ( finding ) =>
			process.stdout.write(
				`[readme] accepted finding (mandated display name): ${ finding }\n`
			)
		);
		result.notes.forEach( ( note ) =>
			process.stdout.write( `[readme] note: ${ note }\n` )
		);
		process.stdout.write(
			`[readme] WordPress.org readme validator: ${
				result.unexpected.length
					? 'unexpected findings'
					: 'no unexpected findings'
			}\n`
		);
	} catch ( error ) {
		process.stderr.write( `${ error.message }\n` );
		process.exit( 1 );
	}
}
