import manifest from '../icon-manifest.json';

export const FALLBACK_ICON = 'fallback';

const ICON_NAMES = new Set( manifest.icons );

/**
 * Turns an upstream identifier such as `auto_parts` into `Auto parts`.
 * The identifier itself stays the stored value and is never translated.
 *
 * @param {string} name Canonical icon name.
 * @return {string} Readable label.
 */
const toLabel = ( name ) => {
	const words = name.replace( /_/g, ' ' );

	return words.charAt( 0 ).toUpperCase() + words.slice( 1 );
};

export const ICON_OPTIONS = manifest.icons.map( ( name ) => ( {
	label: toLabel( name ),
	value: name,
} ) );

/**
 * Whether a bundled preset icon exists for a name.
 *
 * @param {string} name Icon name.
 * @return {boolean} True for a bundled icon.
 */
export const isBundledIcon = ( name ) => ICON_NAMES.has( name );

/**
 * Builds the URL of a bundled icon.
 *
 * @param {string} baseUrl URL of the bundled icon directory.
 * @param {string} name    Canonical icon name.
 * @return {string} Icon URL, or an empty string without a base URL.
 */
export const getIconUrl = ( baseUrl, name ) =>
	baseUrl
		? `${ baseUrl.replace( /\/?$/, '/' ) }${ name }${ manifest.suffix }`
		: '';
