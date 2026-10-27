import js from '@eslint/js';
import globals from 'globals';

export default [
    {
        ignores: ['node_modules/**', 'out/**', '*.vsix']
    },
    js.configs.recommended,
    {
        files: ['extension.js', 'lib/**/*.js', 'test/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node
            }
        },
        rules: {
            curly: 'warn',
            eqeqeq: 'warn',
            semi: 'warn',
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
        }
    }
];
