import { Notice, TextareaControl } from '@wordpress/components';
import { useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

const serialize = ( value ) => JSON.stringify( value, null, 2 );

const isExpectedType = ( value, expectedType ) => {
	if ( expectedType === 'array' ) {
		return Array.isArray( value );
	}

	return (
		value !== null && typeof value === 'object' && ! Array.isArray( value )
	);
};

export default function JsonControl( {
	label,
	value,
	onChange,
	expectedType = 'object',
	help,
} ) {
	const [ draft, setDraft ] = useState( () => serialize( value ) );
	const [ error, setError ] = useState( '' );
	const hasFocus = useRef( false );

	useEffect( () => {
		if ( ! hasFocus.current ) {
			setDraft( serialize( value ) );
			setError( '' );
		}
	}, [ value ] );

	const validate = ( nextDraft, commit = false ) => {
		try {
			const parsed = JSON.parse( nextDraft );

			if ( ! isExpectedType( parsed, expectedType ) ) {
				setError(
					expectedType === 'array'
						? __(
								'The value must be a JSON array.',
								'yamap-block-gutenberg'
						  )
						: __(
								'The value must be a JSON object.',
								'yamap-block-gutenberg'
						  )
				);
				return;
			}

			setError( '' );

			if ( commit ) {
				onChange( parsed );
			}
		} catch {
			setError(
				__(
					'Enter valid JSON before applying this value.',
					'yamap-block-gutenberg'
				)
			);
		}
	};

	return (
		<div className="guyamap-json-control">
			<TextareaControl
				__nextHasNoMarginBottom
				help={ help }
				label={ label }
				onBlur={ () => {
					hasFocus.current = false;
					validate( draft, true );
				} }
				onChange={ ( nextDraft ) => {
					setDraft( nextDraft );
					validate( nextDraft );
				} }
				onFocus={ () => {
					hasFocus.current = true;
				} }
				rows={ 8 }
				value={ draft }
			/>
			{ error && (
				<Notice isDismissible={ false } status="error">
					{ error }
				</Notice>
			) }
		</div>
	);
}
