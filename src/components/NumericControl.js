import { TextControl } from '@wordpress/components';
import { useEffect, useRef, useState } from '@wordpress/element';

const clamp = ( value, minimum, maximum ) => {
	let result = value;

	if ( Number.isFinite( minimum ) ) {
		result = Math.max( minimum, result );
	}

	if ( Number.isFinite( maximum ) ) {
		result = Math.min( maximum, result );
	}

	return result;
};

/**
 * Parses a draft without treating an empty field as zero.
 *
 * @param {string} draft Current input text.
 * @return {number} Finite number, or NaN when the draft is not a number yet.
 */
const parseDraft = ( draft ) =>
	typeof draft === 'string' && draft.trim() === ''
		? Number.NaN
		: Number( draft );

export default function NumericControl( {
	label,
	value,
	onChange,
	min,
	max,
	step = 'any',
	help,
	className,
} ) {
	const [ draft, setDraft ] = useState( String( value ?? '' ) );
	const hasFocus = useRef( false );

	useEffect( () => {
		if ( ! hasFocus.current ) {
			setDraft( String( value ?? '' ) );
		}
	}, [ value ] );

	const commit = ( nextDraft, shouldClamp = false ) => {
		const number = parseDraft( nextDraft );

		if ( ! Number.isFinite( number ) ) {
			return null;
		}

		const minimum = Number( min );
		const maximum = Number( max );
		const nextValue = shouldClamp
			? clamp( number, minimum, maximum )
			: number;

		if (
			! shouldClamp &&
			( ( Number.isFinite( minimum ) && number < minimum ) ||
				( Number.isFinite( maximum ) && number > maximum ) )
		) {
			return null;
		}

		if ( nextValue !== value ) {
			onChange( nextValue );
		}
		return nextValue;
	};

	return (
		<TextControl
			__next40pxDefaultSize
			__nextHasNoMarginBottom
			className={ className }
			help={ help }
			label={ label }
			max={ max }
			min={ min }
			onBlur={ () => {
				hasFocus.current = false;
				const committed = commit( draft, true );

				// Show what is stored: the clamped number, or the previous
				// value when the field was left empty or invalid.
				setDraft( String( committed ?? value ?? '' ) );
			} }
			onChange={ ( nextDraft ) => {
				setDraft( nextDraft );
				commit( nextDraft );
			} }
			onFocus={ () => {
				hasFocus.current = true;
			} }
			step={ step }
			type="number"
			value={ draft }
		/>
	);
}
