module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.jest.json',
    }],
  },
  moduleNameMapper: {
    '^ssignal$': '<rootDir>/node_modules/ssignal/lib/ssignal.cjs.js',
  },
  coverageReporters: ['clover', 'json', 'lcov'],
  reporters: [
    'default'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: -10,
    }
  }
};
