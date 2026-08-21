import { registerBlockType } from '@wordpress/blocks';

import metadata from './block.json';
import deprecated from './deprecated';
import Edit from './edit';
import './editor.scss';
import './style.scss';

registerBlockType( metadata.name, {
	deprecated,
	edit: Edit,
	save: () => null,
} );
