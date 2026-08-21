import { BlockControls, useBlockProps } from '@wordpress/block-editor';
import { ToolbarButton, ToolbarGroup } from '@wordpress/components';
import { useCallback, useEffect, useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import InspectorPanels from './components/InspectorPanels';
import MapPreview from './components/MapPreview';
import {
	createMarker,
	normalizeCoordinates,
	updateMarkerById,
} from './components/marker-utils';

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

export default function Edit( { attributes, setAttributes, isSelected } ) {
	const markers = useMemo(
		() => ( Array.isArray( attributes.markers ) ? attributes.markers : [] ),
		[ attributes.markers ]
	);
	const [ selectedMarkerId, setSelectedMarkerId ] = useState(
		markers[ 0 ]?.id ?? ''
	);
	const [ isPickingMarker, setIsPickingMarker ] = useState( false );
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

	useEffect( () => {
		if ( ! isSelected ) {
			setIsPickingMarker( false );
		}
	}, [ isSelected ] );

	const handleMapClick = useCallback(
		( coordinates ) => {
			if ( ! isPickingMarker ) {
				return;
			}

			const marker = createMarker( coordinates );
			setAttributes( { markers: [ ...markers, marker ] } );
			setSelectedMarkerId( marker.id );
			setIsPickingMarker( false );
		},
		[ isPickingMarker, markers, setAttributes ]
	);

	const handleMarkerDragEnd = useCallback(
		( markerId, coordinates ) => {
			setAttributes( {
				markers: updateMarkerById( markers, markerId, ( marker ) => ( {
					...marker,
					coordinates: normalizeCoordinates(
						coordinates,
						marker.coordinates ?? attributes.center
					),
				} ) ),
			} );
			setSelectedMarkerId( markerId );
		},
		[ attributes.center, markers, setAttributes ]
	);

	return (
		<>
			<BlockControls>
				<ToolbarGroup>
					<ToolbarButton
						icon="location-alt"
						isPressed={ isPickingMarker }
						label={
							isPickingMarker
								? __(
										'Cancel marker placement',
										'yamap-block-gutenberg'
								  )
								: __(
										'Place marker on map',
										'yamap-block-gutenberg'
								  )
						}
						onClick={ () =>
							setIsPickingMarker( ( current ) => ! current )
						}
					/>
				</ToolbarGroup>
			</BlockControls>

			<InspectorPanels
				attributes={ attributes }
				isPickingMarker={ isPickingMarker }
				onSelectMarker={ setSelectedMarkerId }
				onTogglePicking={ () =>
					setIsPickingMarker( ( current ) => ! current )
				}
				selectedMarkerId={ selectedMarkerId }
				setAttributes={ setAttributes }
			/>

			<div { ...blockProps }>
				<MapPreview
					attributes={ attributes }
					interactive={ isSelected }
					isPickingMarker={ isPickingMarker }
					onMapClick={ handleMapClick }
					onMarkerDragEnd={ handleMarkerDragEnd }
				/>
			</div>
		</>
	);
}
