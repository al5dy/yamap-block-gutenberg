import { InspectorControls } from '@wordpress/block-editor';
import {
	CheckboxControl,
	PanelBody,
	RangeControl,
	SelectControl,
	TextControl,
	ToggleControl,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import JsonControl from './JsonControl';
import MarkerEditor from './MarkerEditor';
import NumericControl from './NumericControl';
import Preloader from './Preloader';
import ValidatedTextControl from './ValidatedTextControl';
import {
	getCustomizationErrors,
	getCustomizationWarning,
} from './customization-messages';
import {
	toColorInputValue,
	validateAspectRatio,
	validateDimension,
	validateRootMargin,
} from './validators';

// Bounds shared with Config_Normalizer and the runtime normalizer.
const MAX_ZOOM = 23;
const MIN_ZOOM_SPAN = 1;
const MAX_CLUSTER_GRID_SIZE = 256;

const BEHAVIOR_OPTIONS = [
	{ label: __( 'Drag', 'yamap-block-gutenberg' ), value: 'drag' },
	{
		label: __( 'Mouse-wheel zoom', 'yamap-block-gutenberg' ),
		value: 'scrollZoom',
	},
	{ label: __( 'Pinch zoom', 'yamap-block-gutenberg' ), value: 'pinchZoom' },
	{
		label: __( 'Double-click zoom', 'yamap-block-gutenberg' ),
		value: 'dblClick',
	},
	{ label: __( 'Mouse tilt', 'yamap-block-gutenberg' ), value: 'mouseTilt' },
	{
		label: __( 'Mouse rotation', 'yamap-block-gutenberg' ),
		value: 'mouseRotate',
	},
	{ label: __( 'Magnifier', 'yamap-block-gutenberg' ), value: 'magnifier' },
	{
		label: __( 'One-finger zoom', 'yamap-block-gutenberg' ),
		value: 'oneFingerZoom',
	},
	{
		label: __( 'Pinch rotation', 'yamap-block-gutenberg' ),
		value: 'pinchRotate',
	},
	{ label: __( 'Pan and tilt', 'yamap-block-gutenberg' ), value: 'panTilt' },
];

const numberFromPair = ( value, index ) => {
	const number = Number( Array.isArray( value ) ? value[ index ] : 0 );

	return Number.isFinite( number ) ? number : 0;
};

const numberInRange = ( value, fallback, minimum, maximum ) => {
	const number = Number( value );

	return Number.isFinite( number )
		? Math.min( maximum, Math.max( minimum, number ) )
		: fallback;
};

const getRestrictionBounds = ( value, center ) => {
	const centerLatitude = numberInRange(
		center?.latitude,
		55.751244,
		-90,
		90
	);
	const centerLongitude = numberInRange(
		center?.longitude,
		37.618423,
		-180,
		180
	);
	const fallback = [
		[
			Math.max( -180, centerLongitude - 0.5 ),
			Math.min( 90, centerLatitude + 0.5 ),
		],
		[
			Math.min( 180, centerLongitude + 0.5 ),
			Math.max( -90, centerLatitude - 0.5 ),
		],
	];

	if (
		! Array.isArray( value ) ||
		! Array.isArray( value[ 0 ] ) ||
		! Array.isArray( value[ 1 ] )
	) {
		return fallback;
	}

	const firstLongitude = numberInRange(
		value[ 0 ][ 0 ],
		fallback[ 0 ][ 0 ],
		-180,
		180
	);
	const firstLatitude = numberInRange(
		value[ 0 ][ 1 ],
		fallback[ 0 ][ 1 ],
		-90,
		90
	);
	const secondLongitude = numberInRange(
		value[ 1 ][ 0 ],
		fallback[ 1 ][ 0 ],
		-180,
		180
	);
	const secondLatitude = numberInRange(
		value[ 1 ][ 1 ],
		fallback[ 1 ][ 1 ],
		-90,
		90
	);

	return [
		[
			Math.min( firstLongitude, secondLongitude ),
			Math.max( firstLatitude, secondLatitude ),
		],
		[
			Math.max( firstLongitude, secondLongitude ),
			Math.min( firstLatitude, secondLatitude ),
		],
	];
};

export default function InspectorPanels( {
	attributes,
	setAttributes,
	selectedMarkerId,
	onSelectMarker,
} ) {
	const {
		aspectRatio,
		ariaLabel,
		behaviors = [],
		camera = {},
		center = {},
		cluster = {},
		controls = {},
		customization = [],
		fallbackText,
		height,
		loading = {},
		mapMode,
		mapOptions = {},
		markers = [],
		minHeight,
		theme,
		width,
		zoom,
		zoomRange = {},
	} = attributes;
	const preloader = loading.preloader ?? {};
	const minimumZoom = numberInRange( zoomRange.min, 1, 0, MAX_ZOOM );
	const maximumZoom = numberInRange( zoomRange.max, 21, 0, MAX_ZOOM );
	const invalidDimensionHelp = __(
		'Enter a number with a unit: px, %, em, rem, vh, vw, vmin, vmax or ch.',
		'yamap-block-gutenberg'
	);

	const updateObjectAttribute = ( attributeName, patch ) => {
		setAttributes( {
			[ attributeName ]: {
				...( attributes[ attributeName ] ?? {} ),
				...patch,
			},
		} );
	};

	const updatePreloader = ( patch ) => {
		updateObjectAttribute( 'loading', {
			preloader: {
				...preloader,
				...patch,
			},
		} );
	};

	const toggleBehavior = ( behavior, enabled ) => {
		const nextBehaviors = enabled
			? [ ...new Set( [ ...behaviors, behavior ] ) ]
			: behaviors.filter(
					( currentBehavior ) => currentBehavior !== behavior
			  );

		setAttributes( { behaviors: nextBehaviors } );
	};

	const updateMargin = ( index, value ) => {
		const margin = [ 0, 0, 0, 0 ].map(
			( fallback, marginIndex ) =>
				numberFromPair( mapOptions.margin, marginIndex ) ?? fallback
		);
		margin[ index ] = value;
		updateObjectAttribute( 'mapOptions', { margin } );
	};
	const restrictionBounds = getRestrictionBounds(
		mapOptions.restrictMapArea,
		center
	);
	const hasRestrictionBounds = Array.isArray( mapOptions.restrictMapArea );
	const restrictionEnabled = hasRestrictionBounds;
	const updateRestrictionBounds = ( pointIndex, coordinateIndex, value ) => {
		const bounds = restrictionBounds.map( ( point ) => [ ...point ] );
		bounds[ pointIndex ][ coordinateIndex ] = value;
		updateObjectAttribute( 'mapOptions', { restrictMapArea: bounds } );
	};

	return (
		<InspectorControls>
			<PanelBody
				initialOpen
				title={ __( 'Viewport', 'yamap-block-gutenberg' ) }
			>
				<div className="guyamap-control-grid guyamap-control-grid--two">
					<NumericControl
						label={ __(
							'Center latitude',
							'yamap-block-gutenberg'
						) }
						max={ 90 }
						min={ -90 }
						onChange={ ( latitude ) =>
							updateObjectAttribute( 'center', { latitude } )
						}
						step="0.000001"
						value={ center.latitude }
					/>
					<NumericControl
						label={ __(
							'Center longitude',
							'yamap-block-gutenberg'
						) }
						max={ 180 }
						min={ -180 }
						onChange={ ( longitude ) =>
							updateObjectAttribute( 'center', { longitude } )
						}
						step="0.000001"
						value={ center.longitude }
					/>
				</div>
				<RangeControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label={ __( 'Zoom', 'yamap-block-gutenberg' ) }
					max={ maximumZoom }
					min={ minimumZoom }
					onChange={ ( nextZoom ) =>
						setAttributes( { zoom: nextZoom } )
					}
					step={ 0.1 }
					value={ zoom }
				/>
				<div className="guyamap-control-grid guyamap-control-grid--two">
					<NumericControl
						label={ __( 'Minimum zoom', 'yamap-block-gutenberg' ) }
						max={ maximumZoom - MIN_ZOOM_SPAN }
						min={ 0 }
						onChange={ ( min ) =>
							setAttributes( {
								zoomRange: { ...zoomRange, min },
								zoom: Math.max( zoom, min ),
							} )
						}
						step={ 0.1 }
						value={ minimumZoom }
					/>
					<NumericControl
						label={ __( 'Maximum zoom', 'yamap-block-gutenberg' ) }
						max={ MAX_ZOOM }
						min={ minimumZoom + MIN_ZOOM_SPAN }
						onChange={ ( max ) =>
							setAttributes( {
								zoomRange: { ...zoomRange, max },
								zoom: Math.min( zoom, max ),
							} )
						}
						step={ 0.1 }
						value={ maximumZoom }
					/>
				</div>
				<RangeControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label={ __( 'Camera tilt', 'yamap-block-gutenberg' ) }
					max={ 50 }
					min={ 0 }
					onChange={ ( tilt ) =>
						updateObjectAttribute( 'camera', { tilt } )
					}
					step={ 1 }
					value={ camera.tilt ?? 0 }
				/>
				<RangeControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label={ __( 'Camera azimuth', 'yamap-block-gutenberg' ) }
					max={ 180 }
					min={ -180 }
					onChange={ ( azimuth ) =>
						updateObjectAttribute( 'camera', { azimuth } )
					}
					step={ 1 }
					value={ camera.azimuth ?? 0 }
				/>
			</PanelBody>

			<PanelBody
				initialOpen={ false }
				title={ __( 'Container', 'yamap-block-gutenberg' ) }
			>
				<ValidatedTextControl
					help={ __(
						'Use a valid CSS length, for example 100% or 960px.',
						'yamap-block-gutenberg'
					) }
					invalidHelp={ invalidDimensionHelp }
					label={ __( 'Width', 'yamap-block-gutenberg' ) }
					onChange={ ( nextWidth ) =>
						setAttributes( { width: nextWidth } )
					}
					validate={ validateDimension }
					value={ width ?? '100%' }
				/>
				<ValidatedTextControl
					help={ __(
						'Use a valid CSS length, for example 480px or 60vh.',
						'yamap-block-gutenberg'
					) }
					invalidHelp={ invalidDimensionHelp }
					label={ __( 'Height', 'yamap-block-gutenberg' ) }
					onChange={ ( nextHeight ) =>
						setAttributes( { height: nextHeight } )
					}
					validate={ validateDimension }
					value={ height ?? '480px' }
				/>
				<ValidatedTextControl
					invalidHelp={ invalidDimensionHelp }
					label={ __( 'Minimum height', 'yamap-block-gutenberg' ) }
					onChange={ ( nextMinHeight ) =>
						setAttributes( { minHeight: nextMinHeight } )
					}
					validate={ validateDimension }
					value={ minHeight ?? '280px' }
				/>
				<ValidatedTextControl
					help={ __(
						'Leave empty for a free-form height, or use a ratio such as 16 / 9. A ratio replaces the height and minimum height.',
						'yamap-block-gutenberg'
					) }
					invalidHelp={ __(
						'Enter a ratio of two positive numbers, for example 16 / 9.',
						'yamap-block-gutenberg'
					) }
					label={ __( 'Aspect ratio', 'yamap-block-gutenberg' ) }
					onChange={ ( nextAspectRatio ) =>
						setAttributes( { aspectRatio: nextAspectRatio } )
					}
					validate={ validateAspectRatio }
					value={ aspectRatio ?? '' }
				/>
			</PanelBody>

			<PanelBody
				initialOpen={ false }
				title={ __( 'Map appearance', 'yamap-block-gutenberg' ) }
			>
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label={ __( 'Rendering mode', 'yamap-block-gutenberg' ) }
					onChange={ ( nextMapMode ) =>
						setAttributes( { mapMode: nextMapMode } )
					}
					options={ [
						{
							label: __( 'Automatic', 'yamap-block-gutenberg' ),
							value: 'auto',
						},
						{
							label: __( 'Raster', 'yamap-block-gutenberg' ),
							value: 'raster',
						},
						{
							label: __( 'Vector', 'yamap-block-gutenberg' ),
							value: 'vector',
						},
					] }
					value={ mapMode }
				/>
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label={ __( 'Map theme', 'yamap-block-gutenberg' ) }
					onChange={ ( nextTheme ) =>
						setAttributes( { theme: nextTheme } )
					}
					options={ [
						{
							label: __( 'Automatic', 'yamap-block-gutenberg' ),
							value: 'auto',
						},
						{
							label: __( 'Light', 'yamap-block-gutenberg' ),
							value: 'light',
						},
						{
							label: __( 'Dark', 'yamap-block-gutenberg' ),
							value: 'dark',
						},
					] }
					value={ theme }
				/>
				<JsonControl
					expectedType="array"
					help={ __(
						'Advanced Yandex map customization rules. A rule selects map objects with "tags", "types" and "elements" and changes them with "stylers".',
						'yamap-block-gutenberg'
					) }
					label={ __(
						'Customization JSON',
						'yamap-block-gutenberg'
					) }
					onChange={ ( nextCustomization ) =>
						setAttributes( { customization: nextCustomization } )
					}
					validate={ getCustomizationErrors }
					value={ customization }
					warning={ getCustomizationWarning(
						customization,
						mapMode
					) }
				/>
			</PanelBody>

			<PanelBody
				initialOpen={ false }
				title={ __( 'Behaviors', 'yamap-block-gutenberg' ) }
			>
				<p className="components-base-control__help">
					{ __(
						'These behaviors apply on the frontend. The editor preview is intentionally controlled only from this sidebar.',
						'yamap-block-gutenberg'
					) }
				</p>
				{ BEHAVIOR_OPTIONS.map( ( behavior ) => (
					<CheckboxControl
						__nextHasNoMarginBottom
						checked={ behaviors.includes( behavior.value ) }
						key={ behavior.value }
						label={ behavior.label }
						onChange={ ( enabled ) =>
							toggleBehavior( behavior.value, enabled )
						}
					/>
				) ) }
			</PanelBody>

			<PanelBody
				initialOpen={ false }
				title={ __( 'Controls', 'yamap-block-gutenberg' ) }
			>
				<ToggleControl
					__nextHasNoMarginBottom
					checked={ controls.zoom !== false }
					label={ __( 'Zoom control', 'yamap-block-gutenberg' ) }
					onChange={ ( zoomControl ) =>
						updateObjectAttribute( 'controls', {
							zoom: zoomControl,
						} )
					}
				/>
				<ToggleControl
					__nextHasNoMarginBottom
					checked={ controls.geolocation !== false }
					label={ __(
						'Geolocation control',
						'yamap-block-gutenberg'
					) }
					onChange={ ( geolocation ) =>
						updateObjectAttribute( 'controls', { geolocation } )
					}
				/>
				<ToggleControl
					__nextHasNoMarginBottom
					checked={ controls.fullscreen !== false }
					label={ __(
						'Fullscreen control',
						'yamap-block-gutenberg'
					) }
					onChange={ ( fullscreen ) =>
						updateObjectAttribute( 'controls', { fullscreen } )
					}
				/>
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label={ __( 'Controls position', 'yamap-block-gutenberg' ) }
					onChange={ ( position ) =>
						updateObjectAttribute( 'controls', { position } )
					}
					options={ [
						{
							label: __( 'Right', 'yamap-block-gutenberg' ),
							value: 'right',
						},
						{
							label: __( 'Left', 'yamap-block-gutenberg' ),
							value: 'left',
						},
					] }
					value={ controls.position ?? 'right' }
				/>
			</PanelBody>

			<PanelBody
				initialOpen={ false }
				title={ __( 'Advanced map options', 'yamap-block-gutenberg' ) }
			>
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label={ __(
						'Copyrights position',
						'yamap-block-gutenberg'
					) }
					onChange={ ( copyrightsPosition ) =>
						updateObjectAttribute( 'mapOptions', {
							copyrightsPosition,
						} )
					}
					options={ [
						{
							label: __(
								'Bottom right',
								'yamap-block-gutenberg'
							),
							value: 'bottom right',
						},
						{
							label: __( 'Bottom left', 'yamap-block-gutenberg' ),
							value: 'bottom left',
						},
						{
							label: __( 'Top right', 'yamap-block-gutenberg' ),
							value: 'top right',
						},
						{
							label: __( 'Top left', 'yamap-block-gutenberg' ),
							value: 'top left',
						},
					] }
					value={ mapOptions.copyrightsPosition ?? 'bottom right' }
				/>
				<ToggleControl
					__nextHasNoMarginBottom
					checked={ mapOptions.showScaleInCopyrights !== false }
					label={ __(
						'Show scale in copyrights',
						'yamap-block-gutenberg'
					) }
					onChange={ ( showScaleInCopyrights ) =>
						updateObjectAttribute( 'mapOptions', {
							showScaleInCopyrights,
						} )
					}
				/>
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label={ __( 'Zoom rounding', 'yamap-block-gutenberg' ) }
					onChange={ ( zoomRounding ) =>
						updateObjectAttribute( 'mapOptions', { zoomRounding } )
					}
					options={ [
						{
							label: __( 'Automatic', 'yamap-block-gutenberg' ),
							value: 'auto',
						},
						{
							label: __( 'Smooth', 'yamap-block-gutenberg' ),
							value: 'smooth',
						},
						{
							label: __( 'Snap', 'yamap-block-gutenberg' ),
							value: 'snap',
						},
					] }
					value={ mapOptions.zoomRounding ?? 'auto' }
				/>
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label={ __( 'Zoom strategy', 'yamap-block-gutenberg' ) }
					onChange={ ( zoomStrategy ) =>
						updateObjectAttribute( 'mapOptions', { zoomStrategy } )
					}
					options={ [
						{
							label: __(
								'Zoom to pointer',
								'yamap-block-gutenberg'
							),
							value: 'zoomToPointer',
						},
						{
							label: __(
								'Zoom to center',
								'yamap-block-gutenberg'
							),
							value: 'zoomToCenter',
						},
					] }
					value={ mapOptions.zoomStrategy ?? 'zoomToPointer' }
				/>
				<ToggleControl
					__nextHasNoMarginBottom
					checked={ restrictionEnabled }
					help={ __(
						'Keep the area larger than the visible map at the minimum zoom, otherwise the map cannot stay inside it.',
						'yamap-block-gutenberg'
					) }
					label={ __( 'Restrict map area', 'yamap-block-gutenberg' ) }
					onChange={ ( enabled ) =>
						updateObjectAttribute( 'mapOptions', {
							restrictMapArea: enabled
								? restrictionBounds
								: false,
						} )
					}
				/>
				{ restrictionEnabled && (
					<div className="guyamap-control-grid guyamap-control-grid--two">
						<NumericControl
							label={ __(
								'West longitude',
								'yamap-block-gutenberg'
							) }
							max={ 180 }
							min={ -180 }
							onChange={ ( value ) =>
								updateRestrictionBounds( 0, 0, value )
							}
							step="0.000001"
							value={ restrictionBounds[ 0 ][ 0 ] }
						/>
						<NumericControl
							label={ __(
								'North latitude',
								'yamap-block-gutenberg'
							) }
							max={ 90 }
							min={ -90 }
							onChange={ ( value ) =>
								updateRestrictionBounds( 0, 1, value )
							}
							step="0.000001"
							value={ restrictionBounds[ 0 ][ 1 ] }
						/>
						<NumericControl
							label={ __(
								'East longitude',
								'yamap-block-gutenberg'
							) }
							max={ 180 }
							min={ -180 }
							onChange={ ( value ) =>
								updateRestrictionBounds( 1, 0, value )
							}
							step="0.000001"
							value={ restrictionBounds[ 1 ][ 0 ] }
						/>
						<NumericControl
							label={ __(
								'South latitude',
								'yamap-block-gutenberg'
							) }
							max={ 90 }
							min={ -90 }
							onChange={ ( value ) =>
								updateRestrictionBounds( 1, 1, value )
							}
							step="0.000001"
							value={ restrictionBounds[ 1 ][ 1 ] }
						/>
					</div>
				) }
				<ToggleControl
					__nextHasNoMarginBottom
					checked={ Boolean( mapOptions.fitToMarkers ) }
					label={ __(
						'Fit viewport to markers',
						'yamap-block-gutenberg'
					) }
					onChange={ ( fitToMarkers ) =>
						updateObjectAttribute( 'mapOptions', { fitToMarkers } )
					}
				/>
				<div className="guyamap-control-grid guyamap-control-grid--two">
					{ [
						__( 'Top margin', 'yamap-block-gutenberg' ),
						__( 'Right margin', 'yamap-block-gutenberg' ),
						__( 'Bottom margin', 'yamap-block-gutenberg' ),
						__( 'Left margin', 'yamap-block-gutenberg' ),
					].map( ( label, index ) => (
						<NumericControl
							key={ label }
							label={ label }
							min={ 0 }
							onChange={ ( nextMargin ) =>
								updateMargin( index, nextMargin )
							}
							step={ 1 }
							value={ numberFromPair( mapOptions.margin, index ) }
						/>
					) ) }
				</div>
			</PanelBody>

			<PanelBody
				initialOpen={ false }
				title={ __( 'Markers', 'yamap-block-gutenberg' ) }
			>
				<MarkerEditor
					center={ center }
					markers={ markers }
					onChange={ ( nextMarkers ) =>
						setAttributes( { markers: nextMarkers } )
					}
					onSelectMarker={ onSelectMarker }
					selectedMarkerId={ selectedMarkerId }
				/>
			</PanelBody>

			<PanelBody
				initialOpen={ false }
				title={ __( 'Clustering', 'yamap-block-gutenberg' ) }
			>
				<ToggleControl
					__nextHasNoMarginBottom
					checked={ cluster.enabled !== false }
					label={ __( 'Enable clustering', 'yamap-block-gutenberg' ) }
					onChange={ ( enabled ) =>
						updateObjectAttribute( 'cluster', { enabled } )
					}
				/>
				<NumericControl
					label={ __( 'Cluster grid size', 'yamap-block-gutenberg' ) }
					max={ MAX_CLUSTER_GRID_SIZE }
					min={ 16 }
					onChange={ ( gridSize ) =>
						updateObjectAttribute( 'cluster', { gridSize } )
					}
					step={ 1 }
					value={ cluster.gridSize ?? 64 }
				/>
				<NumericControl
					label={ __(
						'Maximum clustering zoom',
						'yamap-block-gutenberg'
					) }
					max={ MAX_ZOOM }
					min={ 0 }
					onChange={ ( maxZoom ) =>
						updateObjectAttribute( 'cluster', { maxZoom } )
					}
					step={ 1 }
					value={ cluster.maxZoom ?? 18 }
				/>
				<TextControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label={ __( 'Cluster color', 'yamap-block-gutenberg' ) }
					onChange={ ( color ) =>
						updateObjectAttribute( 'cluster', { color } )
					}
					type="color"
					value={ toColorInputValue( cluster.color, '#ff4433' ) }
				/>
			</PanelBody>

			<PanelBody
				initialOpen={ false }
				title={ __(
					'Loading and interaction',
					'yamap-block-gutenberg'
				) }
			>
				<p className="components-base-control__help">
					{ __(
						'These options apply on the published page. The editor preview always loads the map right away.',
						'yamap-block-gutenberg'
					) }
				</p>
				<ToggleControl
					__nextHasNoMarginBottom
					checked={ loading.lazy !== false }
					label={ __( 'Lazy-load the map', 'yamap-block-gutenberg' ) }
					onChange={ ( lazy ) =>
						updateObjectAttribute( 'loading', { lazy } )
					}
				/>
				<ValidatedTextControl
					help={ __(
						'Intersection Observer margin, for example 300px.',
						'yamap-block-gutenberg'
					) }
					invalidHelp={ __(
						'Enter one to four px or % values, for example 300px or 200px 0px.',
						'yamap-block-gutenberg'
					) }
					label={ __( 'Preload distance', 'yamap-block-gutenberg' ) }
					onChange={ ( rootMargin ) =>
						updateObjectAttribute( 'loading', { rootMargin } )
					}
					validate={ validateRootMargin }
					value={ loading.rootMargin ?? '300px' }
				/>
				<ToggleControl
					__nextHasNoMarginBottom
					checked={ Boolean( loading.clickToActivate ) }
					label={ __(
						'Require click to activate',
						'yamap-block-gutenberg'
					) }
					onChange={ ( clickToActivate ) =>
						updateObjectAttribute( 'loading', { clickToActivate } )
					}
				/>
				<ToggleControl
					__nextHasNoMarginBottom
					checked={ Boolean( preloader.enabled ) }
					help={ __(
						'When disabled, the map is shown immediately without a loading overlay.',
						'yamap-block-gutenberg'
					) }
					label={ __( 'Show preloader', 'yamap-block-gutenberg' ) }
					onChange={ ( enabled ) => updatePreloader( { enabled } ) }
				/>
				{ preloader.enabled && (
					<>
						<Preloader
							className="guyamap-preloader--preview"
							label={ __(
								'Loading map…',
								'yamap-block-gutenberg'
							) }
							preloader={ preloader }
						/>
						<SelectControl
							__next40pxDefaultSize
							__nextHasNoMarginBottom
							label={ __(
								'Preloader style',
								'yamap-block-gutenberg'
							) }
							onChange={ ( type ) => updatePreloader( { type } ) }
							options={ [
								{
									label: __(
										'Spinner',
										'yamap-block-gutenberg'
									),
									value: 'spinner',
								},
								{
									label: __(
										'Bouncing dots',
										'yamap-block-gutenberg'
									),
									value: 'dots',
								},
								{
									label: __(
										'Pulse',
										'yamap-block-gutenberg'
									),
									value: 'pulse',
								},
							] }
							value={ preloader.type ?? 'spinner' }
						/>
						<div className="guyamap-control-grid guyamap-control-grid--two">
							<TextControl
								__next40pxDefaultSize
								__nextHasNoMarginBottom
								label={ __(
									'Loader color',
									'yamap-block-gutenberg'
								) }
								onChange={ ( color ) =>
									updatePreloader( { color } )
								}
								type="color"
								value={ toColorInputValue(
									preloader.color,
									'#3858e9'
								) }
							/>
							<TextControl
								__next40pxDefaultSize
								__nextHasNoMarginBottom
								label={ __(
									'Background color',
									'yamap-block-gutenberg'
								) }
								onChange={ ( backgroundColor ) =>
									updatePreloader( { backgroundColor } )
								}
								type="color"
								value={ toColorInputValue(
									preloader.backgroundColor,
									'#eef1f5'
								) }
							/>
						</div>
						<RangeControl
							__next40pxDefaultSize
							__nextHasNoMarginBottom
							label={ __(
								'Loader size',
								'yamap-block-gutenberg'
							) }
							max={ 96 }
							min={ 24 }
							onChange={ ( size ) => updatePreloader( { size } ) }
							step={ 1 }
							value={ preloader.size ?? 48 }
						/>
						<RangeControl
							__next40pxDefaultSize
							__nextHasNoMarginBottom
							help={ __(
								'Fade-in duration in milliseconds.',
								'yamap-block-gutenberg'
							) }
							label={ __(
								'Transition duration',
								'yamap-block-gutenberg'
							) }
							max={ 2000 }
							min={ 0 }
							onChange={ ( transitionDuration ) =>
								updatePreloader( { transitionDuration } )
							}
							step={ 50 }
							value={ preloader.transitionDuration ?? 300 }
						/>
						<TextControl
							__next40pxDefaultSize
							__nextHasNoMarginBottom
							label={ __(
								'Accessible loading text',
								'yamap-block-gutenberg'
							) }
							onChange={ ( label ) =>
								updatePreloader( { label } )
							}
							value={
								preloader.label ??
								__( 'Loading map…', 'yamap-block-gutenberg' )
							}
						/>
					</>
				) }
			</PanelBody>

			<PanelBody
				initialOpen={ false }
				title={ __(
					'Accessibility and fallback',
					'yamap-block-gutenberg'
				) }
			>
				<TextControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label={ __( 'Accessible label', 'yamap-block-gutenberg' ) }
					onChange={ ( nextAriaLabel ) =>
						setAttributes( { ariaLabel: nextAriaLabel } )
					}
					value={ ariaLabel ?? '' }
				/>
				<TextControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label={ __(
						'Error and no-JavaScript link text',
						'yamap-block-gutenberg'
					) }
					onChange={ ( nextFallbackText ) =>
						setAttributes( { fallbackText: nextFallbackText } )
					}
					value={ fallbackText ?? '' }
				/>
			</PanelBody>
		</InspectorControls>
	);
}
