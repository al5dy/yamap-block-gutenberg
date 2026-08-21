const COLOR_PATTERN = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const TYPES = new Set( [ 'spinner', 'dots', 'pulse' ] );

const clampNumber = ( value, fallback, minimum, maximum ) => {
	const number = Number( value );

	return Number.isFinite( number )
		? Math.min( maximum, Math.max( minimum, Math.round( number ) ) )
		: fallback;
};

const safeColor = ( value, fallback ) =>
	typeof value === 'string' && COLOR_PATTERN.test( value.trim() )
		? value.trim().toLowerCase()
		: fallback;

export const normalizePreloaderPresentation = ( value = {}, label = '' ) => ( {
	enabled: value.enabled === true,
	type: TYPES.has( value.type ) ? value.type : 'spinner',
	color: safeColor( value.color, '#3858e9' ),
	backgroundColor: safeColor( value.backgroundColor, '#eef1f5' ),
	size: clampNumber( value.size, 48, 24, 96 ),
	transitionDuration: clampNumber( value.transitionDuration, 300, 0, 2000 ),
	label:
		typeof value.label === 'string' && value.label.trim()
			? value.label.trim().slice( 0, 160 )
			: label,
} );

export const getPreloaderStyle = ( preloader ) => ( {
	'--guyamap-preloader-background': preloader.backgroundColor,
	'--guyamap-preloader-color': preloader.color,
	'--guyamap-preloader-size': `${ preloader.size }px`,
	'--guyamap-transition-duration': `${ preloader.transitionDuration }ms`,
} );

export default function Preloader( {
	className = '',
	label = '',
	preloader: rawPreloader,
} ) {
	const preloader = normalizePreloaderPresentation( rawPreloader, label );

	return (
		<div
			aria-live="polite"
			className={ [
				'guyamap-preloader',
				`guyamap-preloader--${ preloader.type }`,
				className,
			]
				.filter( Boolean )
				.join( ' ' ) }
			role="status"
			style={ getPreloaderStyle( preloader ) }
		>
			<span aria-hidden="true" className="guyamap-preloader__visual">
				<span />
				<span />
				<span />
			</span>
			<span className="guyamap-preloader__label">
				{ preloader.label || label }
			</span>
		</div>
	);
}
