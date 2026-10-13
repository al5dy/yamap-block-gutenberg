import cases from '../fixtures/customization.json';
import {
	MAX_CUSTOMIZATION_RULES,
	MAX_CUSTOMIZATION_STYLERS,
	MAX_CUSTOMIZATION_TAGS,
	MAX_CUSTOMIZATION_VALUES,
	estimateRasterStyleLength,
	normalizeCustomization,
	validateCustomization,
} from '../../src/runtime/customization';
import { normalizeConfig } from '../../src/runtime/normalize';

const rule = ( extra = {} ) => ( {
	stylers: [ { color: '#00ff00' } ],
	...extra,
} );

describe( 'normalizeCustomization', () => {
	// The same cases run against Config_Normalizer in the PHP smoke suite.
	it.each( cases.map( ( entry ) => [ entry.name, entry ] ) )(
		'%s',
		( name, { input, expected } ) => {
			expect( normalizeCustomization( input ) ).toEqual( expected );
		}
	);

	it( 'never returns a value the SDK dereferences without a check', () => {
		const hostile = [
			null,
			{ stylers: null },
			{ stylers: [ null ] },
			{ tags: { all: [ null ] }, stylers: [ { color: '#f00' } ] },
		];
		const serialized = JSON.stringify( normalizeCustomization( hostile ) );

		expect( serialized ).toBe( '[]' );
		expect( serialized ).not.toContain( 'null' );
	} );

	it( 'is idempotent', () => {
		cases.forEach( ( { expected } ) =>
			expect( normalizeCustomization( expected ) ).toEqual( expected )
		);
	} );

	it( 'does not modify its input', () => {
		const input = [
			{ tags: { any: [ 'a', 'a' ] }, stylers: { scale: 500 } },
		];
		const snapshot = JSON.stringify( input );

		normalizeCustomization( input );

		expect( JSON.stringify( input ) ).toBe( snapshot );
	} );

	it( 'keeps at most the supported number of rules', () => {
		const rules = Array.from(
			{ length: MAX_CUSTOMIZATION_RULES + 10 },
			() => rule()
		);

		expect( normalizeCustomization( rules ) ).toHaveLength(
			MAX_CUSTOMIZATION_RULES
		);
		expect( validateCustomization( rules ) ).toEqual( [
			{ code: 'too_many_rules', rule: MAX_CUSTOMIZATION_RULES, path: '' },
		] );
	} );

	it( 'stops at the total value budget instead of emitting partial rules', () => {
		const tags = Array.from(
			{ length: MAX_CUSTOMIZATION_TAGS },
			( unused, index ) => `tag_${ index }`
		);
		// Each rule costs its tags plus one styler property.
		const perRule = MAX_CUSTOMIZATION_TAGS + 1;
		const fitting = Math.floor( MAX_CUSTOMIZATION_VALUES / perRule );
		const rules = Array.from( { length: fitting + 5 }, () =>
			rule( { tags: { any: tags } } )
		);
		const normalized = normalizeCustomization( rules );

		expect( normalized ).toHaveLength( fitting );
		normalized.forEach( ( entry ) =>
			expect( entry.tags.any ).toHaveLength( MAX_CUSTOMIZATION_TAGS )
		);
		expect( validateCustomization( rules ) ).toEqual( [
			{ code: 'too_large', rule: fitting, path: '' },
		] );
	} );

	it( 'rejects an oversized tag list and caps stylers per rule', () => {
		const tooManyTags = Array.from(
			{ length: MAX_CUSTOMIZATION_TAGS + 1 },
			( unused, index ) => `tag_${ index }`
		);
		const stylers = Array.from(
			{ length: MAX_CUSTOMIZATION_STYLERS + 3 },
			() => ( { opacity: 0.5 } )
		);

		expect(
			normalizeCustomization( [ rule( { tags: { all: tooManyTags } } ) ] )
		).toEqual( [] );
		expect(
			normalizeCustomization( [ { stylers } ] )[ 0 ].stylers
		).toHaveLength( MAX_CUSTOMIZATION_STYLERS );
		expect( validateCustomization( [ { stylers } ] ) ).toEqual( [
			{
				code: 'too_many_stylers',
				rule: 0,
				path: `stylers[${ MAX_CUSTOMIZATION_STYLERS }]`,
			},
		] );
	} );

	it( 'is applied to the runtime configuration', () => {
		expect(
			normalizeConfig( { customization: [ null, rule() ] } ).customization
		).toEqual( [ rule() ] );
		expect( normalizeConfig( {} ).customization ).toEqual( [] );
	} );
} );

describe( 'validateCustomization', () => {
	it( 'accepts documented rules', () => {
		cases.forEach( ( { expected } ) =>
			expect( validateCustomization( expected ) ).toEqual( [] )
		);
	} );

	it( 'locates each discarded part', () => {
		expect(
			validateCustomization( [
				null,
				{ tags: { some: [ 'water' ] }, stylers: { color: '#f00' } },
				{ types: 'circle', stylers: { color: '#f00' } },
				{ elements: [ 'label', 'bogus' ], stylers: { color: '#f00' } },
				{ tags: 'water' },
				{ tags: 'water', stylers: 'red' },
				{
					tags: 'water',
					stylers: [ null, { color: 'red', glow: 1, opacity: 0.5 } ],
				},
			] )
		).toEqual( [
			{ code: 'rule', rule: 0, path: '' },
			{ code: 'value', rule: 1, path: 'tags' },
			{ code: 'value', rule: 2, path: 'types' },
			{ code: 'value', rule: 3, path: 'elements' },
			{ code: 'no_stylers', rule: 4, path: 'stylers' },
			{ code: 'value', rule: 5, path: 'stylers' },
			{ code: 'value', rule: 6, path: 'stylers[0]' },
			{ code: 'key', rule: 6, path: 'stylers[1].glow' },
			{ code: 'value', rule: 6, path: 'stylers[1].color' },
		] );
	} );

	it( 'does not report clamped numbers or ignored rule keys', () => {
		expect(
			validateCustomization( [
				{ note: 'x', stylers: { saturation: 9, zoom: [ 21, 3 ] } },
			] )
		).toEqual( [] );
	} );

	it( 'reports nothing for a value that is not a list', () => {
		expect( validateCustomization( { style: [] } ) ).toEqual( [] );
	} );
} );

describe( 'estimateRasterStyleLength', () => {
	it( 'is zero without rules', () => {
		expect( estimateRasterStyleLength( [] ) ).toBe( 0 );
	} );

	it( 'matches the style string the SDK sends for raster tiles', () => {
		// Observed tile URL for this rule:
		// tags.any:water;road;admin;poi|elements:geometry;label.text.fill|stylers[1-21].color:100000|stylers[1-21].opacity:0.9
		const observed = normalizeCustomization( [
			{
				tags: { any: [ 'water', 'road', 'admin', 'poi' ] },
				elements: [ 'geometry', 'label.text.fill' ],
				stylers: [
					{ color: '#100000', opacity: 0.9, zoom: [ 1, 21 ] },
				],
			},
		] );

		expect( estimateRasterStyleLength( observed ) ).toBe( 116 );
		// Rules are joined with one separator character.
		expect(
			estimateRasterStyleLength( [ ...observed, ...observed ] )
		).toBe( 116 * 2 + 1 );
	} );

	it( 'counts every selector and styler form', () => {
		const length = estimateRasterStyleLength(
			normalizeCustomization( [
				{
					tags: 'water',
					types: 'polygon',
					stylers: [ { visibility: 'off' }, { scale: 2, zoom: 5 } ],
				},
			] )
		);

		expect( length ).toBe(
			'tags.all:water|types:polygon|stylers.visibility:off|stylers[5].scale:2'
				.length
		);
	} );
} );
