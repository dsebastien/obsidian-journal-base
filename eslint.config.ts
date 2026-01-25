import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'
import obsidianmd from 'eslint-plugin-obsidianmd'

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    // @ts-expect-error - obsidianmd types are incomplete but the config works at runtime
    ...obsidianmd.configs['recommended'],
    eslintConfigPrettier,
    {
        ignores: [
            '**/dist/**',
            '**/node_modules/**',
            'scripts/**',
            '.cz-config.cjs',
            'prettier.config.cjs',
            'package.json'
        ]
    },
    {
        files: ['**/*.{js,mjs,cjs,ts}'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.browser,
                // Obsidian global functions
                createDiv: 'readonly',
                createEl: 'readonly',
                createSpan: 'readonly',
                createFragment: 'readonly'
            },
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
            ],
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-deprecated': 'off',
            // These are too strict for dynamic plugin APIs
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            // Obsidian methods are dynamically added to prototypes
            '@typescript-eslint/no-unsafe-enum-comparison': 'off',
            '@typescript-eslint/no-redundant-type-constituents': 'off',
            'no-prototype-builtins': 'off',
            // Disable dependency ban rule - lint-staged is intentionally used
            'depend/ban-dependencies': 'off',
            // Allow confirm for delete confirmations
            'no-alert': 'off',
            // Disable sentence case rule - it has false positives for already-correct text
            'obsidianmd/ui/sentence-case': 'off',
            // innerHTML is safely used in Obsidian plugin patterns with sanitized content
            '@microsoft/sdl/no-inner-html': 'off',
            // Allow direct style assignments - common pattern in Obsidian plugins
            'obsidianmd/no-static-styles-assignment': 'off',
            // Allow manual HTML headings in settings tab (existing pattern)
            'obsidianmd/settings-tab/no-manual-html-headings': 'off',
            // CodeMirror is bundled with Obsidian, not a direct dependency
            'import/no-extraneous-dependencies': 'off',
            // TFile casting is sometimes needed when types are not precise
            'obsidianmd/no-tfile-tfolder-cast': 'warn',
            // Promise rules as warnings - should be addressed but don't block builds
            '@typescript-eslint/no-floating-promises': 'warn',
            '@typescript-eslint/no-misused-promises': 'warn',
            // Unnecessary type assertions as warnings
            '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
            // Console allowed only for warn/error/debug
            'no-console': ['error', { allow: ['warn', 'error', 'debug'] }]
        }
    },
    // Allow console in the log utility since it wraps console methods
    {
        files: ['**/utils/log.ts'],
        rules: {
            'no-console': 'off'
        }
    }
)
