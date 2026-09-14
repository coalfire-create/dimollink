import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      // 에이전트 작업용 git worktree — 리포 소스가 아니라 다른 브랜치의 사본이다.
      // 여기까지 린트하면 남의 브랜치 오류로 `npm run lint` 가 항상 실패한다.
      '.claude/**',
      '**/dist/**',
      '**/build/**',
      '**/.expo/**',
      'apps/api/public/**',
      'apps/vision-web/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    /**
     * CLAUDE.md 디자인 기준을 화면 코드에서 강제한다.
     *
     * 토큰 값 자체는 유닛 테스트(apps/api/src/design/design-tokens.test.ts)가 지키는데,
     * 정작 화면에서 토큰을 안 쓰고 숫자·색을 직접 박아 넣으면 그 테스트는 통과한다.
     * 실제로 18px 미만 글자가 30곳, 8px 배수가 아닌 여백이 125곳, 팔레트 밖 색이
     * 20개 파일에 쌓여 있었다. 그래서 "박아 넣은 값"을 여기서 막는다.
     *
     * 예외가 필요하면 값을 그 자리에 다시 박지 말고 @dimol/shared 의 토큰에 이름을
     * 붙여 추가한다(GLYPH_SIZES, STATUS_COLORS 가 그렇게 생겼다).
     */
    files: ['apps/mobile/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Property[key.name='fontSize'] > Literal[value<18]",
          message:
            '글자 크기는 18px 이상이어야 합니다(CLAUDE.md). theme.font 토큰을 쓰고, 기호(✓ × ▾)라면 theme.glyph 를 쓰세요.',
        },
        {
          selector:
            "Property[key.name=/^(padding|margin|gap)([A-Z][a-zA-Z]*)?$/] > Literal[value>0][value!=4]:not([value=8]):not([value=16]):not([value=24]):not([value=32]):not([value=40]):not([value=48]):not([value=56]):not([value=64]):not([value=72]):not([value=80]):not([value=88]):not([value=96])",
          message:
            '여백은 8px 배수만 씁니다(CLAUDE.md). theme.spacing 토큰(xs 8 / sm 16 / md 24 / lg 32)을 쓰세요.',
        },
        {
          selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
          message:
            '색은 팔레트 밖으로 나가지 않습니다(CLAUDE.md: 메인 1 + 보조 1). theme.colors 토큰을 쓰고, 새 색이 꼭 필요하면 @dimol/shared 의 COLORS/STATUS_COLORS 에 이름을 붙여 추가하세요.',
        },
      ],
    },
  },
  {
    // CommonJS 설정 파일 (metro/babel 등) — Node 전역 + require 허용.
    files: ['**/*.config.js', '**/*.cjs'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs',
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
