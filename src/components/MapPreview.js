import { Button, Notice, Placeholder, Spinner } from '@wordpress/components';
import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { destroyMap, mountMap } from '../runtime/map';

const REMOUNT_DELAY = 180;
const EMPTY_I18N = Object.freeze( {} );

const getEditorSettings = () => {
	if ( typeof window === 'undefined' ) {
		return {};
	}

	return window.guyamapEditorSettings ?? {};
};

const destroySafely = ( map ) => {
	if ( ! map ) {
		return;
	}

	try {
		// Pass the DOM key to remain safe across the editor iframe's realm.
		destroyMap( map.container ?? map );
	} catch {
		// A partially initialized third-party map must not break the editor.
	}
};

export default function MapPreview( {
	attributes,
	interactive,
	onMapClick,
	onMarkerDragEnd,
	isPickingMarker = false,
} ) {
	const containerRef = useRef( null );
	const instanceRef = useRef( null );
	const callbacksRef = useRef( { onMapClick, onMarkerDragEnd } );
	const generationRef = useRef( 0 );
	const [ status, setStatus ] = useState( 'idle' );
	const [ errorMessage, setErrorMessage ] = useState( '' );
	const editorSettings = getEditorSettings();
	const apiKey = editorSettings.apiKey ?? '';
	const language =
		editorSettings.language ??
		editorSettings.lang ??
		editorSettings.locale ??
		'en_US';
	const settingsUrl = editorSettings.settingsUrl ?? '';
	const baseUrl = editorSettings.baseUrl ?? '';
	const iconBaseUrl = editorSettings.iconBaseUrl ?? '';
	const i18n = editorSettings.i18n ?? EMPTY_I18N;

	callbacksRef.current = { onMapClick, onMarkerDragEnd };

	const config = useMemo(
		() => ( {
			...attributes,
			apiKey,
			language,
			baseUrl,
			iconBaseUrl,
			i18n,
		} ),
		[ attributes, apiKey, baseUrl, i18n, iconBaseUrl, language ]
	);

	useEffect( () => {
		const container = containerRef.current;

		return () => {
			generationRef.current += 1;
			destroySafely( instanceRef.current ?? container );
			instanceRef.current = null;
		};
	}, [] );

	useEffect( () => {
		const container = containerRef.current;
		const generation = generationRef.current + 1;
		generationRef.current = generation;

		if ( ! apiKey || ! container ) {
			destroySafely( instanceRef.current );
			instanceRef.current = null;
			setStatus( ! apiKey ? 'missing-key' : 'idle' );
			return undefined;
		}
		const ownerWindow = container.ownerDocument.defaultView;
		if ( ! ownerWindow ) {
			setStatus( 'error' );
			setErrorMessage(
				__(
					'The map preview could not be loaded.',
					'yamap-block-gutenberg'
				)
			);
			return undefined;
		}

		const timeoutId = ownerWindow.setTimeout( async () => {
			setStatus( 'loading' );
			setErrorMessage( '' );

			const previousInstance = instanceRef.current;
			instanceRef.current = null;
			destroySafely( previousInstance ?? container );

			let instance;

			try {
				instance = mountMap( container, config, {
					editor: true,
					interactive,
					onMapClick: ( coordinates ) =>
						callbacksRef.current.onMapClick?.( coordinates ),
					onMarkerDragEnd: ( markerId, coordinates ) =>
						callbacksRef.current.onMarkerDragEnd?.(
							markerId,
							coordinates
						),
				} );
				// mountMap returns its controller synchronously. Keep it reachable
				// while the SDK is loading so a rerender or unmount can destroy it.
				instanceRef.current = instance ?? container;

				await instance?.ready;

				if ( generationRef.current !== generation ) {
					destroySafely( instance ?? container );
					return;
				}

				if ( container.dataset.state === 'error' || ! instance?.map ) {
					setStatus( 'error' );
					setErrorMessage(
						__(
							'The map preview could not be loaded.',
							'yamap-block-gutenberg'
						)
					);
					return;
				}

				setStatus( 'ready' );
			} catch ( error ) {
				if ( generationRef.current !== generation ) {
					destroySafely( instance );
					return;
				}

				setStatus( 'error' );
				setErrorMessage(
					error instanceof Error && error.message
						? error.message
						: __(
								'The map preview could not be loaded.',
								'yamap-block-gutenberg'
						  )
				);
			}
		}, REMOUNT_DELAY );

		return () => {
			ownerWindow.clearTimeout( timeoutId );
		};
	}, [ apiKey, config, interactive ] );

	if ( ! apiKey ) {
		return (
			<Placeholder
				className="guyamap-editor-preview__placeholder"
				icon="location-alt"
				instructions={ __(
					'Add a Yandex Maps API key to display the interactive preview.',
					'yamap-block-gutenberg'
				) }
				label={ __( 'Yandex Map', 'yamap-block-gutenberg' ) }
			>
				{ settingsUrl && (
					<Button href={ settingsUrl } variant="primary">
						{ __( 'Open map settings', 'yamap-block-gutenberg' ) }
					</Button>
				) }
			</Placeholder>
		);
	}

	return (
		<div className="guyamap-editor-preview">
			<div
				aria-label={ attributes.ariaLabel }
				className="guyamap-editor-preview__canvas"
				ref={ containerRef }
				role="region"
			/>
			{ status === 'loading' && (
				<div
					aria-live="polite"
					className="guyamap-editor-preview__status"
				>
					<Spinner />
					<span>
						{ __(
							'Loading map preview…',
							'yamap-block-gutenberg'
						) }
					</span>
				</div>
			) }
			{ status === 'error' && (
				<Notice isDismissible={ false } status="error">
					{ errorMessage }
				</Notice>
			) }
			{ isPickingMarker && status === 'ready' && (
				<div
					aria-live="polite"
					className="guyamap-editor-preview__pick-hint"
				>
					{ __(
						'Click the map to place a marker.',
						'yamap-block-gutenberg'
					) }
				</div>
			) }
		</div>
	);
}
