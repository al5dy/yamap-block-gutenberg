import { useBlockProps } from '@wordpress/block-editor';
import { useEffect, useMemo, useState } from '@wordpress/element';

import InspectorPanels from './components/InspectorPanels';
import MapPreview from './components/MapPreview';

const DIMENSION_PATTERN =
	/^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|%|em|rem|vh|vw|vmin|vmax|ch))$/i;
const ASPECT_RATIO_PATTERN = /^\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?$/;

const safeDimension = ( value, fallback ) =>
	typeof value === 'string' && DIMENSION_PATTERN.test( value.trim() )
		? value.trim()
		: fallback;

const safeAspectRatio = ( value ) =>
	typeof value === 'string' && ASPECT_RATIO_PATTERN.test( value.trim() )
		? value.trim()
		: '';

export default function Edit( { attributes, setAttributes } ) {
	const markers = useMemo(
		() => ( Array.isArray( attributes.markers ) ? attributes.markers : [] ),
		[ attributes.markers ]
	);
	const [ selectedMarkerId, setSelectedMarkerId ] = useState(
		markers[ 0 ]?.id ?? ''
	);
	const aspectRatio = safeAspectRatio( attributes.aspectRatio );
	const blockProps = useBlockProps( {
		className: 'guyamap-block-editor',
		'data-guyamap-aspect-ratio': aspectRatio || undefined,
		style: {
			'--guyamap-aspect-ratio': aspectRatio || undefined,
			'--guyamap-height': safeDimension( attributes.height, '480px' ),
			'--guyamap-min-height': safeDimension(
				attributes.minHeight,
				'280px'
			),
			'--guyamap-width': safeDimension( attributes.width, '100%' ),
		},
	} );

	useEffect( () => {
		if (
			selectedMarkerId &&
			! markers.some( ( marker ) => marker.id === selectedMarkerId )
		) {
			setSelectedMarkerId( markers[ 0 ]?.id ?? '' );
		}
	}, [ markers, selectedMarkerId ] );

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
