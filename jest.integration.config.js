const base = require("./jest.config");

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  roots: ["<rootDir>/tests/integration"],
  testPathIgnorePatterns: [],
  testTimeout: 30000,
  collectCoverageFrom: undefined,
  coverageThreshold: undefined,
};
