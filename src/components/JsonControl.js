import { Notice, TextareaControl } from '@wordpress/components';
import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
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

/**
 * Parses a draft and lists everything that keeps it from being applied.
 *
 * @param {string}   draft        Text of the field.
 * @param {string}   expectedType `array` or `object`.
 * @param {Function} validate     Returns messages for a parsed value.
 * @return {{parsed: *, errors: string[]}} Parsed value and its problems.
 */
const inspect = ( draft, expectedType, validate ) => {
	let parsed;
	try {
		parsed = JSON.parse( draft );
	} catch {
		return {
			errors: [
				__(
					'Enter valid JSON before applying this value.',
					'yamap-block-gutenberg'
				),
			],
		};
	}

	if ( ! isExpectedType( parsed, expectedType ) ) {
		return {
			errors: [
				expectedType === 'array'
					? __(
							'The value must be a JSON array.',
							'yamap-block-gutenberg'
					  )
					: __(
							'The value must be a JSON object.',
							'yamap-block-gutenberg'
					  ),
			],
		};
	}

	return { parsed, errors: validate?.( parsed ) ?? [] };
};

/**
 * JSON field for expert settings.
 *
 * A draft that parses and passes validation is applied immediately, so the
 * preview follows the text. Anything else stays in the field with its
 * problems listed and never reaches the block attributes.
 *
 * @param {Object}   props              Component props.
 * @param {string}   props.label        Field label.
 * @param {*}        props.value        Stored value.
 * @param {Function} props.onChange     Receives a valid parsed value.
 * @param {string}   props.expectedType `array` or `object`.
 * @param {string}   props.help         Help text.
 * @param {Function} props.validate     Returns messages for a parsed value.
 * @param {string}   props.warning      Notice shown for an applied value.
 */
export default function JsonControl( {
	label,
	value,
	onChange,
	expectedType = 'object',
	help,
	validate,
	warning,
} ) {
	const [ draft, setDraft ] = useState( () => serialize( value ) );
	const hasFocus = useRef( false );
	const { errors } = useMemo(
		() => inspect( draft, expectedType, validate ),
		[ draft, expectedType, validate ]
	);

	useEffect( () => {
		if ( ! hasFocus.current ) {
			setDraft( serialize( value ) );
		}
	}, [ value ] );

	const apply = ( nextDraft ) => {
		const next = inspect( nextDraft, expectedType, validate );
		if (
			! next.errors.length &&
			JSON.stringify( next.parsed ) !== JSON.stringify( value )
		) {
			onChange( next.parsed );
		}
	};

	return (
		<div className="guyamap-json-control">
			<TextareaControl
				__nextHasNoMarginBottom
				aria-invalid={ errors.length > 0 || undefined }
				help={ help }
				label={ label }
				onBlur={ () => {
					hasFocus.current = false;
					apply( draft );
				} }
				onChange={ ( nextDraft ) => {
					setDraft( nextDraft );
					apply( nextDraft );
				} }
				onFocus={ () => {
					hasFocus.current = true;
				} }
				rows={ 8 }
				value={ draft }
			/>
			{ errors.length > 0 && (
				<Notice isDismissible={ false } status="error">
					{ errors.length === 1 ? (
						errors[ 0 ]
					) : (
						<ul className="guyamap-json-control__problems">
							{ errors.map( ( message ) => (
								<li key={ message }>{ message }</li>
							) ) }
						</ul>
					) }
				</Notice>
			) }
			{ ! errors.length && warning && (
				<Notice isDismissible={ false } status="warning">
					{ warning }
				</Notice>
			) }
		</div>
	);
}
