module.exports = {
  roots: ['<rootDir>/src/test/unit', '<rootDir>/src/main'],
  testRegex: '(/src/test/.*|\\.(test|spec))\\.(ts|js)$',
  testPathIgnorePatterns: ['<rootDir>/src/test/unit/assets/analytics/analyticsTestUtils.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  collectCoverageFrom: ['<rootDir>/src/main/**/*.ts', '!<rootDir>/src/main/**/*.d.ts'],
  transform: {
    '^.+\\.ts?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};
