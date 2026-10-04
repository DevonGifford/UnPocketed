/// <reference types="nativewind/types" />

// `import "./global.css"` is a side-effect import that Metro resolves through
// the NativeWind transform; TypeScript needs to be told the module exists.
declare module "*.css";
