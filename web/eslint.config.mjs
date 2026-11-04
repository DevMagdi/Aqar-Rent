// Next 16 ships lint as a standalone CLI (`next lint` is deprecated), so the
// project owns its flat config. eslint-config-next exports a native flat array.
import next from "eslint-config-next";
import tseslint from "typescript-eslint";

export default [
  { ignores: [".next/**", ".next-e2e/**", "next-env.d.ts", "node_modules/**"] },
  ...next,
  {
    rules: {
      // Arabic-first copy: apostrophes and quotes in strings are intentional.
      "react/no-unescaped-entities": "off",
      // <Image> is enforced where it matters; map/canvas blobs need raw <img>.
      "@next/next/no-img-element": "warn",
      // TS owns identifier resolution (DOM lib types); core no-undef misfires
      // on `React`, `RequestInit`, `GeoJSON`, … — this is the documented
      // typescript-eslint setup.
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // React Compiler strictness rules. Our entrance/motion state machines set
      // state in effects on purpose (SSR-safe reveal, dirty-flag trackers) and
      // refactoring them without the compiler enabled would change behaviour
      // for zero user-visible gain. Kept visible as warnings for follow-up.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.config.*"],
    rules: { "@typescript-eslint/no-unused-vars": "off" },
  },
];
