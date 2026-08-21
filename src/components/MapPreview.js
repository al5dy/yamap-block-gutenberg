import { Button, Notice, Placeholder, Spinner } from '@wordpress/components';
import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { destroyMap, mountMap, updateMap } from '../runtime/map';

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
		destroyMap( map );
	} catch {
		// A partially initialized third-party map must not break the editor.
	}
};

export default function MapPreview( { attributes } ) {
	const containerRef = useRef( null );
	const instanceRef = useRef( null );
	const configRef = useRef( null );
	const generationRef = useRef( 0 );
	const [ status, setStatus ] = useState( 'idle' );
	const [ errorMessage, setErrorMessage ] = useState( '' );
	const [ retryRevision, setRetryRevision ] = useState( 0 );
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
	const styleUrl = editorSettings.styleUrl ?? '';
	const i18n = editorSettings.i18n ?? EMPTY_I18N;

	const config = useMemo(
		() => ( {
			...attributes,
			apiKey,
			language,
			baseUrl,
			iconBaseUrl,
			styleUrl,
			i18n,
		} ),
		[ attributes, apiKey, baseUrl, i18n, iconBaseUrl, language, styleUrl ]
	);
	configRef.current = config;

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

		setStatus( 'loading' );
		setErrorMessage( '' );
		const instance = mountMap( container, configRef.current, {
			editor: true,
			interactive: false,
		} );
		instanceRef.current = instance;

		if ( ! instance ) {
			setStatus( 'error' );
			setErrorMessage(
				__(
					'The map preview could not be loaded.',
					'yamap-block-gutenberg'
				)
			);
			return undefined;
		}

		instance.ready.then( () => {
			if ( generationRef.current !== generation ) {
				return;
			}

			if ( container.dataset.state === 'error' || ! instance.map ) {
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
		} );

		return () => {
			generationRef.current += 1;
			destroySafely( instance );
			if ( instanceRef.current === instance ) {
				instanceRef.current = null;
			}
		};
	}, [ apiKey, language, retryRevision ] );

	useEffect( () => {
		const instance = instanceRef.current;
		if ( ! instance || instance.destroyed ) {
			return undefined;
		}

		let active = true;
		updateMap( instance, config, {
			editor: true,
			interactive: false,
		} ).catch( () => {
			if ( ! active || instanceRef.current !== instance ) {
				return;
			}

			setStatus( 'error' );
			setErrorMessage(
				__(
					'The map preview could not be loaded.',
					'yamap-block-gutenberg'
				)
			);
		} );

		return () => {
			active = false;
		};
	}, [ config ] );

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
			<guyamap-map-view
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
					<p>{ errorMessage }</p>
					<Button
						onClick={ () =>
							setRetryRevision( ( revision ) => revision + 1 )
						}
						variant="secondary"
					>
						{ __( 'Retry map preview', 'yamap-block-gutenberg' ) }
					</Button>
				</Notice>
			) }
		</div>
	);
}
