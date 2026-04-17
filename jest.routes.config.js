module.exports = {
  roots: ['<rootDir>/src/test/routes'],
  testRegex: '(/src/test/.*|\\.(test|spec))\\.(ts|js)$',
  testPathIgnorePatterns: ['<rootDir>/src/test/routes/routeTestUtils.ts', '<rootDir>/src/test/routes/setup.ts'],
  clearMocks: true,
  resetModules: true,
  setupFiles: ['<rootDir>/src/test/routes/setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  testTimeout: 30000,
  transform: {
    '^.+\\.ts?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};
