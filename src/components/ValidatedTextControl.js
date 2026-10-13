import { TextControl } from '@wordpress/components';
import { useEffect, useRef, useState } from '@wordpress/element';

/**
 * Text field that only stores values the server will accept.
 *
 * While typing, intermediate text such as "30" on the way to "300px" stays in
 * a local draft. A valid draft is committed immediately for live preview; an
 * invalid one shows an inline error and is reverted when the field is left.
 *
 * @param {Object}   props             Component props.
 * @param {string}   props.label       Field label.
 * @param {string}   props.value       Stored value.
 * @param {Function} props.onChange    Receives the normalized valid value.
 * @param {Function} props.validate    Returns the normalized value, or null when invalid.
 * @param {string}   props.help        Help text shown while the draft is valid.
 * @param {string}   props.invalidHelp Message shown while the draft is invalid.
 * @param {string}   props.type        Input type.
 * @param {string}   props.className   Additional class name.
 * @param {string}   props.placeholder Placeholder text.
 */
export default function ValidatedTextControl( {
	label,
	value,
	onChange,
	validate,
	help,
	invalidHelp,
	type = 'text',
	className,
	placeholder,
} ) {
	const [ draft, setDraft ] = useState( String( value ?? '' ) );
	const hasFocus = useRef( false );
	const normalizedDraft = validate( draft );
	const isInvalid = normalizedDraft === null;

	useEffect( () => {
		if ( ! hasFocus.current ) {
			setDraft( String( value ?? '' ) );
		}
	}, [ value ] );

	return (
		<TextControl
			__next40pxDefaultSize
			__nextHasNoMarginBottom
			aria-invalid={ isInvalid || undefined }
			className={ [
				className,
				isInvalid ? 'guyamap-control--invalid' : '',
			]
				.filter( Boolean )
				.join( ' ' ) }
			help={ isInvalid ? invalidHelp : help }
			label={ label }
			onBlur={ () => {
				hasFocus.current = false;
				setDraft( String( isInvalid ? value ?? '' : normalizedDraft ) );
			} }
			onChange={ ( nextDraft ) => {
				setDraft( nextDraft );
				const nextValue = validate( nextDraft );
				if ( nextValue !== null && nextValue !== value ) {
					onChange( nextValue );
				}
			} }
			onFocus={ () => {
				hasFocus.current = true;
			} }
			placeholder={ placeholder }
			type={ type }
			value={ draft }
		/>
	);
}
