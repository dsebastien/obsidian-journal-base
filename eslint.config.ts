import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'
import obsidianmd from 'eslint-plugin-obsidianmd'

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    // eslint-plugin-obsidianmd 0.4.x ships complete config types, so the
    // `@ts-expect-error` this line used to carry is no longer needed.
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
                createFragment: 'readonly',
                // Obsidian popout-window-aware globals
                activeDocument: 'readonly',
                activeWindow: 'readonly'
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
            // Allow confirm for delete confirmations
            'no-alert': 'off',
            // Sentence case is a community-review requirement, so the rule is an
            // ERROR here rather than off. The catalog reviewer runs its OWN
            // ruleset against the source archive, so switching it off locally
            // suppresses nothing on their side — it only hides the finding until
            // submission. It compares every UI string against a word list, so the
            // vocabulary this plugin's copy uses has to be declared or correct
            // text gets reported:
            //
            // - `brands` REPLACES the plugin's default list (`?? DEFAULT_BRANDS`),
            //   so this array must carry every brand this codebase names, this
            //   plugin's own Base view names included. A new brand in a UI string
            //   is reported until it is added here — loud, which is the point.
            // - `ignoreRegex` matches whole strings: an input placeholder that is
            //   a sentence fragment, a frontmatter property key that must stay
            //   lowercase, and the fleet-wide newsletter line kept byte-identical
            //   with `obsidian-plugin-template`.
            'obsidianmd/ui/sentence-case': [
                'error',
                {
                    enforceCamelCaseLower: true,
                    brands: [
                        // Defaults this codebase relies on
                        'Obsidian',
                        'Obsidian Sync',
                        'Obsidian Publish',
                        'iCloud',
                        'iOS',
                        'macOS',
                        'Windows',
                        'Linux',
                        'Android',
                        'GitHub',
                        'GitHub Sponsors',
                        'Git',
                        'YouTube',
                        'Markdown',
                        'JavaScript',
                        'TypeScript',
                        'Node.js',
                        // Obsidian's own feature name for `.base` files and the
                        // views they host; the manifest description uses it too.
                        'Base',
                        // The two Base views this plugin registers, spelled
                        // exactly as `registerBasesView` names them
                        // (`src/app/plugin.ts:219/235`). "Periodic Notes" is also
                        // the external plugin this one syncs settings from.
                        'Periodic Notes',
                        'Periodic Review',
                        // Community this plugin's support CTAs link to
                        'Knowii'
                    ],
                    ignoreRegex: [
                        // Placeholder fragments, not sentences
                        '^e\\.g\\.',
                        // Frontmatter property key — lowercase is the contract
                        'periodic_review_completed',
                        // Fleet-wide template copy, kept byte-identical
                        'Personal Knowledge Management'
                    ]
                }
            ],
            // innerHTML is safely used in Obsidian plugin patterns with sanitized content
            '@microsoft/sdl/no-inner-html': 'off',
            // CodeMirror is bundled with Obsidian, not a direct dependency
            'import/no-extraneous-dependencies': 'off',
            // Promise rules as warnings - should be addressed but don't block builds
            '@typescript-eslint/no-floating-promises': 'warn',
            '@typescript-eslint/no-misused-promises': 'warn',
            // Unnecessary type assertions as warnings
            '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
            // Console allowed only for warn/error/debug
            // Matches what obsidianmd/rule-custom-message enforces on the
            // reviewer's side. `src/utils/log.ts` is the only module that may
            // touch the console at all, and only behind the `debugModeEnabled`
            // setting; it needs no per-file exemption from this list.
            'no-console': ['error', { allow: ['warn', 'error', 'debug'] }]
        }
    }
)
