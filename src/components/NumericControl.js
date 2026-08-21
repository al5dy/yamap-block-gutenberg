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
		const number = Number( nextDraft );

		if ( ! Number.isFinite( number ) ) {
			return false;
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
			return false;
		}

		onChange( nextValue );
		return true;
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

				if ( ! commit( draft, true ) ) {
					setDraft( String( value ?? '' ) );
				}
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
