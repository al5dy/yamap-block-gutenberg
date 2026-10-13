import { Button, Notice, Placeholder } from '@wordpress/components';
import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { resetYandexApi } from '../runtime/api-loader';
import { destroyMap, mountMap, updateMap } from '../runtime/map';
import Preloader, { normalizePreloaderPresentation } from './Preloader';

const EMPTY_I18N = Object.freeze( {} );
// One retry recovers every failed preview: the usual cause is shared (the key).
const RETRY_EVENT = 'guyamap:retry-preview';

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
	const [ errorCode, setErrorCode ] = useState( '' );
	const [ retryRevision, setRetryRevision ] = useState( 0 );
	const statusRef = useRef( status );
	statusRef.current = status;
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
	const preloader = normalizePreloaderPresentation(
		attributes.loading?.preloader,
		i18n.loading ?? __( 'Loading map…', 'yamap-block-gutenberg' )
	);

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
		setErrorCode( '' );
		const instance = mountMap( container, configRef.current, {
			editor: true,
			interactive: false,
		} );
		instanceRef.current = instance;

		if ( ! instance ) {
			setStatus( 'error' );
			setErrorCode( 'render' );
			return undefined;
		}

		instance.ready.then( () => {
			if ( generationRef.current !== generation ) {
				return;
			}

			if ( container.dataset.state === 'error' || ! instance.map ) {
				setStatus( 'error' );
				setErrorCode( instance.errorCode || 'render' );
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
		const handleRetry = () => {
			if ( statusRef.current === 'error' ) {
				setRetryRevision( ( revision ) => revision + 1 );
			}
		};
		window.addEventListener( RETRY_EVENT, handleRetry );

		return () => window.removeEventListener( RETRY_EVENT, handleRetry );
	}, [] );

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
			setErrorCode( 'render' );
		} );

		return () => {
			active = false;
		};
	}, [ config ] );

	const errorDetails =
		i18n.errorDetails && typeof i18n.errorDetails === 'object'
			? i18n.errorDetails
			: EMPTY_I18N;
	const errorReason =
		typeof errorDetails[ errorCode ] === 'string'
			? errorDetails[ errorCode ]
			: '';

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
				aria-label={
					attributes.ariaLabel?.trim() ||
					__( 'Interactive map', 'yamap-block-gutenberg' )
				}
				className="guyamap-editor-preview__canvas"
				ref={ containerRef }
				role="region"
			/>
			{ status === 'loading' && preloader.enabled && (
				<Preloader
					className="guyamap-editor-preview__status"
					label={ __(
						'Loading map preview…',
						'yamap-block-gutenberg'
					) }
					preloader={ preloader }
				/>
			) }
			{ status === 'error' && (
				<div className="guyamap-editor-preview__error">
					<Notice isDismissible={ false } status="error">
						<p>
							<strong>
								{ __(
									'The map preview could not be loaded.',
									'yamap-block-gutenberg'
								) }
							</strong>
						</p>
						{ errorReason && <p>{ errorReason }</p> }
						<div className="guyamap-editor-preview__error-actions">
							<Button
								onClick={ () => {
									// Forget a remembered refusal so the retry
									// reaches Yandex again.
									resetYandexApi(
										containerRef.current?.ownerDocument
											?.defaultView
									);
									window.dispatchEvent(
										new window.CustomEvent( RETRY_EVENT )
									);
								} }
								variant="secondary"
							>
								{ __(
									'Retry map preview',
									'yamap-block-gutenberg'
								) }
							</Button>
							{ settingsUrl && (
								<Button href={ settingsUrl } variant="link">
									{ __(
										'Open map settings',
										'yamap-block-gutenberg'
									) }
								</Button>
							) }
						</div>
					</Notice>
				</div>
			) }
		</div>
	);
}
