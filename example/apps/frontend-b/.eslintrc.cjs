/* jshint esversion: 9 */

/** @type {import('eslint').ESLint} */
const config = {
	env: {
		es6: true,
		node: true,
	},
	extends: ['../../.eslintrc.cjs'],
	ignorePatterns: ['!**/*'],
	overrides: [
		{
			files: ['*.ts', '*.js'],
			parserOptions: {
				project: ['apps/frontend-b/tsconfig.*?.json'],
			},
		},
	],
};

module.exports = config;
