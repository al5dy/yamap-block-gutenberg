import { __, _n, sprintf } from '@wordpress/i18n';

import {
	MAX_CUSTOMIZATION_RULES,
	MAX_CUSTOMIZATION_STYLERS,
	RASTER_STYLE_SAFE_LENGTH,
	estimateRasterStyleLength,
	normalizeCustomization,
	validateCustomization,
} from '../runtime/customization';

const MAX_LISTED_PROBLEMS = 5;

const describeIssue = ( { code, rule, path } ) => {
	const number = rule + 1;

	switch ( code ) {
		case 'rule':
			return sprintf(
				/* translators: %d: rule number. */
				__( 'Rule %d must be an object.', 'yamap-block-gutenberg' ),
				number
			);
		case 'key':
			return sprintf(
				/* translators: 1: rule number, 2: property path, for example stylers[0].glow. */
				__(
					'Rule %1$d: "%2$s" is not a supported styler property.',
					'yamap-block-gutenberg'
				),
				number,
				path
			);
		case 'no_stylers':
			return sprintf(
				/* translators: %d: rule number. */
				__(
					'Rule %d needs at least one styler with a supported property.',
					'yamap-block-gutenberg'
				),
				number
			);
		case 'too_many_rules':
			return sprintf(
				/* translators: %d: maximum number of rules. */
				__(
					'A style can contain at most %d rules.',
					'yamap-block-gutenberg'
				),
				MAX_CUSTOMIZATION_RULES
			);
		case 'too_many_stylers':
			return sprintf(
				/* translators: 1: rule number, 2: maximum number of stylers. */
				__(
					'Rule %1$d has more than %2$d stylers.',
					'yamap-block-gutenberg'
				),
				number,
				MAX_CUSTOMIZATION_STYLERS
			);
		case 'too_large':
			return sprintf(
				/* translators: %d: rule number. */
				__(
					'The style is too large: rule %d and the rules after it do not fit.',
					'yamap-block-gutenberg'
				),
				number
			);
		default:
			return sprintf(
				/* translators: 1: rule number, 2: property path, for example stylers[0].color. */
				__(
					'Rule %1$d: "%2$s" has an unsupported value.',
					'yamap-block-gutenberg'
				),
				number,
				path
			);
	}
};

/**
 * Explains why a customization would not reach the map as written.
 *
 * @param {*} value Parsed customization JSON.
 * @return {string[]} Translated problems; empty when the style can be applied.
 */
export const getCustomizationErrors = ( value ) => {
	const issues = validateCustomization( value );
	const messages = issues
		.slice( 0, MAX_LISTED_PROBLEMS )
		.map( describeIssue );
	const hidden = issues.length - messages.length;
	if ( hidden > 0 ) {
		messages.push(
			sprintf(
				/* translators: %d: number of further problems. */
				_n(
					'And %d more problem.',
					'And %d more problems.',
					hidden,
					'yamap-block-gutenberg'
				),
				hidden
			)
		);
	}

	return messages;
};

/**
 * Warns when a style cannot be loaded as raster tiles.
 *
 * Every rendering mode can end up with raster tiles: a device that cannot
 * draw the vector map gets them in the automatic and in the vector mode too.
 *
 * @param {*}      value   Stored customization.
 * @param {string} mapMode Rendering mode of the map.
 * @return {string} Translated warning, or an empty string.
 */
export const getCustomizationWarning = ( value, mapMode ) => {
	if (
		estimateRasterStyleLength( normalizeCustomization( value ) ) <=
		RASTER_STYLE_SAFE_LENGTH
	) {
		return '';
	}

	return mapMode === 'raster'
		? __(
				'This style is too long for raster tiles, so the map stays empty. Shorten the style or use the vector rendering mode.',
				'yamap-block-gutenberg'
		  )
		: __(
				'This style is too long for raster tiles. Devices that cannot draw the vector map will show an empty map.',
				'yamap-block-gutenberg'
		  );
};
