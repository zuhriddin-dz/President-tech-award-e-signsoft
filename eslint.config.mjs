// The real config lives in @docflow/config so every workspace lints identically.
// ESLint resolves this root file for every package (flat-config lookup walks up).
import docflowConfig from './packages/config/eslint.mjs';

export default docflowConfig;
