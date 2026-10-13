import { ComboboxControl } from '@wordpress/components';
import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import {
	FALLBACK_ICON,
	ICON_OPTIONS,
	getIconUrl,
	isBundledIcon,
} from './icon-catalog';

/**
 * Searchable catalog of the bundled marker icons with artwork previews.
 *
 * @param {Object}   props          Component props.
 * @param {string}   props.value    Stored icon name.
 * @param {Function} props.onChange Receives the chosen icon name.
 * @param {string}   props.baseUrl  URL of the bundled icon directory.
 */
export default function IconPicker( { value, onChange, baseUrl } ) {
	// A name without a bundled file renders as the fallback glyph everywhere.
	const selected = isBundledIcon( value ) ? value : FALLBACK_ICON;
	const previewUrl = getIconUrl( baseUrl, selected );
	const renderItem = useMemo(
		() =>
			function IconOption( { item } ) {
				const url = getIconUrl( baseUrl, item.value );

				return (
					<span className="guyamap-icon-picker__option">
						{ url && (
							<img
								alt=""
								height={ 20 }
								loading="lazy"
								src={ url }
								width={ 20 }
							/>
						) }
						{ item.label }
					</span>
				);
			},
		[ baseUrl ]
	);

	return (
		<div className="guyamap-icon-picker">
			{ previewUrl && (
				<img
					alt=""
					className="guyamap-icon-picker__preview"
					height={ 24 }
					src={ previewUrl }
					width={ 24 }
				/>
			) }
			<ComboboxControl
				__experimentalRenderItem={ renderItem }
				__next40pxDefaultSize
				__nextHasNoMarginBottom
				allowReset={ false }
				help={ __(
					'Type to search the bundled icons.',
					'yamap-block-gutenberg'
				) }
				label={ __( 'Icon', 'yamap-block-gutenberg' ) }
				onChange={ ( name ) => onChange( name || FALLBACK_ICON ) }
				options={ ICON_OPTIONS }
				value={ selected }
			/>
		</div>
	);
}
