import {
	Button,
	Notice,
	SelectControl,
	TextControl,
	TextareaControl,
	ToggleControl,
} from '@wordpress/components';
import { useEffect, useMemo, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import NumericControl from './NumericControl';
import {
	createMarker,
	createMarkerId,
	normalizeCoordinates,
	updateMarkerById,
} from './marker-utils';

const MAX_VISIBLE_MARKERS = 100;

const getPairValue = ( pair, index, fallback ) => {
	const value = Array.isArray( pair ) ? Number( pair[ index ] ) : Number.NaN;

	return Number.isFinite( value ) ? value : fallback;
};

export default function MarkerEditor( {
	center,
	markers,
	onChange,
	selectedMarkerId,
	onSelectMarker,
} ) {
	const [ search, setSearch ] = useState( '' );
	const safeMarkers = useMemo(
		() => ( Array.isArray( markers ) ? markers : [] ),
		[ markers ]
	);

	useEffect( () => {
		if (
			selectedMarkerId &&
			! safeMarkers.some( ( marker ) => marker.id === selectedMarkerId )
		) {
			onSelectMarker( safeMarkers[ 0 ]?.id ?? '' );
		}
	}, [ onSelectMarker, safeMarkers, selectedMarkerId ] );

	const markerSearch = useMemo( () => {
		const query = search.trim().toLocaleLowerCase();

		if ( ! query ) {
			return {
				total: safeMarkers.length,
				visible: safeMarkers
					.slice( 0, MAX_VISIBLE_MARKERS )
					.map( ( marker, index ) => ( { marker, index } ) ),
			};
		}

		const visible = [];
		let total = 0;

		safeMarkers.forEach( ( marker, index ) => {
			const matches = [
				marker.title,
				marker.hint,
				marker.category,
				marker.address,
			]
				.filter( Boolean )
				.some( ( value ) =>
					String( value ).toLocaleLowerCase().includes( query )
				);

			if ( ! matches ) {
				return;
			}

			total += 1;
			if ( visible.length < MAX_VISIBLE_MARKERS ) {
				visible.push( { marker, index } );
			}
		} );

		return { total, visible };
	}, [ safeMarkers, search ] );

	const selectedMarker = safeMarkers.find(
		( marker ) => marker.id === selectedMarkerId
	);

	const addMarker = ( coordinates = center ) => {
		const marker = createMarker( coordinates );
		onChange( [ ...safeMarkers, marker ] );
		onSelectMarker( marker.id );
	};

	const updateSelectedMarker = ( updater ) => {
		if ( ! selectedMarker ) {
			return;
		}

		onChange( updateMarkerById( safeMarkers, selectedMarker.id, updater ) );
	};

	const updateSelectedCoordinates = ( nextCoordinates ) => {
		updateSelectedMarker( ( marker ) => ( {
			...marker,
			coordinates: normalizeCoordinates(
				{ ...marker.coordinates, ...nextCoordinates },
				center
			),
		} ) );
	};

	const updateSelectedIcon = ( patch ) => {
		updateSelectedMarker( ( marker ) => ( {
			...marker,
			icon: {
				type: 'default',
				name: 'fallback',
				markerSize: 'normal',
				color: '#ff4433',
				url: '',
				size: [ 40, 40 ],
				offset: [ -20, -40 ],
				...marker.icon,
				...patch,
			},
		} ) );
	};

	const updateSelectedLink = ( patch ) => {
		updateSelectedMarker( ( marker ) => ( {
			...marker,
			link: {
				url: '',
				label: '',
				newTab: false,
				...marker.link,
				...patch,
			},
		} ) );
	};

	const duplicateSelectedMarker = () => {
		if ( ! selectedMarker ) {
			return;
		}

		const duplicate = createMarker( selectedMarker.coordinates, {
			...selectedMarker,
			id: createMarkerId(),
			title: selectedMarker.title
				? sprintf(
						/* translators: %s: marker title. */
						__( '%s (copy)', 'yamap-block-gutenberg' ),
						selectedMarker.title
				  )
				: __( 'Marker copy', 'yamap-block-gutenberg' ),
		} );

		onChange( [ ...safeMarkers, duplicate ] );
		onSelectMarker( duplicate.id );
	};

	const removeSelectedMarker = () => {
		if ( ! selectedMarker ) {
			return;
		}

		const markerIndex = safeMarkers.findIndex(
			( marker ) => marker.id === selectedMarker.id
		);
		const remainingMarkers = safeMarkers.filter(
			( marker ) => marker.id !== selectedMarker.id
		);
		const nextMarker =
			remainingMarkers[ markerIndex ] ??
			remainingMarkers[ markerIndex - 1 ];

		onChange( remainingMarkers );
		onSelectMarker( nextMarker?.id ?? '' );
	};

	const coordinates = normalizeCoordinates(
		selectedMarker?.coordinates,
		center
	);
	const icon = selectedMarker?.icon ?? {};
	const link = selectedMarker?.link ?? {};
	const iconSize = [
		getPairValue( icon.size, 0, 40 ),
		getPairValue( icon.size, 1, 40 ),
	];
	const iconOffset = [
		getPairValue( icon.offset, 0, -20 ),
		getPairValue( icon.offset, 1, -40 ),
	];

	return (
		<div className="guyamap-marker-editor">
			<div className="guyamap-marker-editor__actions">
				<Button onClick={ () => addMarker() } variant="primary">
					{ __( 'Add at map center', 'yamap-block-gutenberg' ) }
				</Button>
			</div>

			{ safeMarkers.length > 0 && (
				<TextControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label={ __( 'Search markers', 'yamap-block-gutenberg' ) }
					onChange={ setSearch }
					type="search"
					value={ search }
				/>
			) }

			<div
				aria-label={ __( 'Map markers', 'yamap-block-gutenberg' ) }
				className="guyamap-marker-editor__list"
				role="list"
			>
				{ markerSearch.visible.map( ( { marker, index } ) => {
					const markerCoordinates = normalizeCoordinates(
						marker.coordinates,
						center
					);
					const markerNumber = index + 1;

					return (
						<div key={ marker.id } role="listitem">
							<Button
								aria-pressed={ marker.id === selectedMarkerId }
								className="guyamap-marker-editor__list-button"
								onClick={ () => onSelectMarker( marker.id ) }
								variant={
									marker.id === selectedMarkerId
										? 'primary'
										: 'tertiary'
								}
							>
								<span>
									{ marker.title ||
										sprintf(
											/* translators: %d: marker number. */
											__(
												'Marker %d',
												'yamap-block-gutenberg'
											),
											markerNumber
										) }
								</span>
								<small>
									{ markerCoordinates.latitude.toFixed( 5 ) },{ ' ' }
									{ markerCoordinates.longitude.toFixed( 5 ) }
								</small>
							</Button>
						</div>
					);
				} ) }
			</div>

			{ markerSearch.total > MAX_VISIBLE_MARKERS && (
				<Notice isDismissible={ false } status="info">
					{ sprintf(
						/* translators: 1: visible marker count, 2: matching marker count. */
						__(
							'Showing the first %1$d of %2$d matching markers.',
							'yamap-block-gutenberg'
						),
						MAX_VISIBLE_MARKERS,
						markerSearch.total
					) }
				</Notice>
			) }

			{ safeMarkers.length === 0 && (
				<Notice isDismissible={ false } status="info">
					{ __(
						'Add a marker at the current map center, then edit its coordinates in this panel.',
						'yamap-block-gutenberg'
					) }
				</Notice>
			) }

			{ selectedMarker && (
				<div className="guyamap-marker-editor__fields">
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label={ __( 'Title', 'yamap-block-gutenberg' ) }
						onChange={ ( title ) =>
							updateSelectedMarker( { title } )
						}
						value={ selectedMarker.title ?? '' }
					/>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label={ __( 'Hint', 'yamap-block-gutenberg' ) }
						onChange={ ( hint ) =>
							updateSelectedMarker( { hint } )
						}
						value={ selectedMarker.hint ?? '' }
					/>
					<TextareaControl
						__nextHasNoMarginBottom
						label={ __( 'Description', 'yamap-block-gutenberg' ) }
						onChange={ ( description ) =>
							updateSelectedMarker( { description } )
						}
						rows={ 4 }
						value={ selectedMarker.description ?? '' }
					/>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label={ __( 'Address', 'yamap-block-gutenberg' ) }
						onChange={ ( address ) =>
							updateSelectedMarker( { address } )
						}
						value={ selectedMarker.address ?? '' }
					/>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label={ __( 'Category', 'yamap-block-gutenberg' ) }
						onChange={ ( category ) =>
							updateSelectedMarker( { category } )
						}
						value={ selectedMarker.category ?? '' }
					/>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label={ __( 'Link URL', 'yamap-block-gutenberg' ) }
						onChange={ ( url ) => updateSelectedLink( { url } ) }
						type="url"
						value={ link.url ?? '' }
					/>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label={ __( 'Link label', 'yamap-block-gutenberg' ) }
						onChange={ ( label ) =>
							updateSelectedLink( { label } )
						}
						value={ link.label ?? '' }
					/>
					<ToggleControl
						__nextHasNoMarginBottom
						checked={ Boolean( link.newTab ) }
						label={ __(
							'Open link in a new tab',
							'yamap-block-gutenberg'
						) }
						onChange={ ( newTab ) =>
							updateSelectedLink( { newTab } )
						}
					/>

					<div className="guyamap-control-grid guyamap-control-grid--two">
						<NumericControl
							label={ __( 'Latitude', 'yamap-block-gutenberg' ) }
							max={ 90 }
							min={ -90 }
							onChange={ ( latitude ) =>
								updateSelectedCoordinates( { latitude } )
							}
							step="0.000001"
							value={ coordinates.latitude }
						/>
						<NumericControl
							label={ __( 'Longitude', 'yamap-block-gutenberg' ) }
							max={ 180 }
							min={ -180 }
							onChange={ ( longitude ) =>
								updateSelectedCoordinates( { longitude } )
							}
							step="0.000001"
							value={ coordinates.longitude }
						/>
					</div>

					<ToggleControl
						__nextHasNoMarginBottom
						checked={ Boolean( selectedMarker.draggable ) }
						help={ __(
							'This affects the frontend map; the editor preview remains locked.',
							'yamap-block-gutenberg'
						) }
						label={ __(
							'Draggable marker',
							'yamap-block-gutenberg'
						) }
						onChange={ ( draggable ) =>
							updateSelectedMarker( { draggable } )
						}
					/>
					<ToggleControl
						__nextHasNoMarginBottom
						checked={ Boolean( selectedMarker.mapFollowsOnDrag ) }
						label={ __(
							'Map follows while dragging',
							'yamap-block-gutenberg'
						) }
						onChange={ ( mapFollowsOnDrag ) =>
							updateSelectedMarker( { mapFollowsOnDrag } )
						}
					/>
					<ToggleControl
						__nextHasNoMarginBottom
						checked={ selectedMarker.hideOutsideViewport !== false }
						label={ __(
							'Hide outside viewport',
							'yamap-block-gutenberg'
						) }
						onChange={ ( hideOutsideViewport ) =>
							updateSelectedMarker( { hideOutsideViewport } )
						}
					/>
					<NumericControl
						label={ __( 'Z-index', 'yamap-block-gutenberg' ) }
						onChange={ ( zIndex ) =>
							updateSelectedMarker( { zIndex } )
						}
						step={ 1 }
						value={ selectedMarker.zIndex ?? 0 }
					/>

					<SelectControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label={ __( 'Icon type', 'yamap-block-gutenberg' ) }
						onChange={ ( type ) => updateSelectedIcon( { type } ) }
						options={ [
							{
								label: __(
									'Default marker',
									'yamap-block-gutenberg'
								),
								value: 'default',
							},
							{
								label: __(
									'Custom image',
									'yamap-block-gutenberg'
								),
								value: 'image',
							},
						] }
						value={ icon.type ?? 'default' }
					/>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label={ __( 'Icon name', 'yamap-block-gutenberg' ) }
						onChange={ ( name ) => updateSelectedIcon( { name } ) }
						value={ icon.name ?? 'fallback' }
					/>
					<SelectControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label={ __( 'Marker size', 'yamap-block-gutenberg' ) }
						onChange={ ( markerSize ) =>
							updateSelectedIcon( { markerSize } )
						}
						options={ [
							{
								label: __( 'Normal', 'yamap-block-gutenberg' ),
								value: 'normal',
							},
							{
								label: __( 'Small', 'yamap-block-gutenberg' ),
								value: 'small',
							},
							{
								label: __( 'Micro', 'yamap-block-gutenberg' ),
								value: 'micro',
							},
						] }
						value={ icon.markerSize ?? 'normal' }
					/>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label={ __( 'Marker color', 'yamap-block-gutenberg' ) }
						onChange={ ( color ) =>
							updateSelectedIcon( { color } )
						}
						value={ icon.color ?? '#ff4433' }
					/>
					{ icon.type === 'image' && (
						<TextControl
							__next40pxDefaultSize
							__nextHasNoMarginBottom
							label={ __( 'Image URL', 'yamap-block-gutenberg' ) }
							onChange={ ( url ) =>
								updateSelectedIcon( { url } )
							}
							type="url"
							value={ icon.url ?? '' }
						/>
					) }

					<div className="guyamap-control-grid guyamap-control-grid--two">
						<NumericControl
							label={ __(
								'Icon width',
								'yamap-block-gutenberg'
							) }
							min={ 1 }
							onChange={ ( width ) =>
								updateSelectedIcon( {
									size: [ width, iconSize[ 1 ] ],
								} )
							}
							step={ 1 }
							value={ iconSize[ 0 ] }
						/>
						<NumericControl
							label={ __(
								'Icon height',
								'yamap-block-gutenberg'
							) }
							min={ 1 }
							onChange={ ( height ) =>
								updateSelectedIcon( {
									size: [ iconSize[ 0 ], height ],
								} )
							}
							step={ 1 }
							value={ iconSize[ 1 ] }
						/>
						<NumericControl
							label={ __(
								'Horizontal offset',
								'yamap-block-gutenberg'
							) }
							onChange={ ( horizontalOffset ) =>
								updateSelectedIcon( {
									offset: [
										horizontalOffset,
										iconOffset[ 1 ],
									],
								} )
							}
							step={ 1 }
							value={ iconOffset[ 0 ] }
						/>
						<NumericControl
							label={ __(
								'Vertical offset',
								'yamap-block-gutenberg'
							) }
							onChange={ ( verticalOffset ) =>
								updateSelectedIcon( {
									offset: [ iconOffset[ 0 ], verticalOffset ],
								} )
							}
							step={ 1 }
							value={ iconOffset[ 1 ] }
						/>
					</div>

					<div className="guyamap-marker-editor__actions">
						<Button
							onClick={ duplicateSelectedMarker }
							variant="secondary"
						>
							{ __(
								'Duplicate marker',
								'yamap-block-gutenberg'
							) }
						</Button>
						<Button
							isDestructive
							onClick={ removeSelectedMarker }
							variant="secondary"
						>
							{ __( 'Remove marker', 'yamap-block-gutenberg' ) }
						</Button>
					</div>
				</div>
			) }
		</div>
	);
}
