// Registers the custom matchers from @testing-library/jest-dom (e.g.
// `toBeInTheDocument`) with TypeScript. The matchers are loaded at runtime in
// jest.setup.cjs; this import makes their type augmentation visible to tsc.
import '@testing-library/jest-dom';
