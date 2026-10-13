import { useBlockProps } from '@wordpress/block-editor';
import { useState } from '@wordpress/element';

import InspectorPanels from './components/InspectorPanels';
import MapPreview from './components/MapPreview';
import {
	getWidthRatio,
	validateAspectRatio,
	validateDimension,
} from './components/validators';

const safeDimension = ( value, fallback ) =>
	validateDimension( value ) ?? fallback;

const safeAspectRatio = ( value ) => validateAspectRatio( value ) ?? '';

export default function Edit( { attributes, setAttributes } ) {
	// The marker editor falls back to the first marker while this one is
	// missing, so the choice never has to be corrected after the fact.
	const [ selectedMarkerId, setSelectedMarkerId ] = useState( '' );
	const aspectRatio = safeAspectRatio( attributes.aspectRatio );
	const width = safeDimension( attributes.width, '100%' );
	const widthRatio = getWidthRatio( width );
	const blockProps = useBlockProps( {
		className: 'guyamap-block-editor',
		'data-guyamap-aspect-ratio': aspectRatio || undefined,
		'data-guyamap-width-ratio': widthRatio ?? undefined,
		style: {
			'--guyamap-aspect-ratio': aspectRatio || undefined,
			'--guyamap-width-ratio': widthRatio ?? undefined,
			'--guyamap-height': safeDimension( attributes.height, '480px' ),
			'--guyamap-min-height': safeDimension(
				attributes.minHeight,
				'280px'
			),
			'--guyamap-width': width,
		},
	} );

	return (
		<>
			<InspectorPanels
				attributes={ attributes }
				onSelectMarker={ setSelectedMarkerId }
				selectedMarkerId={ selectedMarkerId }
				setAttributes={ setAttributes }
			/>

			<div { ...blockProps }>
				<MapPreview attributes={ attributes } />
			</div>
		</>
	);
}
